import { NextResponse } from "next/server";
import { readControl, writeControl, type ControlState } from "@/lib/backend";
import { denyIfUnauthorized } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(await readControl());
}

export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const cur = await readControl();
  const next: ControlState = { ...cur };

  if (typeof body.paused === "boolean") next.paused = body.paused;
  if (["autonomous", "dca", "manual"].includes(body.mode)) next.mode = body.mode;
  if (body.dca && typeof body.dca === "object") {
    next.dca = {
      token: String(body.dca.token ?? next.dca?.token ?? "BNB").toUpperCase(),
      amount_usd: Math.max(0, Number(body.dca.amount_usd ?? next.dca?.amount_usd ?? 0)),
      interval_hours: Math.max(1, Number(body.dca.interval_hours ?? next.dca?.interval_hours ?? 24)),
    };
  }

  await writeControl(next);
  return NextResponse.json({ ok: true, control: next });
}
