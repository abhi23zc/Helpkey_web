"use client";

/** Shared client helpers for authenticated JSON calls and R2 uploads. */

export async function requestJson<T = unknown>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((json as { error?: string }).error ?? "Request failed.");
  return json as T;
}

export async function putFile(url: string, headers: Record<string, string>, file: File): Promise<void> {
  const response = await fetch(url, { method: "PUT", headers, body: file });
  if (!response.ok) throw new Error("UPLOAD_FAILED");
}

export async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function uploadErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return "Upload could not reach storage. Check your R2 bucket CORS for this app origin.";
  if (error instanceof Error) {
    if (error.message === "UPLOAD_FAILED") return "Upload was rejected by storage. Check file type, size, and signed URL expiry.";
    if (error.message === "UPLOAD_EXPIRED") return "The upload link expired before final save. Try the upload again.";
    if (error.message === "R2_OBJECT_VERIFICATION_FAILED") return "The file reached storage but verification failed. Retry with the original file.";
    return error.message;
  }
  return "Upload failed.";
}
