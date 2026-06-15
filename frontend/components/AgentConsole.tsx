"use client";
import { useEffect, useRef, useState } from "react";
import {
  Play, Pause, ShieldCheck, Repeat, XCircle, ArrowRight, ArrowDownUp, ChevronDown, Loader2,
} from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { money } from "@/lib/format";
import TokenIcon from "./TokenIcon";
import type { StatePayload, Action } from "@/lib/types";

type Mode = "autonomous" | "dca" | "manual";
const ACTION_COLOR: Record<Action, string> = {
  buy: "var(--color-mint)",
  sell: "var(--color-danger)",
  hold: "var(--color-faint)",
  swap: "var(--color-cyan)",
};
const TOKENS = [
  { label: "BNB", sym: "WBNB" },
  { label: "BTC", sym: "BTCB" },
  { label: "ETH", sym: "ETH" },
  { label: "SOL", sym: "SOL" },
  { label: "CAKE", sym: "CAKE" },
];
// full set (incl. stablecoins) for the manual Swap — any → any
const SWAP_TOKENS = [
  { label: "USDC", sym: "USDC" },
  { label: "USDT", sym: "USDT" },
  { label: "BNB", sym: "WBNB" },
  { label: "BTC", sym: "BTCB" },
  { label: "ETH", sym: "ETH" },
  { label: "SOL", sym: "SOL" },
  { label: "CAKE", sym: "CAKE" },
];
const lbl = (sym: string) => SWAP_TOKENS.find((t) => t.sym === sym)?.label ?? sym;
const INTERVALS = [
  { label: "1h", h: 1 },
  { label: "6h", h: 6 },
  { label: "12h", h: 12 },
  { label: "24h", h: 24 },
];
const BASE = "USDT";
const label = (sym: string) => TOKENS.find((t) => t.sym === sym)?.label ?? sym;

export default function AgentConsole() {
  const { data } = usePolling<StatePayload>("/api/state", 3000);
  const [paused, setPaused] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("autonomous");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showRisk, setShowRisk] = useState(false);

  const [dcaTok, setDcaTok] = useState("WBNB");
  const [dcaAmt, setDcaAmt] = useState(25);
  const [dcaInt, setDcaInt] = useState(6);
  const [manFrom, setManFrom] = useState("USDT");
  const [manTo, setManTo] = useState("WBNB");
  const [manPct, setManPct] = useState(10);
  const [m, setM] = useState<{ ceiling: number; pos: number; conv: number; trades: number } | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!data) return;
    if (paused === null) setPaused(data.paused);
    if (!initialized.current) {
      initialized.current = true;
      setMode(data.agentMode);
      if (data.dca) {
        if (data.dca.token) setDcaTok(data.dca.token);
        if (data.dca.amount_usd) setDcaAmt(data.dca.amount_usd);
        if (data.dca.interval_hours) setDcaInt(data.dca.interval_hours);
      }
      setM({
        ceiling: data.internalCeilingPct, pos: data.maxPositionPct,
        conv: data.minConviction, trades: data.maxTradesPerDay,
      });
    }
  }, [data, paused]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };
  const post = (url: string, body: unknown) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const switchMode = async (next: Mode) => {
    setMode(next);
    await post("/api/control", { mode: next });
  };
  const togglePause = async () => {
    if (paused === null) return;
    setBusy(true);
    const next = !paused;
    setPaused(next);
    try { await post("/api/control", { paused: next }); } finally { setBusy(false); }
  };
  const armDca = async () => {
    await post("/api/control", { mode: "dca", paused: false, dca: { token: dcaTok, amount_usd: dcaAmt, interval_hours: dcaInt } });
    setPaused(false);
    flash(`DCA armed · $${dcaAmt} ${label(dcaTok)} every ${dcaInt}h`);
  };
  const sendCommand = async (action: string, symbol?: string, size_pct?: number) => {
    if (mode !== "manual") await switchMode("manual");
    if (paused) { await post("/api/control", { paused: false }); setPaused(false); }
    await post("/api/command", { action, symbol, size_pct });
    flash(`${action.toUpperCase()} ${symbol ? label(symbol) : ""} submitted — executing…`);
  };
  const sendSwap = async (from: string, to: string, size_pct: number) => {
    if (from === to) return;
    if (mode !== "manual") await switchMode("manual");
    if (paused) { await post("/api/control", { paused: false }); setPaused(false); }
    await post("/api/command", { action: "swap", from, to, size_pct });
    flash(`Swap ${lbl(from)} → ${lbl(to)} submitted — executing…`);
  };
  const commitMandate = (patch: Record<string, number>) => post("/api/mandate", patch);

  const running = paused === false;
  const latest = data?.latest;
  const intentAction = (latest?.proposal.action ?? "hold") as Action;
  const pending = data?.pendingCommand ?? null;
  const equity = data?.equity ?? 1000;
  const manUsd = (equity * manPct) / 100;

  return (
    <div className="glass flex flex-col h-full overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-line)]">
        <span className="label">agent console</span>
        <div className="inline-flex items-center gap-2 rounded-full px-2.5 py-1"
          style={{ background: running ? "rgba(78,230,168,0.1)" : "rgba(255,180,77,0.1)" }}>
          <span className={`h-1.5 w-1.5 rounded-full ${running ? "live-dot" : ""}`}
            style={{ background: running ? "var(--color-mint)" : "var(--color-amber)" }} />
          <span className="label" style={{ color: running ? "var(--color-mint)" : "var(--color-amber)" }}>
            {paused === null ? "…" : running ? "running" : "paused"}
          </span>
        </div>
      </div>

      {/* pending command banner */}
      {pending && (
        <div className="px-5 py-2.5 flex items-center gap-2 text-[12px] border-b border-[var(--color-line)]"
          style={{ background: "rgba(255,180,77,0.08)", color: "var(--color-amber)" }}>
          <Loader2 size={13} className="animate-spin" />
          <span className="tnum">executing {pending.action.toUpperCase()} {pending.symbol ? label(pending.symbol) : ""}…</span>
        </div>
      )}

      {/* mode tabs */}
      <div className="flex gap-1 px-3 pt-3">
        {(["autonomous", "dca", "manual"] as Mode[]).map((t) => (
          <button key={t} onClick={() => switchMode(t)}
            className="flex-1 text-[12px] capitalize py-1.5 rounded-lg transition-colors"
            style={{
              color: mode === t ? "#08080b" : "var(--color-muted)",
              background: mode === t ? "var(--color-mint)" : "rgba(255,255,255,0.03)",
              fontWeight: mode === t ? 600 : 400,
            }}>
            {t}
          </button>
        ))}
      </div>

      <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto flex-1">
        {/* current intent */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="label">current intent</span>
            <span className="tnum text-[11px] text-[var(--color-faint)]">conv {latest?.proposal.conviction?.toFixed(2) ?? "—"}</span>
          </div>
          <div className="tnum text-[20px]" style={{ color: ACTION_COLOR[intentAction] }}>
            {intentAction.toUpperCase()}{latest?.proposal.symbol ? ` · ${latest.proposal.symbol}` : ""}
          </div>
          <p className="text-[11.5px] text-[var(--color-muted)] leading-snug mt-1.5 line-clamp-2">
            {latest?.proposal.rationale ?? "awaiting first cycle…"}
          </p>
        </div>

        {/* AUTONOMOUS */}
        {mode === "autonomous" && (
          <p className="text-[12px] text-[var(--color-muted)] leading-relaxed">
            The agent trades autonomously — <span className="text-[var(--color-fg)]">opening positions</span> on conviction and
            <span className="text-[var(--color-fg)]"> taking profit / cutting risk</span> back to cash. You set the guardrails.
            <span className="text-[var(--color-fg)]"> Competition mode.</span>
          </p>
        )}

        {/* DCA */}
        {mode === "dca" && (
          <div className="flex flex-col gap-3">
            <Field label="token"><TokenSelect value={dcaTok} onChange={setDcaTok} /></Field>
            <Field label="buy amount">
              <div className="flex items-center gap-2">
                <span className="tnum text-[var(--color-faint)]">$</span>
                <input type="number" min={5} value={dcaAmt} onChange={(e) => setDcaAmt(Math.max(5, +e.target.value))}
                  className="w-full bg-transparent tnum text-[15px] outline-none" />
              </div>
            </Field>
            <Field label="interval">
              <div className="flex gap-1">
                {INTERVALS.map((iv) => (
                  <button key={iv.h} onClick={() => setDcaInt(iv.h)}
                    className="tnum text-[12px] px-2.5 py-1 rounded-md transition-colors"
                    style={{ color: dcaInt === iv.h ? "var(--color-fg)" : "var(--color-faint)", background: dcaInt === iv.h ? "rgba(255,255,255,0.06)" : "transparent" }}>
                    {iv.label}
                  </button>
                ))}
              </div>
            </Field>
            <button onClick={armDca}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold transition-transform hover:scale-[1.01] active:scale-95"
              style={{ background: "var(--color-mint)", color: "#08080b", boxShadow: "0 0 30px -10px var(--color-mint)" }}>
              <Repeat size={15} /> Start DCA · buy {label(dcaTok)} ${dcaAmt}/{dcaInt}h
            </button>
          </div>
        )}

        {/* MANUAL — manual trading (buy / sell) */}
        {mode === "manual" && (
          <div className="flex flex-col gap-3">
            <p className="text-[11.5px] text-[var(--color-muted)] leading-snug">
              Trade by hand. <span className="text-[var(--color-fg)]">Buy</span> opens a position,
              <span className="text-[var(--color-fg)]"> Sell</span> closes it — still risk-gated.
            </p>
            <Field label="token"><TokenSelect value={manTo} onChange={setManTo} /></Field>
            <Field label="size (% of equity)">
              <div className="flex items-center justify-between">
                <input type="number" min={1} max={60} value={manPct} onChange={(e) => setManPct(Math.max(1, Math.min(60, +e.target.value)))}
                  className="w-20 bg-transparent tnum text-[15px] outline-none" />
                <span className="tnum text-[12px] text-[var(--color-faint)]">≈ {money(manUsd)}</span>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => sendCommand("buy", manTo, manPct)}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[14px] font-semibold transition-transform hover:scale-[1.02] active:scale-95"
                style={{ background: "var(--color-mint)", color: "#08080b" }}>
                Buy {label(manTo)}
              </button>
              <button onClick={() => sendCommand("sell", manTo)}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[14px] font-semibold transition-transform hover:scale-[1.02] active:scale-95"
                style={{ background: "rgba(255,93,108,0.14)", color: "var(--color-danger)" }}>
                Sell {label(manTo)}
              </button>
            </div>
            <button onClick={() => sendCommand("flatten")}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] hairline text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors">
              <XCircle size={14} /> Close all positions
            </button>
            <p className="label" style={{ letterSpacing: "0.1em" }}>routed through the gate · fills in seconds</p>
          </div>
        )}

        {/* ── global agent controls ── */}
        <div className="h-px bg-[var(--color-line)] -mx-1 mt-1" />
        <button onClick={togglePause} disabled={busy || paused === null}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
          style={running ? { background: "rgba(255,180,77,0.12)", color: "var(--color-amber)" }
            : { background: "rgba(78,230,168,0.12)", color: "var(--color-mint)" }}>
          {running ? <Pause size={14} /> : <Play size={14} />}{running ? "Pause agent" : "Resume agent"}
        </button>

        {/* collapsible risk mandate */}
        <button onClick={() => setShowRisk((v) => !v)}
          className="flex items-center justify-between w-full py-1 group">
          <span className="label group-hover:text-[var(--color-muted)] transition-colors">risk mandate · live</span>
          <ChevronDown size={14} className="text-[var(--color-faint)] transition-transform" style={{ transform: showRisk ? "rotate(180deg)" : "none" }} />
        </button>
        {showRisk && m && (
          <div className="flex flex-col gap-4 pb-1">
            <Slider label="drawdown ceiling" value={m.ceiling} min={2} max={28} step={1} suffix="%"
              hint={`auto-flatten · DQ at ${data?.competitionCapPct ?? 30}%`} accent="var(--color-amber)"
              onChange={(v) => setM({ ...m, ceiling: v })} onCommit={(v) => commitMandate({ internal_ceiling_pct: v })} />
            <Slider label="max position size" value={m.pos} min={5} max={60} step={1} suffix="%"
              hint="per-token cap of equity" accent="var(--color-mint)"
              onChange={(v) => setM({ ...m, pos: v })} onCommit={(v) => commitMandate({ max_position_pct: v })} />
            <Slider label="conviction threshold" value={m.conv} min={0.4} max={0.95} step={0.01} suffix=""
              hint="min confidence (AI mode)" accent="var(--color-cyan)" fmt={(v) => v.toFixed(2)}
              onChange={(v) => setM({ ...m, conv: v })} onCommit={(v) => commitMandate({ min_score_to_enter: v })} />
            <Slider label="max trades / day" value={m.trades} min={1} max={20} step={1} suffix=""
              hint="churn / fee guard" accent="var(--color-violet)"
              onChange={(v) => setM({ ...m, trades: Math.round(v) })} onCommit={(v) => commitMandate({ max_trades_per_day: Math.round(v) })} />
          </div>
        )}
      </div>

      {toast && (
        <div className="px-5 py-2 text-[12px] tnum border-t border-[var(--color-line)]"
          style={{ color: "var(--color-mint)", background: "rgba(78,230,168,0.06)" }}>
          ✓ {toast}
        </div>
      )}
      <div className="px-5 py-3 border-t border-[var(--color-line)] flex items-center gap-2.5">
        <ShieldCheck size={14} className="text-[var(--color-mint)] shrink-0" />
        <p className="text-[11px] text-[var(--color-muted)] leading-snug">
          Self-custody · the model proposes, <span className="text-[var(--color-fg)]">the gate disposes</span>.
        </p>
      </div>
    </div>
  );
}

function SwapPreview({ from, to, note }: { from: string; to: string; note: string }) {
  return (
    <div className="flex items-center justify-between panel px-4 py-2.5">
      <div className="flex items-center gap-2 text-[13px]">
        <TokenIcon symbol={from} size={18} />
        <span className="text-[var(--color-muted)]">{from}</span>
        <ArrowRight size={13} className="text-[var(--color-mint)]" />
        <TokenIcon symbol={to} size={18} />
        <span className="text-[var(--color-fg)]">{to}</span>
      </div>
      <span className="label">{note}</span>
    </div>
  );
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="panel px-4 py-2.5">
      <div className="label mb-1.5">{l}</div>
      {children}
    </div>
  );
}

function TokenChips({ value, onChange, exclude }: { value: string; onChange: (v: string) => void; exclude?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SWAP_TOKENS.filter((t) => t.sym !== exclude).map((t) => (
        <button
          key={t.sym}
          onClick={() => onChange(t.sym)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11.5px] transition-colors"
          style={{
            color: value === t.sym ? "#08080b" : "var(--color-muted)",
            background: value === t.sym ? "var(--color-mint)" : "rgba(255,255,255,0.03)",
          }}
        >
          <TokenIcon symbol={t.sym} size={14} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

function TokenSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {TOKENS.map((t) => (
        <button key={t.sym} onClick={() => onChange(t.sym)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 tnum text-[12px] py-1.5 rounded-md transition-colors"
          style={{ color: value === t.sym ? "#08080b" : "var(--color-muted)", background: value === t.sym ? "var(--color-mint)" : "rgba(255,255,255,0.03)" }}>
          <TokenIcon symbol={t.sym} size={15} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label: l, value, min, max, step, suffix, hint, accent, fmt, onChange, onCommit }: {
  label: string; value: number; min: number; max: number; step: number; suffix: string;
  hint: string; accent: string; fmt?: (v: number) => string; onChange: (v: number) => void; onCommit: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label">{l}</span>
        <span className="tnum text-[14px]" style={{ color: accent }}>{fmt ? fmt(value) : value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: accent, background: "rgba(255,255,255,0.08)" }} />
      <div className="label mt-1" style={{ letterSpacing: "0.1em" }}>{hint}</div>
    </div>
  );
}
