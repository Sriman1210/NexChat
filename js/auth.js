import { supabase } from "./supabase.js";

const USERNAME_PATTERN = /^[a-z0-9]+$/;
const noticeEl = document.getElementById("authNotice");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

function setNotice(message, type = "") {
  if (!noticeEl) return;

  noticeEl.textContent = message;
  noticeEl.className = "notice";
  if (type) {
    noticeEl.classList.add(type);
  }
}

async function redirectIfLoggedIn() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return;

  window.location.href = "chat.html";
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value;

  if (!email || !password) {
    setNotice("Email and password are required.", "error");
    return;
  }

  setNotice("Logging in...");

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    setNotice(error.message, "error");
    return;
  }

  setNotice("Login successful.", "success");
  window.location.href = "chat.html";
}

async function usernameTaken(username) {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data && data.length > 0);
}

async function saveUserProfile(userId, username, email) {
  const { error } = await supabase
    .from("users")
    .upsert(
      {
        id: userId,
        username,
        email
      },
      { onConflict: "id" }
    );

  if (error) {
    throw new Error(error.message);
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();

  const usernameInput = document.getElementById("username");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  const username = usernameInput?.value.trim().toLowerCase();
  const email = emailInput?.value.trim();
  const password = passwordInput?.value;

  if (!username || !email || !password) {
    setNotice("Username, email and password are required.", "error");
    return;
  }

  if (!USERNAME_PATTERN.test(username)) {
    setNotice("Username must contain lowercase letters and numbers only.", "error");
    return;
  }

  setNotice("Creating account...");

  let isUsernameTaken = false;
  try {
    isUsernameTaken = await usernameTaken(username);
  } catch (error) {
    setNotice(`Could not verify username: ${error.message}`, "error");
    return;
  }

  if (isUsernameTaken) {
    setNotice("Username already exists. Please choose another one.", "error");
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    setNotice(error.message, "error");
    return;
  }

  if (!data.user) {
    setNotice("Signup succeeded but user profile is not available yet.", "error");
    return;
  }

  try {
    await saveUserProfile(data.user.id, username, email);
  } catch (profileError) {
    setNotice(`Signup succeeded but profile failed: ${profileError.message}`, "error");
    return;
  }

  setNotice("Signup successful. Redirecting to login...", "success");
  window.location.href = "login.html";
}

if (loginForm) {
  redirectIfLoggedIn();
  loginForm.addEventListener("submit", handleLoginSubmit);
}

if (signupForm) {
  redirectIfLoggedIn();
  signupForm.addEventListener("submit", handleSignupSubmit);
}
