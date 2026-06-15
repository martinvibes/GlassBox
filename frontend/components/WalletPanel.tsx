"use client";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, QrCode, Wallet, ArrowRightLeft, ArrowDownUp } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { money } from "@/lib/format";
import { toast } from "@/lib/toast";
import TokenIcon from "./TokenIcon";

const CONV_TOKENS = [
  { label: "USDC", sym: "USDC" },
  { label: "USDT", sym: "USDT" },
  { label: "BNB", sym: "WBNB" },
  { label: "BTC", sym: "BTCB" },
  { label: "ETH", sym: "ETH" },
  { label: "SOL", sym: "SOL" },
  { label: "CAKE", sym: "CAKE" },
];
const cl = (s: string) => CONV_TOKENS.find((t) => t.sym === s)?.label ?? s;

type WalletData = {
  ok: boolean;
  address: string | null;
  chain?: string;
  native?: { symbol: string; amount: number; usd: number };
  tokens?: { symbol: string; amount: number; usd: number; isStable: boolean }[];
  totalUsd?: number;
  funded?: boolean;
};

export default function WalletPanel() {
  const { data } = usePolling<WalletData>("/api/wallet", 12000);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [convOpen, setConvOpen] = useState(false);
  const [cFrom, setCFrom] = useState("USDC");
  const [cTo, setCTo] = useState("USDT");
  const [cPct, setCPct] = useState(100);

  const convert = async () => {
    if (cFrom === cTo) return;
    const id = toast.loading(`Converting ${cl(cFrom)} → ${cl(cTo)}…`);
    try {
      await fetch("/api/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: false }) });
      await fetch("/api/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "swap", from: cFrom, to: cTo, size_pct: cPct }) });
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
          if (e?.ok && e.notional_usd > 0) toast.update(id, "success", `Converted · ${money(e.notional_usd)} → ${cl(cTo)}`);
          else toast.update(id, "error", `Not filled — ${rec?.decision?.reasons?.[0] ?? "rejected"}`);
          return;
        }
      } catch { /* keep waiting */ }
    }
    toast.update(id, "info", "Submitted — still processing");
  };

  const address = data?.address ?? null;
  const funded = !!data?.funded;
  const rows = [
    ...(data?.native ? [{ ...data.native, isStable: false }] : []),
    ...(data?.tokens ?? []),
  ].filter((r) => r.amount > 0 || r.isStable);

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
        <span
          className="label px-2 py-0.5 rounded-full"
          style={{
            color: funded ? "var(--color-mint)" : "var(--color-amber)",
            background: funded ? "rgba(78,230,168,0.1)" : "rgba(255,180,77,0.1)",
          }}
        >
          {funded ? "funded" : "awaiting deposit"}
        </span>
      </div>

      <div className="p-5 flex flex-col gap-4 flex-1 overflow-y-auto">
        {/* total */}
        <div>
          <div className="label">on-chain value</div>
          <div className="display text-[34px] leading-none mt-1">{money(data?.totalUsd ?? 0)}</div>
        </div>

        {/* address + actions */}
        <div className="panel px-4 py-3">
          <div className="label mb-2">deposit address</div>
          <div className="flex items-center gap-2">
            <code className="tnum text-[13px] text-[var(--color-fg)] flex-1 truncate">
              {address ?? "—"}
            </code>
            <button
              onClick={copy}
              title="Copy address"
              className="h-8 w-8 flex items-center justify-center rounded-md hairline hover:bg-white/[0.05] transition-colors"
              style={{ color: copied ? "var(--color-mint)" : "var(--color-muted)" }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button
              onClick={() => setShowQr((v) => !v)}
              title="Show QR"
              className="h-8 w-8 flex items-center justify-center rounded-md hairline hover:bg-white/[0.05] transition-colors"
              style={{ color: showQr ? "var(--color-mint)" : "var(--color-muted)" }}
            >
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
          <p className="text-[11px] text-[var(--color-faint)] leading-snug mt-3">
            Send <span className="text-[var(--color-fg)]">USDT/USDC</span> (+ a little{" "}
            <span className="text-[var(--color-fg)]">BNB</span> for gas) on <span className="text-[var(--color-fg)]">BNB Smart Chain</span> only.
          </p>
        </div>

        {/* balances */}
        <div>
          <div className="label mb-2.5">balances</div>
          <div className="flex flex-col gap-2.5">
            {rows.length === 0 && (
              <div className="text-[12px] text-[var(--color-faint)] tnum">no balances yet — fund the wallet above</div>
            )}
            {rows.map((b) => (
              <div key={b.symbol} className="flex items-center gap-3">
                <TokenIcon symbol={b.symbol} size={28} />
                <div className="flex-1">
                  <div className="text-[13px]">{b.symbol}</div>
                  <div className="tnum text-[11px] text-[var(--color-faint)]">
                    {b.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                  </div>
                </div>
                <div className="tnum text-[13px]">{money(b.usd)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* convert tokens (utility) */}
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
              <ConvRow label="from" value={cFrom} onChange={setCFrom} exclude={cTo} />
              <div className="flex justify-center -my-1">
                <button onClick={() => { const a = cFrom; setCFrom(cTo); setCTo(a); }}
                  className="h-6 w-6 rounded-full hairline flex items-center justify-center hover:bg-white/[0.05]" title="flip">
                  <ArrowDownUp size={12} className="text-[var(--color-mint)]" />
                </button>
              </div>
              <ConvRow label="to" value={cTo} onChange={setCTo} exclude={cFrom} />
              <div className="panel px-3.5 py-2 flex items-center justify-between">
                <span className="label">amount</span>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={1} max={100} value={cPct} onChange={(e) => setCPct(Math.max(1, Math.min(100, +e.target.value)))}
                    className="w-12 bg-transparent tnum text-[13px] outline-none text-right" />
                  <span className="tnum text-[11px] text-[var(--color-faint)]">%</span>
                </div>
              </div>
              <button onClick={convert}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-transform hover:scale-[1.01] active:scale-95"
                style={{ background: "var(--color-mint)", color: "#08080b" }}>
                Convert {cl(cFrom)} → {cl(cTo)}
              </button>
              <p className="text-[10.5px] text-[var(--color-faint)] leading-snug">
                One-tap convert (e.g. USDC → USDT). Runs through the agent on its next cycle.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConvRow({ label, value, onChange, exclude }: { label: string; value: string; onChange: (v: string) => void; exclude?: string }) {
  return (
    <div className="panel px-3.5 py-2.5">
      <div className="label mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {CONV_TOKENS.filter((t) => t.sym !== exclude).map((t) => (
          <button key={t.sym} onClick={() => onChange(t.sym)}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] transition-colors"
            style={{ color: value === t.sym ? "#08080b" : "var(--color-muted)", background: value === t.sym ? "var(--color-mint)" : "rgba(255,255,255,0.03)" }}>
            <TokenIcon symbol={t.sym} size={13} />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
