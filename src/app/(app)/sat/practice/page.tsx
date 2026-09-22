import { Suspense } from "react";
import { PracticeBuilder } from "@/components/sat/practice-builder";
import { LoadingBlock } from "@/components/sat/common";

export default function SatPracticePage() {
  // The builder reads ?section= from the dashboard shortcuts.
  return (
    <Suspense fallback={<LoadingBlock />}>
      <PracticeBuilder />
    </Suspense>
  );
}
