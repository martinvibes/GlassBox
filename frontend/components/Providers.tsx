"use client";
import { PrivyProvider } from "@privy-io/react-auth";

/**
 * Wraps the app in Privy when an App ID is configured. Non-custodial: Privy
 * provisions embedded wallets secured by the user's auth; GlassBox never holds
 * raw keys. If no App ID is set, renders children plain (fallback sign-in modal).
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#4ee6a8",
          logo: undefined,
          walletChainType: "ethereum-only",
        },
        loginMethods: ["email", "google", "twitter", "wallet"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          showWalletUIs: true,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
