"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { Eye, Brain, ShieldCheck, Send, Anchor } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import type { StatePayload } from "@/lib/types";

const reveal = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
};

const PIPELINE = [
  { icon: Eye, t: "Perceive", d: "Real, decision-ready signals — market regime, Fear & Greed, momentum, liquidity — from CoinMarketCap's Agent Hub and live feeds. No raw-data guesswork.", c: "var(--color-cyan)" },
  { icon: Brain, t: "Reason", d: "One auditable Claude call proposes an action, a size, and a written rationale. A single thin agent — not a 7-strategy swarm that over-fits a 7-day window.", c: "var(--color-violet)" },
  { icon: ShieldCheck, t: "Gate", d: "A deterministic, fail-safe risk gate is the ONLY authority over execution. It clamps size, blocks bad trades, and auto-flattens on drawdown. The model never signs.", c: "var(--color-mint)" },
  { icon: Send, t: "Execute", d: "Approved trades sign locally and settle on BNB Chain via the Trust Wallet Agent Kit — self-custody, autonomous, on PancakeSwap & beyond.", c: "var(--color-amber)" },
  { icon: Anchor, t: "Anchor", d: "Each decision's hash is written on-chain (ERC-8004) and appended to a hash-chained audit log. The reasoning can't be edited after the fact.", c: "var(--color-cyan)" },
];

const REGIMES = [
  { name: "Risk-Off", tag: "default · preserve", color: "var(--color-danger)", gross: "0%", desc: "Fear or a falling BTC tape → stay 100% in stablecoin. The agent does nothing rather than something dumb. This is where it lives most of the time.", badges: ["stablecoin only", "no new exposure", "de-risk on hold"] },
  { name: "Neutral", tag: "probe", color: "var(--color-amber)", gross: "20%", desc: "Mixed signals → tiny, tightly-sized probes into the most liquid names only. Toe in the water, never a plunge.", badges: ["small probes", "high liquidity", "low size"] },
  { name: "Risk-On", tag: "deploy", color: "var(--color-mint)", gross: "50%", desc: "Greed + supportive momentum + adequate liquidity → deploy on genuine multi-signal conviction. Still capped, still gated.", badges: ["momentum", "conviction floor", "deploy"] },
  { name: "Euphoria", tag: "fade froth", color: "var(--color-violet)", gross: "30%", desc: "Extreme greed → trim into strength and fade the froth. Pull exposure down as the crowd piles in.", badges: ["trim strength", "reduce", "counter-froth"] },
];

export default function Strategy() {
  const { data } = usePolling<StatePayload>("/api/state", 15000);
  const ceiling = data?.internalCeilingPct ?? 12;
  const cap = data?.competitionCapPct ?? 30;
  const maxPos = data?.maxPositionPct ?? 25;
  const conv = data?.minConviction ?? 0.62;
  const maxTrades = data?.maxTradesPerDay ?? 6;

  const RULES = [
    { k: "Drawdown circuit-breaker", v: `flatten ${ceiling}%`, sub: `auto-sell everything, far inside the ${cap}% DQ line`, c: "var(--color-amber)" },
    { k: "Max position size", v: `${maxPos}%`, sub: "per-token cap of equity", c: "var(--color-mint)" },
    { k: "Conviction floor", v: conv.toFixed(2), sub: "min confidence to open a position", c: "var(--color-cyan)" },
    { k: "Daily trade cap", v: `${maxTrades}/day`, sub: "churn & fee guard", c: "var(--color-violet)" },
    { k: "Slippage guard", v: "≤ 0.80%", sub: "reject quotes that exceed it", c: "var(--color-mint)" },
    { k: "Token allowlist", v: "BEP-20", sub: "blocks anything off the list", c: "var(--color-cyan)" },
    { k: "Trade cooldown", v: "30 min", sub: "no rapid re-entry", c: "var(--color-amber)" },
    { k: "Fail-safe", v: "→ BLOCK", sub: "any gate error blocks, never opens", c: "var(--color-danger)" },
  ];

  return (
    <main className="relative z-10 max-w-[1180px] mx-auto px-5 md:px-8 py-16">
      <div className="grid-atmos fixed inset-0 -z-10 opacity-25" />

      {/* hero */}
      <motion.div {...reveal}>
        <div className="label mb-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-mint)] live-dot" /> strategy · how it actually works
        </div>
        <h1 className="display text-[clamp(40px,6.5vw,76px)] leading-[0.96]">
          One disciplined agent.{" "}
          <span className="italic glow-mint" style={{ color: "var(--color-mint)" }}>One job: survive.</span>
        </h1>
        <p className="text-[var(--color-muted)] text-[17px] leading-relaxed mt-6 max-w-[680px]">
          Track 1 is judged on real PnL over a 7-day window with a hard max-drawdown DQ. Over so few
          trades, clever alpha can&apos;t be proven — but blow-ups can. Most entrants over-leverage and
          trip the gate. GlassBox is engineered around the opposite: <span className="text-[var(--color-fg)]">be the one still standing.</span>
        </p>
      </motion.div>

      {/* regime playbooks */}
      <section className="mt-16">
        <motion.div {...reveal} className="mb-6">
          <h2 className="display text-[32px]">Regime playbooks</h2>
          <p className="text-[var(--color-muted)] text-[14px] mt-2 max-w-[640px]">
            The agent reads the market regime and adopts one of four postures. Posture sets the ceiling
            on total exposure — the gate enforces it. Default is flat.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {REGIMES.map((r, i) => (
            <motion.div key={r.name} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }}
              className="glass p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-[19px] font-semibold" style={{ color: r.color }}>{r.name}</h3>
                  <div className="label mt-1">{r.tag}</div>
                </div>
                <div className="text-right">
                  <div className="tnum text-[22px]" style={{ color: r.color }}>{r.gross}</div>
                  <div className="label">max gross</div>
                </div>
              </div>
              <p className="text-[var(--color-muted)] text-[13.5px] leading-relaxed mb-4">{r.desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {r.badges.map((b) => (
                  <span key={b} className="label px-2 py-0.5 rounded-full hairline" style={{ background: "rgba(255,255,255,0.02)" }}>{b}</span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* the loop */}
      <section className="mt-16">
        <motion.h2 {...reveal} className="display text-[32px] mb-6">The decision loop</motion.h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {PIPELINE.map((s, i) => (
            <motion.div key={s.t} {...reveal} transition={{ ...reveal.transition, delay: i * 0.06 }}
              className="glass p-5">
              <div className="h-9 w-9 rounded-[10px] hairline flex items-center justify-center mb-4">
                <s.icon size={16} style={{ color: s.c }} />
              </div>
              <div className="tnum text-[10px] text-[var(--color-faint)] mb-1">0{i + 1}</div>
              <h3 className="text-[16px] mb-1.5">{s.t}</h3>
              <p className="text-[var(--color-muted)] text-[12px] leading-relaxed">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* the gate rulebook */}
      <section className="mt-16">
        <motion.div {...reveal} className="mb-6">
          <h2 className="display text-[32px]">The deterministic risk gate</h2>
          <p className="text-[var(--color-muted)] text-[14px] mt-2 max-w-[640px]">
            The model proposes; this pure-Python gate disposes. Every proposal runs the full gauntlet —
            it can clamp, block, or emergency-flatten. No LLM, no network, fail-safe by design. These are live values.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {RULES.map((r, i) => (
            <motion.div key={r.k} {...reveal} transition={{ ...reveal.transition, delay: i * 0.04 }}
              className="glass p-5">
              <div className="label mb-2">{r.k}</div>
              <div className="tnum text-[22px]" style={{ color: r.c }}>{r.v}</div>
              <div className="text-[11px] text-[var(--color-faint)] mt-1.5 leading-snug">{r.sub}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* survival math */}
      <section className="mt-16">
        <motion.h2 {...reveal} className="display text-[32px] mb-6">Why small sizing wins</motion.h2>
        <motion.div {...reveal} className="glass p-8">
          <p className="text-[var(--color-muted)] text-[15px] leading-relaxed mb-6 max-w-[680px]">
            Because the gate caps any single position at a small slice of equity, even a violent token
            move barely dents the book — it turns a blow-up into a scratch:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center max-w-[560px]">
            <MathTile k="token crash" v="−40%" c="var(--color-danger)" />
            <div className="text-center tnum text-[var(--color-faint)] text-[22px]">→</div>
            <MathTile k="portfolio drawdown" v="−4%" c="var(--color-mint)" />
          </div>
          <p className="text-[var(--color-faint)] text-[13px] mt-6 tnum">
            A 10%-sized position taking a 40% hit = 4% portfolio drawdown — comfortably inside the{" "}
            <span style={{ color: "var(--color-amber)" }}>{ceiling}% flatten</span> trigger, far from the{" "}
            <span style={{ color: "var(--color-danger)" }}>{cap}% DQ</span> line.
          </p>
        </motion.div>
      </section>

      {/* stacks */}
      <section className="mt-16">
        <motion.h2 {...reveal} className="display text-[32px] mb-6">Built on the sponsor stacks</motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StackCard t="CoinMarketCap" s="Agent Hub" d="Decision-ready market signals & regime — the perception layer." />
          <StackCard t="Trust Wallet" s="Agent Kit (TWAK)" d="Self-custody local signing & on-chain execution on BSC." />
          <StackCard t="ERC-8004" s="on BNB Chain" d="On-chain agent identity & tamper-proof decision anchoring." />
        </div>
      </section>

      <motion.div {...reveal} className="mt-16 text-center">
        <Link href="/desk"
          className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-semibold transition-transform hover:scale-[1.03] active:scale-95"
          style={{ background: "var(--color-mint)", color: "#07080a", boxShadow: "0 0 40px -8px var(--color-mint)" }}>
          See it live on the desk →
        </Link>
      </motion.div>
    </main>
  );
}

function MathTile({ k, v, c }: { k: string; v: string; c: string }) {
  return (
    <div className="hairline rounded-xl p-5 text-center" style={{ background: "rgba(255,255,255,0.02)" }}>
      <div className="label">{k}</div>
      <div className="tnum text-[40px] mt-2" style={{ color: c }}>{v}</div>
    </div>
  );
}

function StackCard({ t, s, d }: { t: string; s: string; d: string }) {
  return (
    <div className="glass p-6">
      <div className="text-[16px]">{t}</div>
      <div className="label mt-1 mb-3">{s}</div>
      <p className="text-[var(--color-muted)] text-[13px] leading-relaxed">{d}</p>
    </div>
  );
}
