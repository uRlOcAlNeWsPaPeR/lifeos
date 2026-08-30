"use client";

import { toast } from "@/components/ui/toaster";
import { auth, firebaseConfigured } from "@/lib/firebase/client";

type Options = Omit<RequestInit, "body"> & { body?: unknown };

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, opts: Options, withAuth: boolean): Promise<T> {
  const { body, headers, ...rest } = opts;
  const h: Record<string, string> = { "Content-Type": "application/json", ...(headers as Record<string, string>) };

  if (withAuth && firebaseConfigured) {
    const user = auth().currentUser;
    if (user) h.Authorization = `Bearer ${await user.getIdToken()}`;
  }

  const res = await fetch(path, {
    ...rest,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiClientError(data?.error ?? `Request failed (${res.status})`, res.status, data);
  }
  return data as T;
}

/** Plain fetch — for unauthenticated endpoints (e.g. /api/session). */
export function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  return request<T>(path, opts, false);
}

/** Fetch with the Firebase ID token attached — for the AI endpoints. */
export function authedApi<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  return request<T>(path, opts, true);
}

/** Wrap a mutation with toast feedback. */
export async function run<T>(
  fn: () => Promise<T>,
  opts: { success?: string; error?: string } = {},
): Promise<T | undefined> {
  try {
    const result = await fn();
    if (opts.success) toast(opts.success, "success");
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : opts.error ?? "Something went wrong";
    toast(msg, "error");
    return undefined;
  }
}
