import { supabase } from "./supabase.js";
import {
  STORAGE_BUCKETS,
  buildAvatarPath,
  formatStorageError,
  getPublicUrlOrThrow
} from "./storage.js";

const USERNAME_PATTERN = /^[a-z0-9]+$/;
const DEFAULT_AVATAR = "https://via.placeholder.com/72";

const usernameInput = document.getElementById("username");
const avatarInput = document.getElementById("avatarInput");
const avatarPreview = document.getElementById("avatarPreview");
const saveUsernameBtn = document.getElementById("saveUsernameBtn");
const uploadAvatarBtn = document.getElementById("uploadAvatarBtn");
const logoutBtn = document.getElementById("logoutBtn");
const noticeEl = document.getElementById("settingsNotice");

let currentUser = null;

function setNotice(message, type = "") {
  if (!noticeEl) return;

  noticeEl.textContent = message;
  noticeEl.className = "notice";
  if (type) {
    noticeEl.classList.add(type);
  }
}

async function requireUser() {
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

async function loadProfile() {
  const { data, error } = await supabase
    .from("users")
    .select("username, avatar_url")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    setNotice(error.message, "error");
    return;
  }

  usernameInput.value = data?.username ?? "";
  avatarPreview.src = data?.avatar_url || DEFAULT_AVATAR;
}

async function usernameExists(username) {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .neq("id", currentUser.id)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data && data.length > 0);
}

async function saveUsername() {
  const username = usernameInput.value.trim().toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    setNotice("Username must contain lowercase letters and numbers only.", "error");
    return;
  }

  setNotice("Saving username...");

  try {
    if (await usernameExists(username)) {
      setNotice("Username already exists. Please choose another one.", "error");
      return;
    }
  } catch (error) {
    setNotice(error.message, "error");
    return;
  }

  const { error } = await supabase
    .from("users")
    .update({ username })
    .eq("id", currentUser.id);

  if (error) {
    setNotice(error.message, "error");
    return;
  }

  setNotice("Username updated successfully.", "success");
}

async function uploadAvatar() {
  const file = avatarInput.files?.[0];

  if (!file) {
    setNotice("Please choose an image file first.", "error");
    return;
  }

  if (!file.type.startsWith("image/")) {
    setNotice("Only image uploads are allowed.", "error");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    setNotice("File is too large. Keep it under 5 MB.", "error");
    return;
  }

  setNotice("Uploading avatar...");
  const filePath = buildAvatarPath(currentUser.id, file.name);

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKETS.AVATARS)
    .upload(filePath, file, { upsert: false });

  if (uploadError) {
    setNotice(
      formatStorageError(uploadError, STORAGE_BUCKETS.AVATARS, "Avatar upload"),
      "error"
    );
    return;
  }

  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKETS.AVATARS)
    .getPublicUrl(filePath);

  let avatarUrl = "";
  try {
    avatarUrl = getPublicUrlOrThrow(urlData, "Avatar URL generation");
  } catch (error) {
    setNotice(error.message, "error");
    return;
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({ avatar_url: avatarUrl })
    .eq("id", currentUser.id);

  if (updateError) {
    await supabase.storage
      .from(STORAGE_BUCKETS.AVATARS)
      .remove([filePath]);

    setNotice("Avatar uploaded but profile update failed. Please try again.", "error");
    return;
  }

  avatarPreview.src = avatarUrl;
  setNotice("Avatar updated successfully.", "success");
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

async function init() {
  currentUser = await requireUser();
  if (!currentUser) return;

  await loadProfile();

  saveUsernameBtn.addEventListener("click", saveUsername);
  uploadAvatarBtn.addEventListener("click", uploadAvatar);
  logoutBtn.addEventListener("click", logout);
}

init();
