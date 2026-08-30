"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuth, authErrorMessage } from "@/lib/firebase/auth-context";
import { ensureProfile } from "@/lib/firebase/profile";
import { auth } from "@/lib/firebase/client";
import { FirebaseNotConfigured } from "@/components/app/gates";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const { signUp, user, initializing, configured } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initializing && user) router.replace("/dashboard");
  }, [initializing, user, router]);

  if (!configured) return <FirebaseNotConfigured />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signUp(form.name, form.email, form.password);
      if (auth().currentUser) await ensureProfile(auth().currentUser!);
      router.replace("/onboarding");
    } catch (err) {
      setError(authErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your LifeOS</h1>
      <p className="mt-1 text-sm text-muted-foreground">Three minutes to set up. Free forever.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Name">
          <Input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Aditya Sharma"
            required
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@school.edu"
            required
          />
        </Field>
        <Field label="Password" hint="At least 6 characters.">
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
            required
          />
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
