import { NextResponse } from "next/server";
import {
  readDecisions,
  readPortfolio,
  readAgentId,
  readEnv,
  readRulebookCaps,
  readControl,
  readMandate,
  readPendingCommand,
  readRuntime,
} from "@/lib/backend";
import type { Regime, StatePayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [decisions, portfolio, agentId, env, caps, control, mandate, runtime] = await Promise.all([
    readDecisions(),
    readPortfolio(),
    readAgentId(),
    readEnv(),
    readRulebookCaps(),
    readControl(),
    readMandate(),
    readRuntime(),
  ]);
  const pendingCommand = await readPendingCommand();

  // DCA schedule: when the next scheduled buy is due (last run + interval)
  let dcaNextRun: number | null = null;
  if (control.mode === "dca" && control.dca?.interval_hours) {
    const intervalMs = control.dca.interval_hours * 3600_000;
    dcaNextRun = runtime.dca_last_run
      ? new Date(runtime.dca_last_run).getTime() + intervalMs
      : Date.now(); // never run → due now (fires next cycle)
  }

  // effective config = rulebook defaults overlaid with the dashboard mandate
  const eff = {
    internalCeilingPct: mandate.internal_ceiling_pct ?? caps.internalCeilingPct,
    maxPositionPct: mandate.max_position_pct ?? caps.maxPositionPct,
    minConviction: mandate.min_score_to_enter ?? caps.minConviction,
    maxTradesPerDay: mandate.max_trades_per_day ?? caps.maxTradesPerDay,
  };

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
    internalCeilingPct: eff.internalCeilingPct,
    competitionCapPct: caps.competitionCapPct,
    maxPositionPct: eff.maxPositionPct,
    minConviction: eff.minConviction,
    maxTradesPerDay: eff.maxTradesPerDay,
    paused: control.paused,
    agentMode: control.mode,
    dca: control.dca ?? null,
    dcaNextRun,
    pendingCommand,
    regime,
    fearGreed: latest?.signals.fear_greed ?? null,
    equitySeries,
  };

  return NextResponse.json(payload);
}
