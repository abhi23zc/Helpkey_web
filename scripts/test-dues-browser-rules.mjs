import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import assert from "node:assert/strict";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST,
  authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (
  ![firestoreHost, authHost].every((host) =>
    /^(127\.0\.0\.1|localhost):\d+$/.test(host ?? ""),
  )
)
  throw Error("Explicit localhost Firestore and Auth emulators are required.");
const projectId = "demo-helpkey-finance",
  app = initializeApp({ projectId }),
  db = getFirestore(app),
  auth = getAuth(app);
const upload = await fetch(
  `http://${firestoreHost}/emulator/v1/projects/${projectId}:securityRules`,
  {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rules: {
        files: [
          {
            name: "firestore.rules",
            content: await readFile(
              new URL("../firestore.rules", import.meta.url),
              "utf8",
            ),
          },
        ],
      },
    }),
  },
);
assert.equal(upload.status, 200, await upload.text());
const email = `dues-rules-${crypto.randomUUID()}@example.test`;
const signup = await fetch(
  `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "LocalFixture123!",
      returnSecureToken: true,
    }),
  },
);
assert.equal(signup.status, 200);
const { localId: uid, idToken } = await signup.json();
try {
  await db
    .collection("users")
    .doc(uid)
    .set({ roles: ["admin"], accountStatus: "active", isActive: true });
  for (const collection of [
    "hotelDuesPaymentsV1",
    "hotelDuesCorrectionsV1",
    "hotelDuesReferencesV1",
    "hotelDuesConfirmationsV1",
    "hotelDuesRequestsV1",
  ]) {
    const endpoint = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${collection}/browser-denial-test`;
    for (const authenticated of [false, true]) {
      const headers = {
        "Content-Type": "application/json",
        ...(authenticated ? { Authorization: `Bearer ${idToken}` } : {}),
      };
      const read = await fetch(endpoint, { headers });
      assert.equal(
        read.status,
        403,
        `${collection}: browser read must be denied`,
      );
      const write = await fetch(endpoint, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ fields: { status: { stringValue: "Paid" } } }),
      });
      assert.equal(
        write.status,
        403,
        `${collection}: browser write must be denied`,
      );
    }
  }
  console.log(
    "20 security-rule assertions passed: anonymous and active-admin browser reads/writes denied for every dues collection.",
  );
} finally {
  await db.collection("users").doc(uid).delete();
  await auth.deleteUser(uid);
  await db.terminate();
}
