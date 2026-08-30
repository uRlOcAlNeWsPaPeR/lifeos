"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { auth, firebaseConfigured } from "./client";

interface AuthValue {
  user: User | null;
  initializing: boolean;
  configured: boolean;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  getToken: () => Promise<string | null>;
}

const Ctx = createContext<AuthValue | null>(null);

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (!firebaseConfigured) {
      setInitializing(false);
      return;
    }
    return onAuthStateChanged(auth(), (u) => {
      setUser(u);
      setInitializing(false);
    });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      initializing,
      configured: firebaseConfigured,
      async signUp(name, email, password) {
        const cred = await createUserWithEmailAndPassword(auth(), email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
        setUser({ ...cred.user });
      },
      async signIn(email, password) {
        await signInWithEmailAndPassword(auth(), email.trim(), password);
      },
      async logout() {
        await signOut(auth());
      },
      async sendReset(email) {
        await sendPasswordResetEmail(auth(), email.trim());
      },
      async getToken() {
        return auth().currentUser ? auth().currentUser!.getIdToken() : null;
      },
    }),
    [user, initializing],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Human-readable messages for the common Firebase Auth error codes. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with that email already exists.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a few minutes.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return err instanceof Error ? err.message : "Something went wrong. Try again.";
  }
}
