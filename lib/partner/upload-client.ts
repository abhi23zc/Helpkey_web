"use client";

/** Shared client helpers for authenticated JSON calls and R2 uploads. */

function customerRequestError(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "Request failed.";
  if (value.trim().startsWith("[") || value.includes('"origin"')) return "Check the entered details and try again.";
  return value;
}

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
  if (!response.ok) throw new Error(customerRequestError((json as { error?: string }).error));
  return json as T;
}

export async function putFile(url: string, headers: Record<string, string>, file: File): Promise<void> {
  const response = await fetch(url, { method: "PUT", headers, body: file });
  if (!response.ok) throw new Error("UPLOAD_FAILED");
}

/** Uploads a file with browser-native progress events. */
export function putFileWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else reject(new Error("UPLOAD_FAILED"));
    };
    request.onerror = () => reject(new TypeError("UPLOAD_NETWORK_ERROR"));
    request.onabort = () => reject(new Error("UPLOAD_ABORTED"));
    request.send(file);
  });
}

export async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export type PropertyPhotoCategory = "exterior" | "reception" | "room" | "bathroom" | "additional";
export type KycDocumentType = "pan" | "government_id_front" | "government_id_back" | "gst";

const kycMimeTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);
const maxKycDocumentBytes = 10 * 1024 * 1024;

export function validateKycDocument(file: File): string | null {
  if (!kycMimeTypes.has(file.type)) return "Use a JPG, PNG, or PDF document.";
  if (!file.size || file.size > maxKycDocumentBytes) return "Use a file no larger than 10 MB.";
  return null;
}

export type FinalizedKycDocument = {
  documentId: string;
  document?: { id: string; documentType?: string; fileName?: string | null; mimeType?: string | null; sizeBytes?: number | null; status?: string };
};

export async function uploadKycDocument(
  propertyId: string,
  documentType: KycDocumentType,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<FinalizedKycDocument> {
  const validationError = validateKycDocument(file);
  if (validationError) throw new Error(validationError);
  const checksum = await sha256Hex(file);
  const signed = await requestJson<{ uploadId: string; uploadUrl: string; headers: Record<string, string> }>(
    `/api/partner/properties/${propertyId}/kyc/upload-url`,
    { documentType, fileName: file.name, mimeType: file.type, sizeBytes: file.size, checksum },
  );
  await putFileWithProgress(signed.uploadUrl, signed.headers, file, onProgress ?? (() => {}));
  return requestJson<FinalizedKycDocument>(`/api/partner/properties/${propertyId}/kyc/finalize`, { uploadId: signed.uploadId });
}

export type FinalizedPropertyPhoto = {
  mediaId: string;
  media?: {
    id: string;
    kind: string;
    category?: string | null;
    fileName?: string | null;
    altText?: string;
    moderationStatus?: string;
    isCover?: boolean;
    imageUrl?: string | null;
  };
  coverMediaId?: string | null;
};

/**
 * The complete, authenticated property-photo write. Keeping this in one place
 * prevents the onboarding and dashboard flows from drifting apart.
 */
export async function uploadPropertyPhoto(
  propertyId: string,
  file: File,
  category: PropertyPhotoCategory,
  onProgress?: (percent: number) => void,
): Promise<FinalizedPropertyPhoto> {
  const checksum = await sha256Hex(file);
  const signed = await requestJson<{ uploadId: string; uploadUrl: string; headers: Record<string, string> }>(
    `/api/partner/properties/${propertyId}/media/upload-url`,
    { fileName: file.name, mimeType: file.type, sizeBytes: file.size, checksum, category },
  );
  await putFileWithProgress(signed.uploadUrl, signed.headers, file, onProgress ?? (() => {}));
  return requestJson<FinalizedPropertyPhoto>(
    `/api/partner/properties/${propertyId}/media/finalize`,
    { uploadId: signed.uploadId },
  );
}

export function uploadErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return "Upload could not reach storage. Check your R2 bucket CORS for this app origin.";
  if (error instanceof Error) {
    if (error.message === "UPLOAD_FAILED") return "Upload was rejected by storage. Check file type, size, and signed URL expiry.";
    if (error.message === "UPLOAD_EXPIRED") return "The upload link expired before final save. Try the upload again.";
    if (error.message === "R2_OBJECT_VERIFICATION_FAILED") return "The file reached storage but verification failed. Retry with the original file.";
    if (error.message === "INVALID_DOCUMENT_CONTENT") return "This file does not match its selected format. Choose the original JPG, PNG, or PDF file.";
    return error.message;
  }
  return "Upload failed.";
}
