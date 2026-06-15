"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Wallet, X } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { money } from "@/lib/format";
import WalletPanel from "./WalletPanel";

export default function DepositButton() {
  const { data } = usePolling<{ totalUsd?: number; funded?: boolean }>("/api/wallet", 12000);
  const { data: state } = usePolling<{ mode?: string; equity?: number }>("/api/state", 5000);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open]);

  const isPaper = (state?.mode ?? "paper") !== "live";
  // pill reflects what the button opens to: the paper trading balance in paper
  // mode, the real on-chain balance in live mode.
  const total = isPaper ? (state?.equity ?? 0) : (data?.totalUsd ?? 0);
  const funded = !!data?.funded;

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-5"
          style={{ background: "rgba(5,6,8,0.78)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="w-[440px] max-w-[92vw] h-[560px] max-h-[86vh] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute -top-3 -right-3 z-10 h-8 w-8 rounded-full hairline flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-fg)]"
              style={{ background: "var(--color-ink)" }}
            >
              <X size={16} />
            </button>
            <WalletPanel />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium transition-transform hover:scale-[1.03] active:scale-95"
        style={{ background: "var(--color-mint)", color: "#08080b", boxShadow: "0 0 22px -10px var(--color-mint)" }}
        title="Deposit / wallet"
      >
        <Wallet size={13} />
        <span>Deposit</span>
        <span className="tnum" style={{ opacity: 0.75 }}>· {money(total)}</span>
        {!funded && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#08080b" }} />}
      </button>
      {mounted && createPortal(modal, document.body)}
    </>
  );
}
