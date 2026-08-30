"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function ensureApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error(
      "Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* values to .env (see .env.example).",
    );
  }
  if (!app) app = getApps().length ? getApp() : initializeApp(config);
  return app;
}

export function auth(): Auth {
  if (!authInstance) authInstance = getAuth(ensureApp());
  return authInstance;
}

export function db(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(ensureApp());
  return dbInstance;
}
