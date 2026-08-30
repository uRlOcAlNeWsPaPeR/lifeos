import Link from "next/link";
import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-fade-in">{children}</div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} LifeOS
        </p>
      </div>

      <div className="relative hidden overflow-hidden border-l border-white/[0.06] lg:block">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 30% 20%, hsl(274 80% 24% / 0.85), transparent 65%), radial-gradient(50% 50% at 90% 90%, hsl(322 75% 24% / 0.6), transparent 60%), radial-gradient(40% 40% at 80% 10%, hsl(200 80% 24% / 0.4), transparent 60%)",
          }}
        />
        <div className="absolute inset-0 hero-grid opacity-40" />
        <div className="relative flex h-full flex-col justify-center px-14">
          <blockquote className="max-w-md text-2xl font-medium leading-snug tracking-tight">
            “I open LifeOS every morning and it tells me exactly what matters today.”
          </blockquote>
          <p className="mt-4 text-sm text-muted-foreground">
            The command center for your whole student life — assignments, deadlines,
            goals and plans in one intelligent system.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-3">
            {[
              ["Today", "Prioritized"],
              ["Deadlines", "One timeline"],
              ["Goals", "On track"],
            ].map(([a, b]) => (
              <div key={a} className="card-surface p-3">
                <p className="text-xs text-muted-foreground">{a}</p>
                <p className="text-sm font-medium">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
