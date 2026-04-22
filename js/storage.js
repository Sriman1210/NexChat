export const STORAGE_BUCKETS = {
  AVATARS: "avatars",
  CHAT_FILES: "chat-files"
};

const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".avif",
  ".heic",
  ".heif"
];

export function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildAvatarPath(userId, fileName) {
  return `users/${userId}/${Date.now()}_${sanitizeFileName(fileName)}`;
}

export function buildChatFilePath(userId, fileName) {
  return `messages/${userId}/${Date.now()}_${sanitizeFileName(fileName)}`;
}

export function getPublicUrlOrThrow(publicUrlData, context) {
  const publicUrl = publicUrlData?.publicUrl;

  if (!publicUrl) {
    throw new Error(`${context}: Unable to generate a public file URL.`);
  }

  return publicUrl;
}

export function formatStorageError(error, bucketName, actionLabel) {
  if (!error) return "Unexpected storage error.";

  const rawMessage = error.message || String(error);
  const message = rawMessage.toLowerCase();

  if (message.includes("bucket not found")) {
    return `${actionLabel} failed because the "${bucketName}" bucket does not exist. Create the "${bucketName}" bucket in Supabase Storage and try again.`;
  }

  if (message.includes("row-level security") || message.includes("permission denied")) {
    return `${actionLabel} failed due to Storage permissions. Check Storage policies for bucket "${bucketName}".`;
  }

  if (message.includes("payload too large") || message.includes("too large")) {
    return `${actionLabel} failed because the file is too large.`;
  }

  return `${actionLabel} failed: ${rawMessage}`;
}

export function isImageUrl(url) {
  if (!url) return false;

  const cleanUrl = url.split("?")[0].toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => cleanUrl.endsWith(extension));
}
