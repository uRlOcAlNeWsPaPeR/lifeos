import { NextResponse } from "next/server";
import { aiStatus } from "@/lib/ai";

// Cosmetic only — tells the client which AI engine is active so the UI can
// label it ("Gemini" / "Claude" / "LifeOS engine"). No secrets, no auth needed.
export function GET() {
  const s = aiStatus();
  return NextResponse.json({ engine: s.engine, label: s.label });
}
