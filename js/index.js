import { supabase } from "./supabase.js";

const noticeEl = document.getElementById("bootNotice");

function setNotice(message, type = "") {
  if (!noticeEl) return;

  noticeEl.textContent = message;
  noticeEl.className = "notice";
  if (type) {
    noticeEl.classList.add(type);
  }
}

async function bootstrap() {
  setNotice("Checking your login session...");

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw new Error(error.message);
    }

    if (data.session?.user) {
      window.location.replace("chat.html");
      return;
    }

    window.location.replace("login.html");
  } catch (error) {
    setNotice(`Session check failed. Redirecting to login... (${error.message})`, "error");
    setTimeout(() => {
      window.location.replace("login.html");
    }, 600);
  }
}

bootstrap();
