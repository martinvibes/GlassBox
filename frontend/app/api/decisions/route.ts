import { NextResponse } from "next/server";
import { readDecisions } from "@/lib/backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // fills=true → only EXECUTED trades, scanned from the WHOLE log so trades never
  // scroll out of view behind the agent's many HOLD cycles (the Trades tab).
  if (searchParams.get("fills") === "true") {
    const all = await readDecisions();
    const fills = all.filter(
      (r) => r.execution?.ok && r.execution.notional_usd > 0 && r.execution.action !== "hold"
    );
    return NextResponse.json({ decisions: fills.slice(-200).reverse() }); // newest first, cap 200
  }

  const limit = parseInt(searchParams.get("limit") ?? "40", 10);
  const decisions = await readDecisions(limit);
  return NextResponse.json({ decisions: decisions.reverse() }); // newest first
}
