"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  type Auth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let auth: Auth | null = null;

export function hasFirebaseClientConfig() {
  return Object.values(firebaseConfig).every(Boolean);
}

function assertFirebaseClientConfig() {
  if (hasFirebaseClientConfig()) {
    return;
  }

  throw new Error("Firebase client env vars are missing.");
}

export function getFirebaseAuth() {
  if (auth) {
    return auth;
  }

  assertFirebaseClientConfig();
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  return auth;
}

export function getGoogleProvider() {
  return new GoogleAuthProvider();
}

export { signInWithCustomToken, signInWithPopup, signOut };
