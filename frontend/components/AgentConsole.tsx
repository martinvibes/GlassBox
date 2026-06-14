"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, ShieldCheck, Activity } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import type { StatePayload, Action } from "@/lib/types";

const ACTION_COLOR: Record<Action, string> = {
  buy: "var(--color-mint)",
  sell: "var(--color-danger)",
  hold: "var(--color-faint)",
};

export default function AgentConsole() {
  const { data } = usePolling<StatePayload>("/api/state", 4000);
  const [paused, setPaused] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  // local mandate (initialized once from server, then user-owned)
  const [m, setM] = useState<{ ceiling: number; pos: number; conv: number; trades: number } | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!data) return;
    if (paused === null) setPaused(data.paused);
    if (!initialized.current) {
      initialized.current = true;
      setM({
        ceiling: data.internalCeilingPct,
        pos: data.maxPositionPct,
        conv: data.minConviction,
        trades: data.maxTradesPerDay,
      });
    }
  }, [data, paused]);

  const cap = data?.competitionCapPct ?? 30;
  const latest = data?.latest;
  const intentAction = (latest?.proposal.action ?? "hold") as Action;

  const togglePause = async () => {
    if (paused === null) return;
    setBusy(true);
    const next = !paused;
    setPaused(next);
    try {
      await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: next }),
      });
    } finally {
      setBusy(false);
    }
  };

  const commitMandate = async (patch: Record<string, number>) => {
    await fetch("/api/mandate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  };

  const running = paused === false;

  return (
    <div className="glass flex flex-col h-full overflow-hidden">
      {/* header + status */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
        <span className="label">agent console</span>
        <div
          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1"
          style={{ background: running ? "rgba(78,230,168,0.1)" : "rgba(255,180,77,0.1)" }}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${running ? "live-dot" : ""}`}
            style={{ background: running ? "var(--color-mint)" : "var(--color-amber)" }}
          />
          <span className="label" style={{ color: running ? "var(--color-mint)" : "var(--color-amber)" }}>
            {paused === null ? "…" : running ? "running" : "paused"}
          </span>
        </div>
      </div>

      <div className="px-5 py-4 flex flex-col gap-5 overflow-y-auto">
        {/* current intent */}
        <div className="panel px-4 py-3">
          <div className="label mb-2">current intent</div>
          <div className="flex items-center justify-between">
            <span className="tnum text-[18px]" style={{ color: ACTION_COLOR[intentAction] }}>
              {intentAction.toUpperCase()}
              {latest?.proposal.symbol ? ` · ${latest.proposal.symbol}` : ""}
            </span>
            <span className="tnum text-[12px] text-[var(--color-muted)]">
              conv {latest?.proposal.conviction?.toFixed(2) ?? "—"}
            </span>
          </div>
          <p className="text-[11.5px] text-[var(--color-muted)] leading-snug mt-2 line-clamp-2">
            {latest?.proposal.rationale ?? "awaiting first cycle…"}
          </p>
        </div>

        {/* pause / resume */}
        <button
          onClick={togglePause}
          disabled={busy || paused === null}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
          style={
            running
              ? { background: "rgba(255,180,77,0.12)", color: "var(--color-amber)" }
              : { background: "var(--color-mint)", color: "#08080b", boxShadow: "0 0 30px -10px var(--color-mint)" }
          }
        >
          {running ? <Pause size={15} /> : <Play size={15} />}
          {running ? "Pause agent" : "Resume agent"}
        </button>

        {/* risk mandate */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Activity size={13} className="text-[var(--color-mint)]" />
            <span className="label">risk mandate · live</span>
          </div>
          {m && (
            <div className="flex flex-col gap-4">
              <Slider
                label="drawdown ceiling"
                value={m.ceiling}
                min={2}
                max={28}
                step={1}
                suffix="%"
                hint={`auto-flatten · DQ at ${cap}%`}
                accent="var(--color-amber)"
                onChange={(v) => setM({ ...m, ceiling: v })}
                onCommit={(v) => commitMandate({ internal_ceiling_pct: v })}
              />
              <Slider
                label="max position size"
                value={m.pos}
                min={5}
                max={60}
                step={1}
                suffix="%"
                hint="per-token cap of equity"
                accent="var(--color-mint)"
                onChange={(v) => setM({ ...m, pos: v })}
                onCommit={(v) => commitMandate({ max_position_pct: v })}
              />
              <Slider
                label="conviction threshold"
                value={m.conv}
                min={0.4}
                max={0.95}
                step={0.01}
                suffix=""
                hint="min confidence to deploy"
                accent="var(--color-cyan)"
                fmt={(v) => v.toFixed(2)}
                onChange={(v) => setM({ ...m, conv: v })}
                onCommit={(v) => commitMandate({ min_score_to_enter: v })}
              />
              <Slider
                label="max trades / day"
                value={m.trades}
                min={1}
                max={20}
                step={1}
                suffix=""
                hint="churn / fee guard"
                accent="var(--color-violet)"
                onChange={(v) => setM({ ...m, trades: Math.round(v) })}
                onCommit={(v) => commitMandate({ max_trades_per_day: Math.round(v) })}
              />
            </div>
          )}
        </div>
      </div>

      {/* authorize footer */}
      <div className="mt-auto px-5 py-4 border-t border-[var(--color-line)]">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={15} className="text-[var(--color-mint)] shrink-0" />
          <p className="text-[11.5px] text-[var(--color-muted)] leading-snug">
            Competition agent · self-custody. The model proposes,
            <span className="text-[var(--color-fg)]"> the gate disposes</span> — it never signs.
          </p>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  hint,
  accent,
  fmt,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  hint: string;
  accent: string;
  fmt?: (v: number) => string;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label">{label}</span>
        <span className="tnum text-[14px]" style={{ color: accent }}>
          {fmt ? fmt(value) : value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: accent, background: "rgba(255,255,255,0.08)" }}
      />
      <div className="label mt-1" style={{ letterSpacing: "0.1em" }}>{hint}</div>
    </div>
  );
}
