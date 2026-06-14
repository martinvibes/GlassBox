"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { usePrivy } from "@privy-io/react-auth";
import { LogOut, X } from "lucide-react";
import { short } from "@/lib/format";

/**
 * Live Privy sign-in (rendered only when NEXT_PUBLIC_PRIVY_APP_ID is set).
 * Connect with email / social / wallet → non-custodial embedded wallet.
 * Signing out is confirmed first (destructive, never one-click).
 */
export default function PrivyConnect() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const [confirm, setConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setConfirm(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirm]);

  if (!ready) {
    return (
      <div className="rounded-full px-4 py-2 hairline text-[13px] text-[var(--color-faint)] tnum">…</div>
    );
  }

  if (!authenticated) {
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

  const addr = user?.wallet?.address;
  const email = user?.email?.address;
  const label = email ?? short(addr, 4) ?? "connected";

  const confirmModal = (
    <AnimatePresence>
      {confirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-5"
          style={{ background: "rgba(5,6,8,0.78)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
          onClick={() => setConfirm(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="glass max-w-[400px] w-full p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="display text-[24px]">Sign out?</h3>
              <button onClick={() => setConfirm(false)} className="text-[var(--color-faint)] hover:text-[var(--color-fg)] transition-colors">
                <X size={18} />
              </button>
            </div>
            <p className="text-[13px] text-[var(--color-muted)] leading-relaxed mb-6">
              You will disconnect <span className="text-[var(--color-fg)] tnum">{label}</span> from GlassBox.
              Your funds and embedded wallet stay safe — sign back in anytime.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-xl px-4 py-2.5 text-[13px] hairline hover:bg-white/[0.04] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirm(false);
                  logout();
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-colors"
                style={{ background: "rgba(255,93,108,0.14)", color: "var(--color-danger)" }}
              >
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        className="group inline-flex items-center gap-2 rounded-full px-3.5 py-2 hairline text-[13px] transition-colors hover:bg-white/[0.04]"
        style={{ background: "rgba(255,255,255,0.02)" }}
        title="Account"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-mint)]" style={{ boxShadow: "0 0 8px var(--color-mint)" }} />
        <span className="tnum text-[var(--color-fg)] max-w-[140px] truncate">{label}</span>
        <LogOut size={13} className="text-[var(--color-faint)] group-hover:text-[var(--color-danger)] transition-colors" />
      </button>
      {mounted && createPortal(confirmModal, document.body)}
    </>
  );
}
