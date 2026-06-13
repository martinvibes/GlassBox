"use client";
import { motion } from "framer-motion";
import { usePolling } from "@/lib/usePolling";
import TopBar from "@/components/TopBar";
import DrawdownGauge from "@/components/DrawdownGauge";
import PriceChart from "@/components/PriceChart";
import EquityChart from "@/components/EquityChart";
import ReasoningFeed from "@/components/ReasoningFeed";
import Positions from "@/components/Positions";
import { StatTile } from "@/components/ui";
import { money, signedPct } from "@/lib/format";
import type { StatePayload } from "@/lib/types";

function fngLabel(v: number | null): string {
  if (v == null) return "—";
  if (v <= 25) return "extreme fear";
  if (v <= 45) return "fear";
  if (v <= 55) return "neutral";
  if (v <= 75) return "greed";
  return "extreme greed";
}

export default function Page() {
  const { data } = usePolling<StatePayload>("/api/state", 5000);

  const equity = data?.equity ?? 1000;
  const start = data?.startEquity ?? 1000;
  const pnl = equity - start;
  const pnlPct = start > 0 ? (pnl / start) * 100 : 0;
  const up = pnl >= 0;
  const dd = data?.drawdownPct ?? 0;
  const prices = data?.latest?.signals.prices_usd ?? {};
  const hwm = data?.portfolio?.high_water_mark_usd ?? start;
  const fng = data?.fearGreed ?? null;

  return (
    <main className="relative min-h-screen px-5 md:px-8 py-6 max-w-[1480px] mx-auto z-10">
      <div className="grid-atmos fixed inset-0 -z-10 opacity-40" />

      <TopBar
        regime={data?.regime ?? "unknown"}
        mode={data?.mode ?? "paper"}
        wallet={data?.wallet ?? null}
        cycles={data?.cycles ?? 0}
      />

      {/* HERO */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="glass lg:col-span-5 p-6 flex flex-col items-center justify-center relative overflow-hidden"
        >
          <div className="absolute top-5 left-6 label">survival monitor</div>
          <DrawdownGauge dd={dd} ceiling={data?.internalCeilingPct ?? 12} cap={data?.competitionCapPct ?? 30} />
          <p className="text-[12px] text-[var(--color-muted)] text-center mt-3 max-w-[300px] leading-snug">
            The agent auto-flattens far inside the disqualification line.
            <span className="text-[var(--color-mint)]"> Survival is the alpha.</span>
          </p>
        </motion.div>

        <div className="lg:col-span-7 flex flex-col gap-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="glass p-6 flex items-end justify-between flex-wrap gap-4"
          >
            <div>
              <div className="label">total equity</div>
              <div className="display text-[52px] leading-none mt-1 glow-mint">{money(equity)}</div>
            </div>
            <div className="text-right">
              <div className="label">net pnl</div>
              <div
                className="tnum text-[30px] leading-none mt-1"
                style={{ color: up ? "var(--color-mint)" : "var(--color-danger)" }}
              >
                {up ? "+" : "−"}
                {money(Math.abs(pnl)).slice(1)}
              </div>
              <div className="tnum text-[13px] mt-1" style={{ color: up ? "var(--color-mint)" : "var(--color-danger)" }}>
                {signedPct(pnlPct)}
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatTile label="fear & greed" value={fng ?? "—"} sub={fngLabel(fng)} accent="var(--color-amber)" delay={0.15} />
            <StatTile label="high-water" value={money(hwm, 0)} sub="peak equity" delay={0.2} />
            <StatTile
              label="cycles"
              value={data?.cycles ?? 0}
              sub="decisions logged"
              accent="var(--color-cyan)"
              delay={0.25}
            />
            <StatTile
              label="posture"
              value={<span className="text-[18px]">{(data?.latest?.decision.posture ?? "—").replace("_", "-")}</span>}
              sub="gate stance"
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* CHARTS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="lg:col-span-8 min-h-[360px]"
        >
          <PriceChart />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="lg:col-span-4 min-h-[360px]"
        >
          <EquityChart series={data?.equitySeries ?? []} start={start} />
        </motion.div>
      </section>

      {/* FEED + POSITIONS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="lg:col-span-7 h-[460px]"
        >
          <ReasoningFeed />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="lg:col-span-5"
        >
          <Positions
            portfolio={data?.portfolio ?? null}
            prices={prices}
            wallet={data?.wallet ?? null}
            agentId={data?.agentId ?? null}
          />
        </motion.div>
      </section>

      <footer className="text-center label py-4 opacity-60">
        GlassBox · transparent · risk-gated · BNB HACK Track 1 · the LLM proposes, the gate disposes
      </footer>
    </main>
  );
}
