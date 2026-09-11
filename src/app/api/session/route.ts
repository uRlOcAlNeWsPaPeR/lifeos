import { NextResponse } from "next/server";
import { aiStatus, getUserPlan } from "@/lib/ai";
import { optionalUid } from "@/lib/firebase/admin";

// Tells the client which AI engine is active so the UI can label it
// ("Gemini" / "Claude" / "LifeOS engine"). Works signed-out too (generic
// server-configured engine); once authed, reflects the student's own plan —
// Free always reads as the offline engine, since that's genuinely all it gets.
export async function GET(req: Request) {
  const uid = await optionalUid(req);
  const plan = uid ? await getUserPlan(uid) : undefined;
  const s = aiStatus(plan);
  return NextResponse.json({ engine: s.engine, label: s.label });
}
