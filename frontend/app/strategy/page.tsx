"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePolling } from "@/lib/usePolling";
import type { StatePayload } from "@/lib/types";

const PIPELINE = [
  { n: "01", t: "Perceive", d: "Pulls real, decision-ready market signals — regime, Fear & Greed, momentum, liquidity — from CoinMarketCap's Agent Hub and live feeds.", c: "var(--color-cyan)" },
  { n: "02", t: "Reason", d: "A single, auditable Claude call proposes an action, a size, and a written rationale. One thin agent — no multi-agent swarm to over-fit a 7-day window.", c: "var(--color-violet)" },
  { n: "03", t: "Gate", d: "A deterministic, fail-safe risk gate has the only authority over execution. It clamps size, blocks bad trades, and auto-flattens on drawdown. The model never signs.", c: "var(--color-mint)" },
  { n: "04", t: "Execute", d: "Approved trades sign locally and settle on BNB Chain via the Trust Wallet Agent Kit — self-custody, autonomous, PancakeSwap & beyond.", c: "var(--color-amber)" },
  { n: "05", t: "Anchor", d: "Each decision's hash is written on-chain (ERC-8004) and appended to a hash-chained audit log. The reasoning can't be edited after the fact.", c: "var(--color-cyan)" },
];

export default function Strategy() {
  const { data } = usePolling<StatePayload>("/api/state", 15000);
  const ceiling = data?.internalCeilingPct ?? 12;
  const cap = data?.competitionCapPct ?? 30;

  return (
    <main className="relative z-10 max-w-[1080px] mx-auto px-5 md:px-8 py-16">
      <div className="grid-atmos fixed inset-0 -z-10 opacity-30" />

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <div className="label mb-4">strategy · how it works</div>
        <h1 className="display text-[clamp(38px,6vw,68px)] leading-[0.98]">
          A trading desk you can <span className="glow-mint" style={{ color: "var(--color-mint)" }}>see through.</span>
        </h1>
        <p className="text-[var(--color-muted)] text-[17px] leading-relaxed mt-6 max-w-[640px]">
          Track 1 is judged on real PnL over a 7-day window with a hard max-drawdown cap.
          Over so few trades, clever alpha can't be proven — but blowups can. GlassBox is
          engineered around one idea: <span className="text-[var(--color-fg)]">don't lose.</span>
        </p>
      </motion.div>

      {/* pipeline */}
      <section className="mt-16">
        <h2 className="display text-[30px] mb-6">The loop</h2>
        <div className="space-y-3">
          {PIPELINE.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="glass p-6 flex gap-5 items-start"
            >
              <div className="tnum text-[22px] shrink-0 w-12" style={{ color: s.c }}>{s.n}</div>
              <div>
                <h3 className="text-[18px] mb-1.5" style={{ color: "var(--color-fg)" }}>{s.t}</h3>
                <p className="text-[var(--color-muted)] text-[14px] leading-relaxed">{s.d}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* survival math */}
      <section className="mt-16">
        <h2 className="display text-[30px] mb-6">Why small sizing wins</h2>
        <div className="glass p-8">
          <p className="text-[var(--color-muted)] text-[15px] leading-relaxed mb-6">
            The gate caps any single position at a small fraction of equity. So even a violent
            token move barely dents the portfolio — turning a blow-up into a scratch:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <MathTile k="token crash" v="−40%" c="var(--color-danger)" />
            <div className="text-center tnum text-[var(--color-faint)] text-[22px]">→</div>
            <MathTile k="portfolio drawdown" v="−4%" c="var(--color-mint)" />
          </div>
          <p className="text-[var(--color-faint)] text-[13px] mt-6 tnum">
            A 10%-sized position taking a 40% hit = 4% portfolio drawdown — comfortably inside the{" "}
            <span style={{ color: "var(--color-amber)" }}>{ceiling}% flatten</span> trigger and far from the{" "}
            <span style={{ color: "var(--color-danger)" }}>{cap}% DQ</span> line.
          </p>
        </div>
      </section>

      {/* stacks */}
      <section className="mt-16">
        <h2 className="display text-[30px] mb-6">Built on three stacks</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StackCard t="CoinMarketCap" s="Agent Hub" d="Decision-ready signals & regime." />
          <StackCard t="Trust Wallet" s="Agent Kit (TWAK)" d="Self-custody signing & on-chain execution." />
          <StackCard t="ERC-8004" s="on BNB Chain" d="On-chain agent identity & decision anchoring." />
        </div>
      </section>

      <div className="mt-16 text-center">
        <Link
          href="/desk"
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium transition-transform hover:scale-[1.03]"
          style={{ background: "var(--color-mint)", color: "#07080a", boxShadow: "0 0 30px -6px var(--color-mint)" }}
        >
          See it live on the desk →
        </Link>
      </div>
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
