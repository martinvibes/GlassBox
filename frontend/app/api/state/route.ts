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
  readBrainMemory,
} from "@/lib/backend";
import type { Regime, StatePayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [decisions, portfolio, agentId, env, caps, control, mandate, runtime, brainMem] = await Promise.all([
    readDecisions(),
    readPortfolio(),
    readAgentId(),
    readEnv(),
    readRulebookCaps(),
    readControl(),
    readMandate(),
    readRuntime(),
    readBrainMemory(),
  ]);
  const pendingCommand = await readPendingCommand();

  // Brain scorecard — per-token W/L + realized P&L from CLOSED trades (the closed-loop
  // memory the agent reasons over). Mirrors backend memory.performance().
  const brainTokens: Record<string, { wins: number; losses: number; pnl: number; stops: number }> = {};
  let realizedTotal = 0;
  let closedTrades = 0;
  for (const d of decisions) {
    const e = d.execution;
    const rp = e?.realized_pnl_usd ?? 0;
    if (e?.action === "sell" && Math.abs(rp) > 1e-9) {
      const sym = e.symbol || "?";
      const t = (brainTokens[sym] ??= { wins: 0, losses: 0, pnl: 0, stops: 0 });
      t.pnl += rp;
      if (rp > 0) t.wins++; else t.losses++;
      if (d.proposal?.source === "exit:stop_loss") t.stops++;
      realizedTotal += rp;
      closedTrades++;
    }
  }
  for (const t of Object.values(brainTokens)) t.pnl = Math.round(t.pnl * 100) / 100;

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
    // Net-PnL baseline: in live mode use the real starting capital recorded at the
    // first live boot (so a $10 wallet isn't measured against the $1k paper default).
    startEquity:
      portfolio?.initial_equity_usd && portfolio.initial_equity_usd > 0
        ? portfolio.initial_equity_usd
        : caps.startEquity,
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
    brain: {
      thesis: brainMem.thesis,
      lessons: brainMem.lessons,
      realizedTotal: Math.round(realizedTotal * 100) / 100,
      closedTrades,
      tokens: brainTokens,
    },
    pendingCommand,
    regime,
    fearGreed: latest?.signals.fear_greed ?? null,
    equitySeries,
  };

  return NextResponse.json(payload);
}
