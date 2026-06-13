"use client";
import { usePrivy } from "@privy-io/react-auth";
import { short } from "@/lib/format";

/**
 * Live Privy sign-in (rendered only when NEXT_PUBLIC_PRIVY_APP_ID is set).
 * Connect with email / social / wallet → non-custodial embedded wallet.
 */
export default function PrivyConnect() {
  const { ready, authenticated, user, login, logout } = usePrivy();

  if (!ready) {
    return (
      <div className="rounded-full px-4 py-2 hairline text-[13px] text-[var(--color-faint)] tnum">
        …
      </div>
    );
  }

  if (authenticated) {
    const addr = user?.wallet?.address;
    const email = user?.email?.address;
    const label = email ?? short(addr, 4) ?? "connected";
    return (
      <button
        onClick={() => logout()}
        className="group inline-flex items-center gap-2 rounded-full px-3.5 py-2 hairline text-[13px] transition-colors hover:bg-white/[0.04]"
        style={{ background: "rgba(255,255,255,0.02)" }}
        title="Click to sign out"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-mint)]" style={{ boxShadow: "0 0 8px var(--color-mint)" }} />
        <span className="tnum text-[var(--color-fg)] max-w-[140px] truncate">{label}</span>
        <span className="label group-hover:text-[var(--color-danger)] transition-colors">exit</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => login()}
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-transform hover:scale-[1.03] active:scale-95"
      style={{ background: "var(--color-mint)", color: "#07080a", boxShadow: "0 0 22px -8px var(--color-mint)" }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#07080a" }} />
      Sign in
    </button>
  );
}
