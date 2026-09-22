"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowLeft, BookOpen, ChevronDown, Sigma } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { useGuides } from "@/lib/sat/hooks";
import { ErrorBlock, LoadingBlock, SatHeader } from "./common";
import { SAT_ROUTES } from "./use-sat-actions";

const GUIDE_ICON: Record<string, typeof BookOpen> = { math: Sigma, english: BookOpen };

export function GuidesList() {
  const guides = useGuides();
  return (
    <>
      <SatHeader title="Study guides" description="Key things to remember for the exam — always one tap away." />
      {guides.error ? (
        <ErrorBlock message={`Couldn't load the guides — ${guides.error}.`} onRetry={guides.retry} />
      ) : !guides.data ? (
        <LoadingBlock label="Loading guides…" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {guides.data.map((g) => {
            const Icon = GUIDE_ICON[g.id] ?? BookOpen;
            return (
              <Link key={g.id} href={`${SAT_ROUTES.guides}/${g.id}`} className="block">
                <Card interactive className="h-full p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="mt-3 font-medium">{g.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {g.sub} · {g.sections.length} topics
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export function GuideDetail({ id }: { id: string }) {
  const guides = useGuides();
  const refs = useRef<(HTMLDetailsElement | null)[]>([]);
  const g = guides.data?.find((x) => x.id === id);

  function jump(i: number) {
    const el = refs.current[i];
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (guides.error) return <ErrorBlock message={`Couldn't load the guide — ${guides.error}.`} onRetry={guides.retry} />;
  if (!guides.data) return <LoadingBlock label="Loading guide…" />;
  if (!g) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Guide not found"
        action={<Link href={SAT_ROUTES.guides}><Button size="sm">All guides</Button></Link>}
      />
    );
  }

  return (
    <>
      <Link href={SAT_ROUTES.guides} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Study guides
      </Link>
      <SatHeader title={g.title} description={g.sub} />

      <nav aria-label="Topics" className="mb-6 flex flex-wrap gap-2">
        {g.sections.map((sec, i) => (
          <button
            key={sec.t}
            type="button"
            onClick={() => jump(i)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
          >
            {sec.t}
          </button>
        ))}
      </nav>

      <div className="space-y-3">
        {g.sections.map((sec, i) => (
          <Card key={sec.t} className="scroll-mt-6 p-0">
            <details
              ref={(el) => {
                refs.current[i] = el;
              }}
              open={i === 0}
              className="group"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-medium">
                {sec.t}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="sat-guide px-5 pb-5" dangerouslySetInnerHTML={{ __html: sec.html }} />
            </details>
          </Card>
        ))}
      </div>
    </>
  );
}
