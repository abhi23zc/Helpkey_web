import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { ApiException } from "../api/errors";
let derived: { passphrase: string; key: Buffer } | undefined;
function key() {
  const value = process.env.HOTEL_BANK_ENCRYPTION_KEY;
  // Preserve existing hexadecimal keys. Passphrases are local-development only.
  if (value && !/^[a-fA-F0-9]{64}$/.test(value) && value.length >= 10 && process.env.NODE_ENV !== "production") {
    if (derived?.passphrase !== value) derived = { passphrase: value, key: scryptSync(value, "helpkey.hotel-bank.local.v1", 32) };
    return derived.key;
  }
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value))
    throw new ApiException(
      "BANK_STORAGE_UNAVAILABLE",
      503,
      "Bank details are temporarily unavailable. Contact Helpkey support to enable bank storage. Existing payouts can continue.",
    );
  return Buffer.from(value, "hex");
}
export function bankStorageAvailable() {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}
export function protectedFingerprint(value: string) {
  return createHmac("sha256", key()).update(value).digest("hex");
}
export function encryptAccount(value: string, binding: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(binding));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}
export function decryptAccount(
  value: ReturnType<typeof encryptAccount>,
  binding: string,
) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(value.iv, "hex"),
  );
  decipher.setAAD(Buffer.from(binding));
  decipher.setAuthTag(Buffer.from(value.tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
