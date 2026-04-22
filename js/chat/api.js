import { supabase } from "../supabase.js";
import {
  STORAGE_BUCKETS,
  buildChatFilePath,
  formatStorageError,
  getPublicUrlOrThrow
} from "../storage.js";

function throwIfError(error, context) {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function friendshipFilter(userId, friendId) {
  return `and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`;
}

function conversationFilter(userId, friendId) {
  return `and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`;
}

export async function requireAuthenticatedUser() {
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUser = sessionData?.session?.user || null;

  if (sessionUser) {
    return sessionUser;
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    window.location.href = "login.html";
    return null;
  }

  return user;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

export async function searchUserByUsername(username) {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, avatar_url")
    .eq("username", username)
    .maybeSingle();

  throwIfError(error, "Failed to search user");
  return data;
}

export async function getFriendshipBetween(userId, friendId) {
  const { data, error } = await supabase
    .from("friends")
    .select("id, user_id, friend_id, status")
    .or(friendshipFilter(userId, friendId));

  throwIfError(error, "Failed to check friendship status");

  if (!data || data.length === 0) return null;
  const accepted = data.find((row) => row.status === "accepted");
  if (accepted) return accepted;

  const incomingPending = data.find(
    (row) => row.status === "pending" && row.user_id === friendId
  );
  if (incomingPending) return incomingPending;

  return data.find((row) => row.status === "pending") || data[0];
}

export async function sendFriendRequest(userId, friendId) {
  if (userId === friendId) {
    return { type: "self" };
  }

  const relation = await getFriendshipBetween(userId, friendId);

  if (relation?.status === "accepted") {
    return { type: "already_friends" };
  }

  if (relation?.status === "pending") {
    if (relation.user_id === userId) {
      return { type: "already_sent" };
    }

    const { error: acceptError } = await supabase
      .from("friends")
      .update({ status: "accepted" })
      .eq("id", relation.id);

    throwIfError(acceptError, "Failed to accept incoming request");
    return { type: "auto_accepted" };
  }

  const { error } = await supabase.from("friends").insert([
    {
      user_id: userId,
      friend_id: friendId,
      status: "pending"
    }
  ]);

  throwIfError(error, "Failed to send friend request");
  return { type: "sent" };
}

export async function listIncomingRequests(userId) {
  const { data, error } = await supabase
    .from("friends")
    .select(`
      id,
      user_id,
      users!friends_user_id_fkey(
        id,
        username,
        avatar_url
      )
    `)
    .eq("friend_id", userId)
    .eq("status", "pending");

  throwIfError(error, "Failed to load friend requests");

  const uniqueBySender = new Map();

  for (const row of data || []) {
    if (!uniqueBySender.has(row.user_id)) {
      uniqueBySender.set(row.user_id, {
        id: row.id,
        userId: row.user_id,
        username: row.users?.username || "Unknown user",
        avatarUrl: row.users?.avatar_url || ""
      });
    }
  }

  return Array.from(uniqueBySender.values());
}

export async function acceptFriendRequest(requestId) {
  const { error } = await supabase
    .from("friends")
    .update({ status: "accepted" })
    .eq("id", requestId);

  throwIfError(error, "Failed to accept friend request");
}

export async function listAcceptedFriends(userId) {
  const { data, error } = await supabase
    .from("friends")
    .select("id, user_id, friend_id")
    .eq("status", "accepted")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  throwIfError(error, "Failed to load friends");

  const uniqueFriends = new Map();

  for (const row of data || []) {
    const friendId = row.user_id === userId ? row.friend_id : row.user_id;
    if (!friendId || friendId === userId) continue;

    if (!uniqueFriends.has(friendId)) {
      uniqueFriends.set(friendId, {
        relationId: row.id,
        friendId,
        createdAt: null
      });
    }
  }

  return Array.from(uniqueFriends.values());
}

export async function fetchUsersByIds(userIds) {
  if (!userIds.length) return [];

  const { data, error } = await supabase
    .from("users")
    .select("id, username, avatar_url")
    .in("id", userIds);

  throwIfError(error, "Failed to load user profiles");
  return data || [];
}

export async function listMessageOverviewForUser(userId) {
  const { data, error } = await supabase
    .from("messages")
    .select("sender_id, receiver_id, created_at, read")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  throwIfError(error, "Failed to load message overview");

  const latestByFriend = new Map();
  const unreadByFriend = new Map();

  for (const message of data || []) {
    const friendId =
      message.sender_id === userId
        ? message.receiver_id
        : message.sender_id;

    if (!latestByFriend.has(friendId)) {
      latestByFriend.set(friendId, message.created_at);
    }

    if (message.receiver_id === userId && !message.read) {
      const currentCount = unreadByFriend.get(friendId) || 0;
      unreadByFriend.set(friendId, currentCount + 1);
    }
  }

  return { latestByFriend, unreadByFriend };
}

export async function listConversationMessages(userId, friendId) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, receiver_id, message, file_url, read, created_at")
    .or(conversationFilter(userId, friendId))
    .order("created_at", { ascending: true });

  throwIfError(error, "Failed to load chat history");
  return data || [];
}

export async function sendTextMessage(userId, friendId, message) {
  const { error } = await supabase
    .from("messages")
    .insert([
      {
        sender_id: userId,
        receiver_id: friendId,
        message
      }
    ]);

  throwIfError(error, "Failed to send message");
}

export async function sendFileMessage(userId, friendId, file) {
  const filePath = buildChatFilePath(userId, file.name);

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKETS.CHAT_FILES)
    .upload(filePath, file, { upsert: false });

  if (uploadError) {
    throw new Error(
      formatStorageError(uploadError, STORAGE_BUCKETS.CHAT_FILES, "File upload")
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKETS.CHAT_FILES)
    .getPublicUrl(filePath);

  const publicUrl = getPublicUrlOrThrow(publicUrlData, "Chat file URL generation");

  const { error: messageError } = await supabase
    .from("messages")
    .insert([
      {
        sender_id: userId,
        receiver_id: friendId,
        message: "",
        file_url: publicUrl
      }
    ]);

  if (messageError) {
    await supabase.storage
      .from(STORAGE_BUCKETS.CHAT_FILES)
      .remove([filePath]);

    throwIfError(messageError, "Failed to save file message");
  }
}

export async function deleteMessageById(messageId, userId) {
  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", messageId)
    .eq("sender_id", userId);

  throwIfError(error, "Failed to delete message");
}

export async function markConversationAsRead(userId, friendId) {
  const { error } = await supabase
    .from("messages")
    .update({ read: true })
    .eq("sender_id", friendId)
    .eq("receiver_id", userId)
    .eq("read", false);

  throwIfError(error, "Failed to mark messages as read");
}

export async function upsertPresence(userId) {
  const { error } = await supabase
    .from("presence")
    .upsert({
      user_id: userId,
      last_seen: new Date().toISOString()
    });

  throwIfError(error, "Failed to update presence");
}

export async function getPresenceForUser(userId) {
  const { data, error } = await supabase
    .from("presence")
    .select("user_id, last_seen")
    .eq("user_id", userId)
    .maybeSingle();

  throwIfError(error, "Failed to load presence");
  return data;
}
