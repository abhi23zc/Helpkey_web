/** Synthetic fiscal configuration is accepted only by local emulators or named development projects. */
export function syntheticProject() {
  const project = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
  return /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "") || (process.env.NODE_ENV !== "production" && project.startsWith("helpkey-dev-"));
}
