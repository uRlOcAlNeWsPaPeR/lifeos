"use client";

import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/firebase/auth-context";
import { SmoothScroll } from "@/components/marketing/cinematic/smooth-scroll";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();

  return (
    <SmoothScroll>
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="/#story" className="hover:text-foreground">Story</a>
            <a href="/#features" className="hover:text-foreground">Features</a>
            <a href="/#how" className="hover:text-foreground">How it works</a>
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          </nav>
          <div className="flex items-center gap-2">
            {!initializing && user ? (
              <Link href="/dashboard">
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

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-xs">· Your entire student life. Organized.</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link href="/login" className="hover:text-foreground">Log in</Link>
            <Link href="/signup" className="hover:text-foreground">Sign up</Link>
            <span>© {new Date().getFullYear()} LifeOS</span>
          </div>
        </div>
      </footer>
    </div>
    </SmoothScroll>
  );
}
