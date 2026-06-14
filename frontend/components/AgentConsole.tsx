"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, ShieldCheck, Activity, Repeat, ArrowUp, ArrowDown, XCircle } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import type { StatePayload, Action } from "@/lib/types";

type Mode = "autonomous" | "dca" | "manual";
const ACTION_COLOR: Record<Action, string> = {
  buy: "var(--color-mint)",
  sell: "var(--color-danger)",
  hold: "var(--color-faint)",
};
// display label → allowlist symbol the backend trades
const TOKENS = [
  { label: "BNB", sym: "WBNB" },
  { label: "BTC", sym: "BTCB" },
  { label: "ETH", sym: "ETH" },
  { label: "CAKE", sym: "CAKE" },
];
const INTERVALS = [
  { label: "1h", h: 1 },
  { label: "6h", h: 6 },
  { label: "12h", h: 12 },
  { label: "24h", h: 24 },
];

export default function AgentConsole() {
  const { data } = usePolling<StatePayload>("/api/state", 4000);
  const [paused, setPaused] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("autonomous");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // DCA form
  const [dcaTok, setDcaTok] = useState("WBNB");
  const [dcaAmt, setDcaAmt] = useState(25);
  const [dcaInt, setDcaInt] = useState(6);
  // Manual form
  const [manTok, setManTok] = useState("WBNB");
  const [manPct, setManPct] = useState(10);
  // risk mandate
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
        ceiling: data.internalCeilingPct,
        pos: data.maxPositionPct,
        conv: data.minConviction,
        trades: data.maxTradesPerDay,
      });
    }
  }, [data, paused]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
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
    flash(`${action.toUpperCase()} ${symbol ? label(symbol) : ""} sent · executes next cycle`);
  };
  const commitMandate = (patch: Record<string, number>) => post("/api/mandate", patch);

  const running = paused === false;
  const latest = data?.latest;
  const intentAction = (latest?.proposal.action ?? "hold") as Action;

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

      <div className="px-5 py-5 flex flex-col gap-5 overflow-y-auto flex-1">
        {/* current intent (always shown) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="label">current intent</span>
            <span className="tnum text-[11px] text-[var(--color-faint)]">conv {latest?.proposal.conviction?.toFixed(2) ?? "—"}</span>
          </div>
          <div className="tnum text-[22px]" style={{ color: ACTION_COLOR[intentAction] }}>
            {intentAction.toUpperCase()}{latest?.proposal.symbol ? ` · ${latest.proposal.symbol}` : ""}
          </div>
          <p className="text-[11.5px] text-[var(--color-muted)] leading-snug mt-1.5 line-clamp-2">
            {latest?.proposal.rationale ?? "awaiting first cycle…"}
          </p>
        </div>

        {/* MODE-SPECIFIC */}
        {mode === "autonomous" && (
          <p className="text-[12px] text-[var(--color-muted)] leading-relaxed">
            AI decides · you set the guardrails. <span className="text-[var(--color-fg)]">Competition mode.</span>
          </p>
        )}

        {mode === "dca" && (
          <div className="flex flex-col gap-3">
            <Field label="token"><TokenSelect value={dcaTok} onChange={setDcaTok} /></Field>
            <Field label="amount per buy">
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
              <Repeat size={15} /> Arm DCA strategy
            </button>
            <p className="label" style={{ letterSpacing: "0.1em" }}>recurring buy · still risk-gated</p>
          </div>
        )}

        {mode === "manual" && (
          <div className="flex flex-col gap-3">
            <Field label="token"><TokenSelect value={manTok} onChange={setManTok} /></Field>
            <Field label="size (% of equity)">
              <input type="number" min={1} max={60} value={manPct} onChange={(e) => setManPct(Math.max(1, Math.min(60, +e.target.value)))}
                className="w-full bg-transparent tnum text-[15px] outline-none" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => sendCommand("buy", manTok, manPct)}
                className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold transition-transform hover:scale-[1.02] active:scale-95"
                style={{ background: "var(--color-mint)", color: "#08080b" }}>
                <ArrowUp size={14} /> Buy
              </button>
              <button onClick={() => sendCommand("sell", manTok)}
                className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold transition-transform hover:scale-[1.02] active:scale-95"
                style={{ background: "rgba(255,93,108,0.14)", color: "var(--color-danger)" }}>
                <ArrowDown size={14} /> Sell
              </button>
            </div>
            <button onClick={() => sendCommand("flatten")}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] hairline text-[var(--color-muted)] hover:text-[var(--color-danger)] transition-colors">
              <XCircle size={14} /> Flatten all positions
            </button>
            <p className="label" style={{ letterSpacing: "0.1em" }}>one-tap · routed through the gate</p>
          </div>
        )}

        {/* pause / resume (global) */}
        <button onClick={togglePause} disabled={busy || paused === null}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
          style={running ? { background: "rgba(255,180,77,0.12)", color: "var(--color-amber)" }
            : { background: "rgba(78,230,168,0.12)", color: "var(--color-mint)" }}>
          {running ? <Pause size={14} /> : <Play size={14} />}{running ? "Pause agent" : "Resume agent"}
        </button>

        <div className="h-px bg-[var(--color-line)] -mx-1" />

        {/* risk mandate */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Activity size={13} className="text-[var(--color-mint)]" />
            <span className="label">risk mandate · live</span>
          </div>
          {m && (
            <div className="flex flex-col gap-4">
              <Slider label="drawdown ceiling" value={m.ceiling} min={2} max={28} step={1} suffix="%"
                hint={`auto-flatten · DQ at ${data?.competitionCapPct ?? 30}%`} accent="var(--color-amber)"
                onChange={(v) => setM({ ...m, ceiling: v })} onCommit={(v) => commitMandate({ internal_ceiling_pct: v })} />
              <Slider label="max position size" value={m.pos} min={5} max={60} step={1} suffix="%"
                hint="per-token cap of equity" accent="var(--color-mint)"
                onChange={(v) => setM({ ...m, pos: v })} onCommit={(v) => commitMandate({ max_position_pct: v })} />
              <Slider label="conviction threshold" value={m.conv} min={0.4} max={0.95} step={0.01} suffix=""
                hint="min confidence to deploy (AI mode)" accent="var(--color-cyan)" fmt={(v) => v.toFixed(2)}
                onChange={(v) => setM({ ...m, conv: v })} onCommit={(v) => commitMandate({ min_score_to_enter: v })} />
              <Slider label="max trades / day" value={m.trades} min={1} max={20} step={1} suffix=""
                hint="churn / fee guard" accent="var(--color-violet)"
                onChange={(v) => setM({ ...m, trades: Math.round(v) })} onCommit={(v) => commitMandate({ max_trades_per_day: Math.round(v) })} />
            </div>
          )}
        </div>
      </div>

      {/* toast + footer */}
      {toast && (
        <div className="px-5 py-2 text-[12px] tnum border-t border-[var(--color-line)]" style={{ color: "var(--color-mint)", background: "rgba(78,230,168,0.06)" }}>
          ✓ {toast}
        </div>
      )}
      <div className="px-5 py-3.5 border-t border-[var(--color-line)] flex items-center gap-2.5">
        <ShieldCheck size={15} className="text-[var(--color-mint)] shrink-0" />
        <p className="text-[11.5px] text-[var(--color-muted)] leading-snug">
          Self-custody · the model proposes, <span className="text-[var(--color-fg)]">the gate disposes</span> — it never signs.
        </p>
      </div>
    </div>
  );
}

function label(sym: string) {
  return TOKENS.find((t) => t.sym === sym)?.label ?? sym;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="panel px-4 py-2.5">
      <div className="label mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function TokenSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {TOKENS.map((t) => (
        <button key={t.sym} onClick={() => onChange(t.sym)}
          className="flex-1 tnum text-[12px] py-1 rounded-md transition-colors"
          style={{ color: value === t.sym ? "#08080b" : "var(--color-muted)", background: value === t.sym ? "var(--color-mint)" : "rgba(255,255,255,0.03)" }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step, suffix, hint, accent, fmt, onChange, onCommit }: {
  label: string; value: number; min: number; max: number; step: number; suffix: string;
  hint: string; accent: string; fmt?: (v: number) => string; onChange: (v: number) => void; onCommit: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label">{label}</span>
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
