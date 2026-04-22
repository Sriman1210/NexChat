function requiredElement(id) {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: #${id}`);
  }

  return element;
}

export const dom = {
  logoutBtn: requiredElement("logoutBtn"),
  searchUserInput: requiredElement("searchUser"),
  searchBtn: requiredElement("searchBtn"),
  searchResult: requiredElement("searchResult"),
  friendRequests: requiredElement("friendRequests"),
  friendsList: requiredElement("friendsList"),
  chatUserTitle: requiredElement("chatUser"),
  chatStatus: requiredElement("chatStatus"),
  chatMessages: requiredElement("chatMessages"),
  messageForm: requiredElement("messageForm"),
  messageInput: requiredElement("messageInput"),
  fileForm: requiredElement("fileForm"),
  fileInput: requiredElement("fileInput")
};
