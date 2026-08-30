"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuth, authErrorMessage } from "@/lib/firebase/auth-context";
import { FirebaseNotConfigured } from "@/components/app/gates";

export default function ForgotPasswordPage() {
  const { sendReset, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!configured) return <FirebaseNotConfigured />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await sendReset(email);
      setDone(true);
    } catch (err) {
      // Firebase returns success even for unknown emails when email enumeration
      // protection is on; only real errors (bad format, network) land here.
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter your email and we&apos;ll send a reset link.
      </p>

      {done ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            If an account exists for <span className="font-medium">{email}</span>, a password-reset
            email from Firebase is on its way. Check your inbox (and spam).
          </div>
          <Link href="/login">
            <Button variant="outline" className="w-full">
              Back to log in
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Email">
            <Input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              required
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Send reset link
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-primary hover:underline">
              Back to log in
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
