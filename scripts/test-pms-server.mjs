import { spawn } from "node:child_process";
if (
  !/^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIRESTORE_EMULATOR_HOST || "",
  ) ||
  !/^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
  )
)
  throw new Error(
    "PMS browser tests require explicit localhost Auth and Firestore emulators.",
  );
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3014",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      HELPKEY_TEST_DIST_DIR: ".next-pms",
      FIREBASE_ADMIN_PROJECT_ID: "demo-helpkey-pms",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-helpkey-pms",
      NEXT_PUBLIC_FIREBASE_APP_ID: "",
      FIREBASE_ADMIN_PRIVATE_KEY: "",
      FIREBASE_ADMIN_CLIENT_EMAIL: "",
      REDIS_URL: "",
      QUEUE_REDIS_URL: "",
      REDIS_DISABLED: "1",
      BACKGROUND_MODE: "legacy",
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
