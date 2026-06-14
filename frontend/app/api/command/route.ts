import { NextResponse } from "next/server";
import { writeCommand } from "@/lib/backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// A one-shot manual action; picked up by the backend on its next cycle and routed
// through the risk gate (it can still clamp/block). BUY uses size_pct of equity.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "").toLowerCase();
  if (!["buy", "sell", "flatten"].includes(action)) {
    return NextResponse.json({ ok: false, error: "bad action" }, { status: 400 });
  }
  const cmd = {
    action,
    symbol: String(body.symbol ?? "").toUpperCase(),
    size_pct: Math.max(0, Math.min(60, Number(body.size_pct ?? 0))),
    ts: `${Date.now()}`,
  };
  await writeCommand(cmd);
  return NextResponse.json({ ok: true, command: cmd });
}
