import { NextResponse } from "next/server";
import { writeCommand } from "@/lib/backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// One-shot manual action; picked up by the backend within ~5s and routed through
// the risk gate. swap = any token → any token; flatten = sell all to base.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "").toLowerCase();
  if (!["swap", "buy", "sell", "flatten"].includes(action)) {
    return NextResponse.json({ ok: false, error: "bad action" }, { status: 400 });
  }
  const cmd = {
    action,
    symbol: String(body.symbol ?? "").toUpperCase(),
    from: String(body.from ?? "").toUpperCase(),
    to: String(body.to ?? "").toUpperCase(),
    size_pct: Math.max(0, Math.min(100, Number(body.size_pct ?? 0))),
    ts: `${Date.now()}`,
  };
  await writeCommand(cmd);
  return NextResponse.json({ ok: true, command: cmd });
}
