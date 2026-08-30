"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuth, authErrorMessage } from "@/lib/firebase/auth-context";
import { ensureProfile } from "@/lib/firebase/profile";
import { auth } from "@/lib/firebase/client";
import { FirebaseNotConfigured } from "@/components/app/gates";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { signIn, user, initializing, configured } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initializing && user) router.replace(next || "/dashboard");
  }, [initializing, user, router, next]);

  if (!configured) return <FirebaseNotConfigured />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(form.email, form.password);
      const { onboarded } = auth().currentUser
        ? await ensureProfile(auth().currentUser!)
        : { onboarded: false };
      router.replace(onboarded ? next || "/dashboard" : "/onboarding");
    } catch (err) {
      setError(authErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">Log in to your command center.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Email">
          <Input
            autoFocus
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@school.edu"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
            required
          />
        </Field>

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            Forgot password?
          </Link>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" loading={loading}>
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to LifeOS?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
