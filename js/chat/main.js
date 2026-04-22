import { supabase } from "../supabase.js";
import * as api from "./api.js";
import { dom } from "./dom.js";
import { createRealtimeManager } from "./realtime.js";
import {
  FALLBACK_REFRESH_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS
} from "./constants.js";
import {
  appState,
  getFriendById,
  setFriendRequests,
  setFriends,
  setSelectedFriendId
} from "./state.js";
import {
  clearPresence,
  renderChatPlaceholder,
  renderFriendRequests,
  renderFriendsList,
  renderMessages,
  renderPresence,
  renderSearchMessage,
  renderSearchUser,
  setChatHeader
} from "./ui.js";

let realtimeManager = null;
let heartbeatTimer = null;
let fallbackRefreshTimer = null;
let authSubscription = null;
let friendRequestRefreshTimer = null;
let friendRefreshTimer = null;
let conversationRefreshTimer = null;
let presenceRefreshTimer = null;
let friendRequestsRequestId = 0;
let friendsRequestId = 0;
let conversationRequestId = 0;
let presenceRequestId = 0;

function showActionError(error) {
  alert(error.message || "Something went wrong.");
}

function clearTimer(timerId) {
  if (timerId) {
    clearTimeout(timerId);
  }
}

function scheduleFriendRequestsRefresh(delay = 120) {
  clearTimer(friendRequestRefreshTimer);
  friendRequestRefreshTimer = setTimeout(() => {
    refreshFriendRequests({ silent: true });
  }, delay);
}

function scheduleFriendsRefresh(delay = 120) {
  clearTimer(friendRefreshTimer);
  friendRefreshTimer = setTimeout(() => {
    refreshFriends({ silent: true });
  }, delay);
}

function scheduleConversationRefresh(delay = 120) {
  clearTimer(conversationRefreshTimer);
  conversationRefreshTimer = setTimeout(() => {
    refreshConversation({ silent: true });
  }, delay);
}

function schedulePresenceRefresh(delay = 120) {
  clearTimer(presenceRefreshTimer);
  presenceRefreshTimer = setTimeout(() => {
    refreshPresence({ silent: true });
  }, delay);
}

async function refreshFriendRequests({ silent = false } = {}) {
  const requestId = ++friendRequestsRequestId;

  try {
    const requests = await api.listIncomingRequests(appState.currentUser.id);

    if (requestId !== friendRequestsRequestId) {
      return;
    }

    setFriendRequests(requests);
    renderFriendRequests(dom.friendRequests, requests, handleAcceptRequest);
  } catch (error) {
    if (!silent) {
      showActionError(error);
    }
  }
}

function buildFriendList(acceptedFriendRows, profiles, messageOverview) {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const friends = acceptedFriendRows.map((row) => {
    const profile = profileById.get(row.friendId);

    return {
      id: row.friendId,
      username: profile?.username || "Unknown user",
      avatar_url: profile?.avatar_url || "",
      unreadCount: messageOverview.unreadByFriend.get(row.friendId) || 0,
      lastMessageAt: messageOverview.latestByFriend.get(row.friendId) || row.createdAt
    };
  });

  friends.sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;

    if (bTime !== aTime) {
      return bTime - aTime;
    }

    return a.username.localeCompare(b.username);
  });

  return friends;
}

function renderCurrentFriendList() {
  renderFriendsList(
    dom.friendsList,
    appState.friends,
    appState.selectedFriendId,
    openChat
  );
}

function clearOpenChat() {
  setSelectedFriendId(null);
  setChatHeader(dom.chatUserTitle, "");
  clearPresence(dom.chatStatus);
  renderChatPlaceholder(dom.chatMessages);
  renderCurrentFriendList();
}

async function refreshFriends({ silent = false } = {}) {
  const requestId = ++friendsRequestId;

  try {
    const [friendRows, messageOverview] = await Promise.all([
      api.listAcceptedFriends(appState.currentUser.id),
      api.listMessageOverviewForUser(appState.currentUser.id)
    ]);

    const friendIds = friendRows.map((row) => row.friendId);
    const profiles = await api.fetchUsersByIds(friendIds);

    if (requestId !== friendsRequestId) {
      return;
    }

    const friends = buildFriendList(friendRows, profiles, messageOverview);
    setFriends(friends);

    if (
      appState.selectedFriendId &&
      !friends.some((friend) => friend.id === appState.selectedFriendId)
    ) {
      clearOpenChat();
      return;
    }

    renderCurrentFriendList();
  } catch (error) {
    if (!silent) {
      showActionError(error);
    }
  }
}

async function refreshConversation({ silent = false } = {}) {
  if (!appState.selectedFriendId) {
    renderChatPlaceholder(dom.chatMessages);
    return;
  }

  const requestId = ++conversationRequestId;
  const friendId = appState.selectedFriendId;

  try {
    const messages = await api.listConversationMessages(appState.currentUser.id, friendId);

    if (requestId !== conversationRequestId) {
      return;
    }

    renderMessages(
      dom.chatMessages,
      messages,
      appState.currentUser.id,
      handleDeleteMessage
    );

    try {
      await api.markConversationAsRead(appState.currentUser.id, friendId);
    } catch (_error) {
      // Keep chat usable even if read receipts fail.
    }

    scheduleFriendsRefresh(0);
  } catch (error) {
    if (!silent) {
      showActionError(error);
    }
  }
}

async function refreshPresence({ silent = true } = {}) {
  if (!appState.selectedFriendId) {
    clearPresence(dom.chatStatus);
    return;
  }

  const requestId = ++presenceRequestId;

  try {
    const presence = await api.getPresenceForUser(appState.selectedFriendId);
    if (requestId !== presenceRequestId) {
      return;
    }
    renderPresence(dom.chatStatus, presence);
  } catch (_error) {
    if (requestId !== presenceRequestId) {
      return;
    }
    clearPresence(dom.chatStatus);
    dom.chatStatus.textContent = "Status unavailable";
    if (!silent) {
      showActionError(new Error("Unable to load presence right now."));
    }
  }
}

async function openChat(friendId) {
  const friend = getFriendById(friendId);
  if (!friend) return;

  setSelectedFriendId(friendId);
  setChatHeader(dom.chatUserTitle, friend.username);
  renderCurrentFriendList();

  await refreshConversation();
  await refreshPresence();
}

async function restoreSelectedChat() {
  if (!appState.selectedFriendId) {
    renderChatPlaceholder(dom.chatMessages);
    clearPresence(dom.chatStatus);
    return;
  }

  const friend = getFriendById(appState.selectedFriendId);
  if (!friend) {
    clearOpenChat();
    return;
  }

  await openChat(friend.id);
}

async function handleSearch() {
  const username = dom.searchUserInput.value.trim().toLowerCase();

  if (!username) {
    renderSearchMessage(dom.searchResult, "Enter a username to search.");
    return;
  }

  try {
    const user = await api.searchUserByUsername(username);

    if (!user) {
      renderSearchMessage(dom.searchResult, "User not found.");
      return;
    }

    if (user.id === appState.currentUser.id) {
      renderSearchMessage(dom.searchResult, "This is your own account.");
      return;
    }

    const relation = await api.getFriendshipBetween(appState.currentUser.id, user.id);

    if (relation?.status === "accepted") {
      renderSearchMessage(dom.searchResult, "Already in your friends list.");
      return;
    }

    if (relation?.status === "pending" && relation.user_id === appState.currentUser.id) {
      renderSearchMessage(dom.searchResult, "Friend request already sent.");
      return;
    }

    if (relation?.status === "pending") {
      renderSearchMessage(
        dom.searchResult,
        "This user sent you a request. Accept it in Friend Requests."
      );
      return;
    }

    renderSearchUser(dom.searchResult, user, handleSendRequest);
  } catch (error) {
    showActionError(error);
  }
}

async function handleSendRequest(friendId) {
  try {
    const result = await api.sendFriendRequest(appState.currentUser.id, friendId);

    if (result.type === "self") {
      renderSearchMessage(dom.searchResult, "You cannot add yourself.");
      return;
    }

    if (result.type === "already_friends") {
      renderSearchMessage(dom.searchResult, "Already friends.");
      return;
    }

    if (result.type === "already_sent") {
      renderSearchMessage(dom.searchResult, "Friend request already sent.");
      return;
    }

    if (result.type === "auto_accepted") {
      renderSearchMessage(dom.searchResult, "Request auto-accepted. You are now friends.");
      await Promise.all([refreshFriendRequests(), refreshFriends()]);
      return;
    }

    renderSearchMessage(dom.searchResult, "Friend request sent.");
    await Promise.all([refreshFriendRequests(), refreshFriends()]);
  } catch (error) {
    showActionError(error);
  }
}

async function handleAcceptRequest(requestId) {
  try {
    await api.acceptFriendRequest(requestId);
    await Promise.all([refreshFriendRequests(), refreshFriends()]);
  } catch (error) {
    showActionError(error);
  }
}

async function handleSendMessage(event) {
  event.preventDefault();

  const message = dom.messageInput.value.trim();
  if (!message) return;

  if (!appState.selectedFriendId) {
    alert("Select a friend first.");
    return;
  }

  try {
    await api.sendTextMessage(
      appState.currentUser.id,
      appState.selectedFriendId,
      message
    );

    dom.messageInput.value = "";
    await refreshConversation();
  } catch (error) {
    showActionError(error);
  }
}

async function handleSendFile(event) {
  event.preventDefault();

  if (!appState.selectedFriendId) {
    alert("Select a friend first.");
    return;
  }

  const file = dom.fileInput.files?.[0];
  if (!file) {
    alert("Please choose a file first.");
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    alert("File is too large. Please upload a file under 20 MB.");
    return;
  }

  try {
    await api.sendFileMessage(
      appState.currentUser.id,
      appState.selectedFriendId,
      file
    );

    dom.fileInput.value = "";
    await refreshConversation();
  } catch (error) {
    showActionError(error);
  }
}

async function handleDeleteMessage(messageId) {
  if (!confirm("Delete this message?")) {
    return;
  }

  try {
    await api.deleteMessageById(messageId, appState.currentUser.id);
    await refreshConversation();
  } catch (error) {
    showActionError(error);
  }
}

async function heartbeatPresence() {
  try {
    await api.upsertPresence(appState.currentUser.id);
  } catch (_error) {
    // Presence heartbeat failures should not block chat usage.
  }
}

function startHeartbeat() {
  heartbeatPresence();
  heartbeatTimer = setInterval(heartbeatPresence, HEARTBEAT_INTERVAL_MS);
}

function startFallbackRefresh() {
  fallbackRefreshTimer = setInterval(() => {
    scheduleFriendRequestsRefresh(0);
    scheduleFriendsRefresh(0);
    scheduleConversationRefresh(0);
    schedulePresenceRefresh(0);
  }, FALLBACK_REFRESH_INTERVAL_MS);
}

function bindEvents() {
  dom.logoutBtn.addEventListener("click", () => {
    api.logout().catch(showActionError);
  });
  dom.searchBtn.addEventListener("click", handleSearch);
  dom.searchUserInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearch();
    }
  });
  dom.messageForm.addEventListener("submit", handleSendMessage);
  dom.fileForm.addEventListener("submit", handleSendFile);
}

function startRealtime() {
  realtimeManager = createRealtimeManager({
    supabase,
    userId: appState.currentUser.id,
    onMessagesEvent: () => {
      scheduleFriendsRefresh();
      scheduleConversationRefresh();
    },
    onPresenceEvent: (payload) => {
      const changedUserId = payload.new?.user_id || payload.old?.user_id;
      if (changedUserId === appState.selectedFriendId) {
        schedulePresenceRefresh();
      }
    },
    onFriendsEvent: () => {
      scheduleFriendRequestsRefresh();
      scheduleFriendsRefresh();
    },
    onUsersEvent: (payload) => {
      const changedUserId = payload.new?.id || payload.old?.id;
      if (!changedUserId) return;

      const isFriend = appState.friends.some((friend) => friend.id === changedUserId);
      if (changedUserId === appState.currentUser.id || isFriend) {
        scheduleFriendsRefresh();
      }
    }
  });

  realtimeManager.start().catch(() => {
    // Fallback refresh keeps data updated.
  });
}

function setupLifecycleListeners() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      heartbeatPresence();
      scheduleFriendRequestsRefresh(0);
      scheduleFriendsRefresh(0);
      scheduleConversationRefresh(0);
      schedulePresenceRefresh(0);
      realtimeManager?.reconnect();
    }
  });

  window.addEventListener("online", () => {
    scheduleFriendRequestsRefresh(0);
    scheduleFriendsRefresh(0);
    scheduleConversationRefresh(0);
    schedulePresenceRefresh(0);
    realtimeManager?.reconnect();
  });

  window.addEventListener("beforeunload", () => {
    clearInterval(heartbeatTimer);
    clearInterval(fallbackRefreshTimer);
    clearTimer(friendRequestRefreshTimer);
    clearTimer(friendRefreshTimer);
    clearTimer(conversationRefreshTimer);
    clearTimer(presenceRefreshTimer);
    const stopPromise = realtimeManager?.stop();
    stopPromise?.catch(() => {
      // Ignore shutdown channel errors during unload.
    });
    authSubscription?.unsubscribe();
  });

  const authChange = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      window.location.href = "login.html";
    }
  });
  authSubscription = authChange?.data?.subscription ?? null;
}

async function init() {
  try {
    const user = await api.requireAuthenticatedUser();
    if (!user) return;

    appState.currentUser = user;

    bindEvents();
    renderChatPlaceholder(dom.chatMessages);

    await refreshFriendRequests({ silent: true });
    await refreshFriends({ silent: false });
    await restoreSelectedChat();
    await refreshPresence({ silent: true });

    startHeartbeat();
    startRealtime();
    startFallbackRefresh();
    setupLifecycleListeners();
  } catch (error) {
    showActionError(error);
  }
}

init();
