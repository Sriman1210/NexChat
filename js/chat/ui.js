import { DEFAULT_AVATAR, ONLINE_THRESHOLD_SECONDS } from "./constants.js";
import { isImageUrl } from "../storage.js";

function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function formatClock(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function createAvatar(url, alt) {
  const avatar = document.createElement("img");
  avatar.className = "avatar";
  avatar.alt = alt;
  avatar.src = url || DEFAULT_AVATAR;
  return avatar;
}

function createEmptyState(text) {
  const empty = document.createElement("div");
  empty.className = "message-empty";
  empty.textContent = text;
  return empty;
}

function createFriendMetaText(friend) {
  if (!friend.lastMessageAt) return "";
  return formatClock(friend.lastMessageAt);
}

export function renderSearchMessage(container, message) {
  clearNode(container);
  container.appendChild(createEmptyState(message));
}

export function renderSearchUser(container, user, onAdd) {
  clearNode(container);

  const row = document.createElement("div");
  row.className = "row-item";

  const left = document.createElement("div");
  left.className = "row-left";

  const avatar = createAvatar(user.avatar_url, user.username);

  const username = document.createElement("strong");
  username.textContent = user.username;

  left.append(avatar, username);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add Friend";
  addButton.addEventListener("click", () => onAdd(user.id));

  row.append(left, addButton);
  container.appendChild(row);
}

export function renderFriendRequests(container, requests, onAccept) {
  clearNode(container);

  if (!requests.length) {
    container.appendChild(createEmptyState("No pending requests."));
    return;
  }

  requests.forEach((request) => {
    const row = document.createElement("div");
    row.className = "row-item";

    const left = document.createElement("div");
    left.className = "row-left";
    left.append(
      createAvatar(request.avatarUrl, request.username),
      Object.assign(document.createElement("span"), {
        textContent: request.username
      })
    );

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Accept";
    button.addEventListener("click", () => onAccept(request.id));

    row.append(left, button);
    container.appendChild(row);
  });
}

export function renderFriendsList(container, friends, activeFriendId, onOpenChat) {
  clearNode(container);

  if (!friends.length) {
    container.appendChild(createEmptyState("No friends yet."));
    return;
  }

  friends.forEach((friend) => {
    const row = document.createElement("div");
    row.className = `row-item${friend.id === activeFriendId ? " active" : ""}`;
    row.setAttribute("role", "button");
    row.tabIndex = 0;

    row.addEventListener("click", () => onOpenChat(friend.id));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpenChat(friend.id);
      }
    });

    const left = document.createElement("div");
    left.className = "row-left";

    const details = document.createElement("div");
    const username = document.createElement("strong");
    username.textContent = friend.username;
    details.appendChild(username);

    const metaText = createFriendMetaText(friend);
    if (metaText) {
      details.appendChild(document.createElement("br"));

      const meta = document.createElement("span");
      meta.className = "subtle";
      meta.style.fontSize = "12px";
      meta.textContent = metaText;
      details.appendChild(meta);
    }

    left.append(createAvatar(friend.avatar_url, friend.username), details);

    row.appendChild(left);

    if (friend.unreadCount > 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = String(friend.unreadCount);
      row.appendChild(badge);
    }

    container.appendChild(row);
  });
}

export function setChatHeader(titleElement, friendName) {
  titleElement.textContent = friendName
    ? `Chat with ${friendName}`
    : "Select a friend to chat";
}

export function renderMessages(container, messages, currentUserId, onDeleteMessage) {
  clearNode(container);

  if (!messages.length) {
    container.appendChild(createEmptyState("No messages yet. Start the conversation."));
    return;
  }

  messages.forEach((message) => {
    const mine = message.sender_id === currentUserId;

    const row = document.createElement("div");
    row.className = `message-row ${mine ? "mine" : "theirs"}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    if (message.message) {
      const text = document.createElement("div");
      text.className = "message-text";
      text.textContent = message.message;
      bubble.appendChild(text);
    }

    if (message.file_url) {
      const isImageFile = isImageUrl(message.file_url);

      if (isImageFile) {
        const imagePreview = document.createElement("img");
        imagePreview.className = "message-image";
        imagePreview.src = message.file_url;
        imagePreview.alt = "Shared image";
        imagePreview.loading = "lazy";
        bubble.appendChild(imagePreview);
      }

      const fileLink = document.createElement("a");
      fileLink.href = message.file_url;
      fileLink.target = "_blank";
      fileLink.rel = "noopener noreferrer";
      fileLink.textContent = isImageFile ? "Open image" : "Open file";
      bubble.appendChild(fileLink);
    }

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = `${formatClock(message.created_at)}${mine ? ` ${message.read ? "Seen" : "Sent"}` : ""}`;
    bubble.appendChild(meta);

    if (mine) {
      const actions = document.createElement("div");
      actions.className = "message-actions";

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "text-btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => onDeleteMessage(message.id));

      actions.appendChild(deleteBtn);
      bubble.appendChild(actions);
    }

    row.appendChild(bubble);
    container.appendChild(row);
  });

  container.scrollTop = container.scrollHeight;
}

export function renderPresence(statusElement, presenceRecord) {
  clearNode(statusElement);

  if (!presenceRecord?.last_seen) {
    statusElement.textContent = "Status unavailable";
    return;
  }

  const secondsAway = (Date.now() - new Date(presenceRecord.last_seen).getTime()) / 1000;
  const dot = document.createElement("span");
  dot.className = `status-dot ${secondsAway <= ONLINE_THRESHOLD_SECONDS ? "online" : "offline"}`;
  statusElement.appendChild(dot);

  const text = document.createElement("span");
  text.textContent =
    secondsAway <= ONLINE_THRESHOLD_SECONDS
      ? "Online"
      : `Last seen at ${formatClock(presenceRecord.last_seen)}`;
  statusElement.appendChild(text);
}

export function clearPresence(statusElement) {
  clearNode(statusElement);
  statusElement.textContent = "";
}

export function renderChatPlaceholder(container) {
  clearNode(container);
  container.appendChild(createEmptyState("Choose a friend to open chat history."));
}
