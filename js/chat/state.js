import { STORAGE_KEYS } from "./constants.js";

const storedFriendId = localStorage.getItem(STORAGE_KEYS.SELECTED_FRIEND);

export const appState = {
  currentUser: null,
  selectedFriendId: storedFriendId || null,
  friends: [],
  friendRequests: []
};

export function setSelectedFriendId(friendId) {
  appState.selectedFriendId = friendId;

  if (friendId) {
    localStorage.setItem(STORAGE_KEYS.SELECTED_FRIEND, friendId);
  } else {
    localStorage.removeItem(STORAGE_KEYS.SELECTED_FRIEND);
  }
}

export function setFriends(friends) {
  appState.friends = friends;
}

export function setFriendRequests(requests) {
  appState.friendRequests = requests;
}

export function getFriendById(friendId) {
  return appState.friends.find((friend) => friend.id === friendId) || null;
}
