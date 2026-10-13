import {
  CheckSquare,
  FolderOpen,
  GraduationCap,
  Layers,
  MessageCircle,
  Mic,
  Sparkles,
  StickyNote,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { MemoryKind } from "@/lib/brain/types";

/**
 * How each kind of memory looks: a name, an icon, and a hue. The hue is the
 * only colour decision — the canvas and the lists both build their shades from
 * it, so a deck is the same teal wherever you meet it. Hues sit apart from each
 * other on the wheel but keep the muted saturation the rest of LifeOS uses.
 */
export const KIND_STYLE: Record<MemoryKind, { label: string; plural: string; hue: number; icon: LucideIcon }> = {
  note: { label: "Note", plural: "Notes", hue: 285, icon: StickyNote },
  question: { label: "Question", plural: "Questions", hue: 200, icon: MessageCircle },
  task: { label: "Task", plural: "Tasks", hue: 152, icon: CheckSquare },
  assignment: { label: "Assignment", plural: "Assignments", hue: 38, icon: GraduationCap },
  goal: { label: "Goal", plural: "Goals", hue: 330, icon: Target },
  deck: { label: "Deck", plural: "Decks", hue: 172, icon: Layers },
  podcast: { label: "Podcast", plural: "Podcasts", hue: 255, icon: Mic },
  dump: { label: "Brain dump", plural: "Brain dumps", hue: 95, icon: Sparkles },
  course: { label: "Course", plural: "Courses", hue: 270, icon: FolderOpen },
};

export const KIND_ORDER: MemoryKind[] = ["note", "question", "assignment", "task", "deck", "podcast", "goal", "dump"];

export const kindColor = (kind: MemoryKind, alpha = 1, light = 64) =>
  `hsla(${KIND_STYLE[kind].hue}, 62%, ${light}%, ${alpha})`;
