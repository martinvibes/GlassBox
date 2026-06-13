"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, Wallet, Sparkles, X } from "lucide-react";

/**
 * Sign-in entry point — designed for Privy ("connect with anything": email,
 * social, passkey, or external wallet → non-custodial embedded wallet).
 * GlassBox never holds keys. Live login activates once a Privy App ID is set
 * (NEXT_PUBLIC_PRIVY_APP_ID) and the per-session agent backend is wired.
 */
const METHODS = [
  { icon: Mail, label: "Email", note: "magic link" },
  { icon: Sparkles, label: "Social", note: "Google · X · passkey" },
  { icon: Wallet, label: "Wallet", note: "any EVM wallet" },
];

export default function ConnectWallet() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ready = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  useEffect(() => setMounted(true), []);

  const modal = (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-5"
            style={{ background: "rgba(5,6,8,0.78)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              className="glass max-w-[420px] w-full p-7"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="display text-[26px]">
                  Join the <span className="italic" style={{ color: "var(--color-mint)" }}>desk</span>
                </h3>
                <button
                  onClick={() => setOpen(false)}
                  className="text-[var(--color-faint)] hover:text-[var(--color-fg)] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-[13px] text-[var(--color-muted)] leading-relaxed mb-6">
                Connect with anything — email, social, or a wallet. GlassBox provisions a
                <span className="text-[var(--color-fg)]"> non-custodial</span> wallet and runs a
                transparent, risk-gated agent on it. <span className="text-[var(--color-fg)]">We never hold your keys.</span>
              </p>

              <div className="space-y-2.5">
                {METHODS.map((m) => (
                  <button
                    key={m.label}
                    disabled={!ready}
                    className="w-full flex items-center gap-3.5 rounded-xl px-4 py-3 hairline text-left transition-colors"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      cursor: ready ? "pointer" : "not-allowed",
                      opacity: ready ? 1 : 0.6,
                    }}
                  >
                    <m.icon size={17} style={{ color: "var(--color-mint)" }} />
                    <span className="flex-1">
                      <span className="text-[14px] block">Continue with {m.label}</span>
                      <span className="label">{m.note}</span>
                    </span>
                    <span className="tnum text-[12px] text-[var(--color-faint)]">{ready ? "→" : ""}</span>
                  </button>
                ))}
              </div>

              {!ready && (
                <p className="text-[11px] text-[var(--color-faint)] mt-5 leading-relaxed tnum">
                  Powered by Privy — activates once NEXT_PUBLIC_PRIVY_APP_ID is set and the
                  per-session agent backend is wired.
                </p>
              )}

              <div className="mt-5 pt-4 border-t border-[var(--color-line)] flex items-center justify-between">
                <span className="label">competition agent</span>
                <span className="tnum text-[11px] text-[var(--color-muted)]">single registered wallet · live</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-transform hover:scale-[1.03] active:scale-95"
        style={{ background: "var(--color-mint)", color: "#07080a", boxShadow: "0 0 22px -8px var(--color-mint)" }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#07080a" }} />
        Sign in
      </button>
      {mounted && createPortal(modal, document.body)}
    </>
  );
}
