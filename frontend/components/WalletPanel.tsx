"use client";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, QrCode, Wallet } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { money } from "@/lib/format";

type WalletData = {
  ok: boolean;
  address: string | null;
  chain?: string;
  native?: { symbol: string; amount: number; usd: number };
  tokens?: { symbol: string; amount: number; usd: number; isStable: boolean }[];
  totalUsd?: number;
  funded?: boolean;
};

const TOKEN_TINT: Record<string, string> = {
  USDT: "var(--color-mint)",
  USDC: "var(--color-cyan)",
  BNB: "var(--color-amber)",
  WBNB: "var(--color-amber)",
  BTCB: "#f7931a",
  ETH: "var(--color-violet)",
  CAKE: "#d1884f",
};

export default function WalletPanel() {
  const { data } = usePolling<WalletData>("/api/wallet", 12000);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

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
                <span
                  className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                  style={{ background: `${TOKEN_TINT[b.symbol] ?? "var(--color-muted)"}22`, color: TOKEN_TINT[b.symbol] ?? "var(--color-muted)" }}
                >
                  {b.symbol.slice(0, 3)}
                </span>
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
      </div>
    </div>
  );
}
