"use client";

import Link from "next/link";
import { Logo } from "@/components/brand";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/firebase/auth-context";
import { SmoothScroll } from "@/components/marketing/cinematic/smooth-scroll";
import { resetCoreToHome } from "@/components/dashboard/core-portal";

const NAV = [
  { href: "/#story", label: "Story" },
  { href: "/#features", label: "Features" },
  { href: "/#sat", label: "SAT Prep" },
  { href: "/#how", label: "How it works" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();

  return (
    <SmoothScroll>
    <div className="flex min-h-screen flex-col">
      {/* Floating pill nav — sits over the hero rather than pushing it down. */}
      <header className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-3 sm:top-4">
        <div data-intro-nav className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/[0.08] bg-background/60 py-1.5 pl-4 pr-1.5 shadow-[0_18px_50px_-24px_hsl(0_0%_0%/0.9)] backdrop-blur-xl">
          <Link href="/" className="mr-2 sm:mr-4">
            <Logo />
          </Link>
          <nav className="hidden items-center text-sm text-muted-foreground md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="rounded-full px-3 py-1.5 transition-colors hover:bg-white/5 hover:text-foreground">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-1 flex items-center gap-1 md:ml-3">
            {!initializing && user ? (
              <Link href="/dashboard" onClick={resetCoreToHome}>
                <Button size="sm">Open LifeOS</Button>
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden sm:block">
                  <Button variant="ghost" size="sm">Log in</Button>
                </Link>
                <Link href="/signup">
                  <Button size="sm">Get Started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="relative overflow-hidden border-t border-white/[0.06]">
        <div className="relative z-10 mx-auto max-w-6xl px-6 pt-16">
          <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
            <div>
              <Logo />
              <p className="mt-5 max-w-xs text-xl font-light leading-snug text-foreground/90">
                Your entire student life.
                <br />
                Organized.
              </p>
              <Link href={user ? "/dashboard" : "/signup"} className="mt-6 inline-block">
                <Button size="sm" variant="outline">
                  {user ? "Open LifeOS" : "Get Started"} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-14 gap-y-2 text-sm">
              <div className="space-y-2.5">
                <p className="text-foreground">Product</p>
                {NAV.map((n) => (
                  <a key={n.href} href={n.href} className="block text-muted-foreground hover:text-foreground">
                    {n.label}
                  </a>
                ))}
                <Link href="/pricing" className="block text-muted-foreground hover:text-foreground">Pricing</Link>
              </div>
              <div className="space-y-2.5">
                <p className="text-foreground">Account</p>
                <Link href="/login" className="block text-muted-foreground hover:text-foreground">Log in</Link>
                <Link href="/signup" className="block text-muted-foreground hover:text-foreground">Sign up</Link>
              </div>
            </div>
          </div>
          <div className="mt-14 flex flex-col gap-2 border-t border-white/[0.06] py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
            <span>© {new Date().getFullYear()} LifeOS</span>
            <span>Plans your week. Knows when to stop.</span>
          </div>
        </div>

        {/* Oversized wordmark, lit from below */}
        <div aria-hidden="true" className="pointer-events-none relative mt-4 select-none sm:-mt-6">
          <p className="text-center text-[27vw] font-semibold leading-[0.8] tracking-[-0.06em] text-white/[0.035]">
            LifeOS
          </p>
          <div className="absolute inset-x-0 bottom-0 h-3/4 bg-[radial-gradient(60%_100%_at_50%_100%,hsl(var(--glow)/0.28),transparent_70%)]" />
        </div>
      </footer>
    </div>
    </SmoothScroll>
  );
}
