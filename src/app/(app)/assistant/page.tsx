"use client";

import { AssistantView } from "./assistant-view";
import { useAppData } from "@/lib/store/app-data";

export default function AssistantPage() {
  const { data } = useAppData();
  const openTasks = data.tasks.filter((t) => t.status === "todo").length;
  const openAssignments = data.assignments.filter((a) => a.status !== "graded").length;

  return (
    <AssistantView
      name={data.profile.name.split(" ")[0]}
      engineLabel={data.ai.label}
      dataHint={`${openTasks} open tasks · ${openAssignments} assignments`}
    />
  );
}
