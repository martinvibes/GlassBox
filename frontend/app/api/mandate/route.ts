import { NextResponse } from "next/server";
import { readMandate, writeMandate } from "@/lib/backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Only these keys are accepted, clamped to safe ranges. The backend layers them
// over rulebook.yaml each cycle (the source rulebook is never mutated).
const FIELDS: Record<string, { min: number; max: number; int?: boolean }> = {
  internal_ceiling_pct: { min: 2, max: 28 },     // must stay under the ~30% DQ cap
  max_position_pct: { min: 5, max: 60 },
  min_score_to_enter: { min: 0.4, max: 0.95 },
  max_trades_per_day: { min: 1, max: 20, int: true },
};

export async function GET() {
  return NextResponse.json(await readMandate());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const current = await readMandate();
  const next: Record<string, number> = { ...current };
  for (const [k, spec] of Object.entries(FIELDS)) {
    if (body[k] == null) continue;
    let v = Number(body[k]);
    if (Number.isNaN(v)) continue;
    v = Math.max(spec.min, Math.min(spec.max, v));
    next[k] = spec.int ? Math.round(v) : v;
  }
  await writeMandate(next);
  return NextResponse.json({ ok: true, mandate: next });
}
