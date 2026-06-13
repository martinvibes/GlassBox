import { NextResponse } from "next/server";
import {
  readDecisions,
  readPortfolio,
  readAgentId,
  readEnv,
  readRulebookCaps,
} from "@/lib/backend";
import type { Regime, StatePayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [decisions, portfolio, agentId, env, caps] = await Promise.all([
    readDecisions(),
    readPortfolio(),
    readAgentId(),
    readEnv(),
    readRulebookCaps(),
  ]);

  const latest = decisions.length ? decisions[decisions.length - 1] : null;

  // strictly-increasing time series for the equity curve
  const seen = new Set<number>();
  const equitySeries = decisions.map((d) => {
    let t = Math.floor(new Date(d.ts).getTime() / 1000);
    while (seen.has(t)) t += 1;
    seen.add(t);
    return { t, v: d.equity_usd };
  });

  const equity = latest?.equity_usd ?? caps.startEquity;
  const regime: Regime = latest?.signals.regime ?? "unknown";

  const payload: StatePayload = {
    ok: true,
    mode: env.GLASSBOX_MODE ?? "paper",
    wallet: env.TWAK_WALLET_ADDRESS ?? null,
    agentId,
    portfolio,
    latest,
    cycles: decisions.length,
    equity,
    startEquity: caps.startEquity,
    drawdownPct: latest?.drawdown_pct ?? 0,
    internalCeilingPct: caps.internalCeilingPct,
    competitionCapPct: caps.competitionCapPct,
    regime,
    fearGreed: latest?.signals.fear_greed ?? null,
    equitySeries,
  };

  return NextResponse.json(payload);
}
