"use client";
import { motion } from "framer-motion";
import type { Regime, Verdict, Action } from "@/lib/types";

const REGIME_META: Record<Regime, { label: string; color: string; note: string }> = {
  risk_off: { label: "RISK-OFF", color: "var(--color-danger)", note: "preserve · stablecoin" },
  neutral: { label: "NEUTRAL", color: "var(--color-amber)", note: "probes only" },
  risk_on: { label: "RISK-ON", color: "var(--color-mint)", note: "deploy on conviction" },
  euphoria: { label: "EUPHORIA", color: "var(--color-violet)", note: "fade froth" },
  unknown: { label: "UNKNOWN", color: "var(--color-faint)", note: "safe default" },
};

export function RegimePill({ regime }: { regime: Regime }) {
  const m = REGIME_META[regime] ?? REGIME_META.unknown;
  return (
    <div
      className="inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 hairline"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
      <span
        className="h-2 w-2 rounded-full live-dot"
        style={{ background: m.color, boxShadow: `0 0 10px ${m.color}` }}
      />
      <span className="label" style={{ color: m.color, letterSpacing: "0.18em" }}>
        {m.label}
      </span>
      <span className="text-[11px] text-[var(--color-faint)] hidden sm:inline">{m.note}</span>
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  accent,
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: "easeOut" }}
      className="glass px-5 py-4 flex flex-col justify-between min-h-[104px]"
    >
      <div className="label">{label}</div>
      <div className="tnum text-[26px] mt-2 leading-none" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-[var(--color-muted)] mt-1.5 tnum">{sub}</div>}
    </motion.div>
  );
}

const VERDICT_META: Record<Verdict, { color: string; bg: string }> = {
  allow: { color: "var(--color-mint)", bg: "rgba(78,230,168,0.1)" },
  clamp: { color: "var(--color-amber)", bg: "rgba(255,180,77,0.1)" },
  block: { color: "var(--color-faint)", bg: "rgba(255,255,255,0.04)" },
  flatten: { color: "var(--color-danger)", bg: "rgba(255,93,108,0.12)" },
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const m = VERDICT_META[verdict] ?? VERDICT_META.block;
  return (
    <span
      className="label rounded px-1.5 py-0.5"
      style={{ color: m.color, background: m.bg, letterSpacing: "0.14em" }}
    >
      {verdict}
    </span>
  );
}

const ACTION_GLYPH: Record<Action, string> = { buy: "▲", sell: "▼", hold: "■", swap: "⇄" };
const ACTION_COLOR: Record<Action, string> = {
  buy: "var(--color-mint)",
  sell: "var(--color-danger)",
  hold: "var(--color-faint)",
  swap: "var(--color-cyan)",
};

export function ActionGlyph({ action }: { action: Action }) {
  return (
    <span className="tnum text-[11px]" style={{ color: ACTION_COLOR[action] }}>
      {ACTION_GLYPH[action]} {action.toUpperCase()}
    </span>
  );
}
