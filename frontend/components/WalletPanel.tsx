"use client";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, QrCode, Wallet, ArrowRightLeft, ArrowDownUp, ShieldCheck } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { money } from "@/lib/format";
import { toast } from "@/lib/toast";
import TokenIcon from "./TokenIcon";
import type { StatePayload } from "@/lib/types";

const LABEL: Record<string, string> = { WBNB: "BNB", BTCB: "BTC" };
const cl = (s: string) => LABEL[s] ?? s;
const STABLE = (s: string) => s === "USDT" || s === "USDC";
const norm = (s: string) => (s === "BNB" ? "WBNB" : s); // native BNB → allowlist sym

type WalletData = {
  ok: boolean;
  address: string | null;
  native?: { symbol: string; amount: number; usd: number };
  tokens?: { symbol: string; amount: number; usd: number; isStable: boolean }[];
  totalUsd?: number;
  funded?: boolean;
};
type Bal = { symbol: string; amount: number; usd: number };

export default function WalletPanel() {
  const { data: wallet } = usePolling<WalletData>("/api/wallet", 12000);
  const { data: state } = usePolling<StatePayload>("/api/state", 4000);
  const { data: live } = usePolling<{ prices: Record<string, number> }>("/api/prices", 5000);

  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [convOpen, setConvOpen] = useState(true);
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  const [cAmt, setCAmt] = useState("");

  const mode = state?.mode ?? "paper";
  const isPaper = mode !== "live";
  const prices = { ...(state?.latest?.signals?.prices_usd ?? {}), ...(live?.prices ?? {}) };
  const pf = state?.portfolio ?? null;

  const priceOf = (sym: string): number => {
    if (STABLE(sym)) return 1;
    return prices[sym] ?? prices[norm(sym)] ?? 0;
  };

  // ── tradeable balances: the PAPER book in paper mode, the real wallet in live ──
  const paperRows: Bal[] = pf
    ? [
        { symbol: pf.base_currency, amount: pf.cash_usd, usd: pf.cash_usd },
        ...Object.values(pf.positions).map((p) => {
          const px = STABLE(p.symbol) ? 1 : priceOf(p.symbol) || p.avg_price_usd;
          return { symbol: p.symbol, amount: p.qty, usd: p.qty * px };
        }),
      ].filter((r) => r.amount > 1e-9 || STABLE(r.symbol))
    : [];
  const realRows: Bal[] = [
    ...(wallet?.native ? [{ symbol: norm(wallet.native.symbol), amount: wallet.native.amount, usd: wallet.native.usd }] : []),
    ...(wallet?.tokens ?? []).map((t) => ({ symbol: t.symbol, amount: t.amount, usd: t.usd })),
  ].filter((r) => r.amount > 1e-9);

  const tradeRows = isPaper ? paperRows : realRows;
  const tradeTotal = isPaper
    ? (state?.equity ?? paperRows.reduce((s, r) => s + r.usd, 0))
    : (wallet?.totalUsd ?? 0);

  // convert FROM = assets you actually hold; default to your largest
  const held = [...tradeRows].filter((r) => r.amount > 1e-9).sort((a, b) => b.usd - a.usd);
  const fromSyms = held.length ? Array.from(new Set(held.map((r) => r.symbol))) : ["USDT"];
  const from = cFrom && fromSyms.includes(cFrom) ? cFrom : fromSyms[0];
  // Convert only TARGETS stablecoins — it's a cash tool, never opens a volatile
  // position. To open a BNB/SOL trade you use Buy (gated + auto-managed exits).
  const toSyms = ["USDC", "USDT"].filter((s) => s !== from);
  const to = cTo && toSyms.includes(cTo) ? cTo : (toSyms.includes("USDT") && from !== "USDT" ? "USDT" : toSyms[0]);

  const fromBal = tradeRows.find((r) => r.symbol === from) ?? { symbol: from, amount: 0, usd: 0 };
  const amtNum = Math.max(0, Number(cAmt) || 0);
  const amountUsd = amtNum * priceOf(from);
  const overBal = amtNum > fromBal.amount + 1e-9;
  const canConvert = from !== to && amtNum > 0 && amountUsd > 0 && !overBal;

  const address = wallet?.address ?? null;
  const funded = !!wallet?.funded;
  const onchainUsd = wallet?.totalUsd ?? 0;

  const convert = async () => {
    if (!canConvert) return;
    const id = toast.loading(`Converting ${amtNum} ${cl(from)} → ${cl(to)}…`);
    try {
      await fetch("/api/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: false }) });
      await fetch("/api/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "swap", from, to, amount_usd: amountUsd }) });
    } catch { toast.update(id, "error", "Network error — try again"); return; }
    const started = Date.now();
    while (Date.now() - started < 28000) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const st = await fetch("/api/state", { cache: "no-store" }).then((r) => r.json());
        if (!st.pendingCommand) {
          const dec = await fetch("/api/decisions?limit=1", { cache: "no-store" }).then((r) => r.json());
          const rec = dec.decisions?.[0];
          const e = rec?.execution;
          if (e?.ok && e.notional_usd > 0) { toast.update(id, "success", `Converted · ${money(e.notional_usd)} → ${cl(to)}`); setCAmt(""); }
          else toast.update(id, "error", `Not filled — ${rec?.decision?.reasons?.[0] ?? "rejected"}`);
          return;
        }
      } catch { /* keep waiting */ }
    }
    toast.update(id, "info", "Submitted — still processing");
  };

  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="glass flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-2">
          <Wallet size={14} className="text-[var(--color-mint)]" />
          <span className="label">agent wallet · bsc</span>
        </div>
        <span className="label px-2 py-0.5 rounded-full"
          style={{ color: isPaper ? "var(--color-cyan)" : "var(--color-mint)", background: isPaper ? "rgba(87,199,255,0.1)" : "rgba(78,230,168,0.1)" }}>
          {isPaper ? "paper" : "live"}
        </span>
      </div>

      <div className="p-5 flex flex-col gap-4 flex-1 overflow-y-auto">
        {/* tradeable balance */}
        <div>
          <div className="label">{isPaper ? "trading balance · paper" : "on-chain value"}</div>
          <div className="display text-[34px] leading-none mt-1">{money(tradeTotal)}</div>
          {isPaper && (
            <div className="text-[11px] text-[var(--color-faint)] mt-1.5 leading-snug">
              Simulated book the agent trades. Your real funds stay on-chain, untouched.
            </div>
          )}
        </div>

        {/* balances */}
        <div>
          <div className="label mb-2.5">{isPaper ? "book holdings" : "balances"}</div>
          <div className="flex flex-col gap-2.5">
            {tradeRows.length === 0 && (
              <div className="text-[12px] text-[var(--color-faint)] tnum">no balances yet</div>
            )}
            {tradeRows.map((b) => (
              <div key={b.symbol} className="flex items-center gap-3">
                <TokenIcon symbol={b.symbol} size={28} />
                <div className="flex-1">
                  <div className="text-[13px]">{cl(b.symbol)}</div>
                  <div className="tnum text-[11px] text-[var(--color-faint)]">
                    {b.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                  </div>
                </div>
                <div className="tnum text-[13px]">{money(b.usd)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* convert (operates on the tradeable book) */}
        <div className="border-t border-[var(--color-line)] pt-4">
          <button onClick={() => setConvOpen((v) => !v)} className="flex items-center justify-between w-full group">
            <span className="flex items-center gap-2">
              <ArrowRightLeft size={13} className="text-[var(--color-mint)]" />
              <span className="label">convert tokens</span>
            </span>
            <span className="label">{convOpen ? "−" : "+"}</span>
          </button>
          {convOpen && (
            <div className="flex flex-col gap-2.5 mt-3">
              <ConvRow label="from" syms={fromSyms} value={from} onChange={setCFrom} />
              <div className="flex justify-center -my-1">
                <button onClick={() => { if (fromSyms.includes(to)) { setCFrom(to); setCTo(from); } }}
                  className="h-6 w-6 rounded-full hairline flex items-center justify-center hover:bg-white/[0.05] disabled:opacity-30"
                  disabled={!fromSyms.includes(to)} title="flip">
                  <ArrowDownUp size={12} className="text-[var(--color-mint)]" />
                </button>
              </div>
              <ConvRow label="to" syms={toSyms} value={to} onChange={setCTo} />
              <div className="panel px-3.5 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="label">amount</span>
                  <button onClick={() => setCAmt(fromBal.amount > 0 ? String(+fromBal.amount.toFixed(6)) : "")}
                    className="label hover:text-[var(--color-mint)] transition-colors">
                    max · {fromBal.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} {cl(from)}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <input type="number" inputMode="decimal" min={0} placeholder="0.00" value={cAmt}
                    onChange={(e) => setCAmt(e.target.value)}
                    className="w-full bg-transparent tnum text-[18px] outline-none" />
                  <span className="tnum text-[13px] text-[var(--color-faint)] shrink-0">{cl(from)}</span>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="tnum text-[11px] text-[var(--color-faint)]">≈ {money(amountUsd)}</span>
                  {overBal && <span className="tnum text-[11px]" style={{ color: "var(--color-danger)" }}>exceeds balance</span>}
                </div>
              </div>
              <button onClick={convert} disabled={!canConvert}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                style={{ background: "var(--color-mint)", color: "#08080b" }}>
                {amtNum > 0 ? `Convert ${amtNum} ${cl(from)} → ${cl(to)}` : `Convert ${cl(from)} → ${cl(to)}`}
              </button>
              <p className="text-[10.5px] text-[var(--color-faint)] leading-snug">
                Cash tool — converts to a stablecoin (closes any holding to cash, never leaves an
                open position). To <span className="text-[var(--color-muted)]">open</span> a BNB/SOL trade, use Buy.
              </p>
            </div>
          )}
        </div>

        {/* on-chain deposit (real wallet) */}
        <div className="border-t border-[var(--color-line)] pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="label">{isPaper ? "on-chain wallet · live" : "deposit address"}</span>
            <span className="tnum text-[10px] px-2 py-0.5 rounded-full"
              style={{ color: funded ? "var(--color-mint)" : "var(--color-amber)", background: funded ? "rgba(78,230,168,0.1)" : "rgba(255,180,77,0.1)" }}>
              {funded ? `funded · ${money(onchainUsd)}` : "awaiting deposit"}
            </span>
          </div>
          <div className="panel px-4 py-3">
            <div className="flex items-center gap-2">
              <code className="tnum text-[13px] text-[var(--color-fg)] flex-1 truncate">{address ?? "—"}</code>
              <button onClick={copy} title="Copy address"
                className="h-8 w-8 flex items-center justify-center rounded-md hairline hover:bg-white/[0.05] transition-colors"
                style={{ color: copied ? "var(--color-mint)" : "var(--color-muted)" }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <button onClick={() => setShowQr((v) => !v)} title="Show QR"
                className="h-8 w-8 flex items-center justify-center rounded-md hairline hover:bg-white/[0.05] transition-colors"
                style={{ color: showQr ? "var(--color-mint)" : "var(--color-muted)" }}>
                <QrCode size={14} />
              </button>
            </div>
            {showQr && address && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <div className="p-3 rounded-xl bg-white">
                  <QRCodeSVG value={address} size={132} bgColor="#ffffff" fgColor="#08080b" level="M" />
                </div>
                <span className="label">scan to deposit · BSC (BEP-20)</span>
              </div>
            )}
            <p className="text-[11px] text-[var(--color-faint)] leading-snug mt-3 flex items-start gap-1.5">
              <ShieldCheck size={13} className="text-[var(--color-mint)] shrink-0 mt-0.5" />
              <span>
                Send <span className="text-[var(--color-fg)]">USDT/USDC</span> (+ a little{" "}
                <span className="text-[var(--color-fg)]">BNB</span> for gas) on <span className="text-[var(--color-fg)]">BNB Smart Chain</span> only.
                {isPaper && " Deployed when you switch to live."}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConvRow({ label, syms, value, onChange }: { label: string; syms: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="panel px-3.5 py-2.5">
      <div className="label mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {syms.map((sym) => {
          const on = value === sym;
          return (
            <button key={sym} onClick={() => onChange(sym)}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] transition-colors"
              style={{ color: on ? "#08080b" : "var(--color-muted)", background: on ? "var(--color-mint)" : "rgba(255,255,255,0.03)" }}>
              <TokenIcon symbol={sym} size={13} />
              {cl(sym)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
