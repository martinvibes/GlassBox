"use client";

type Partner = { name: string; src?: string };

const PARTNERS: Partner[] = [
  { name: "CoinMarketCap", src: "/logos/coinmarketcap.svg" },
  { name: "Trust Wallet", src: "/logos/trustwallet.svg" },
  { name: "BNB Chain", src: "/logos/bnbchain.svg" },
  { name: "Privy" }, // lettermark
  { name: "Claude", src: "/logos/claude.svg" },
];

function Item({ p }: { p: Partner }) {
  return (
    <div className="flex items-center gap-2.5 px-8 shrink-0 opacity-60 hover:opacity-100 transition-opacity duration-300">
      {p.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.src} alt={p.name} className="h-5 w-auto" />
      ) : (
        <span
          className="h-5 w-5 rounded-[6px] flex items-center justify-center text-[11px] font-semibold"
          style={{ background: "rgba(154,160,171,0.14)", color: "#9aa0ab" }}
        >
          {p.name[0]}
        </span>
      )}
      <span className="text-[16px] md:text-[18px] tracking-tight text-[var(--color-muted)] whitespace-nowrap">
        {p.name}
      </span>
    </div>
  );
}

export default function LogoMarquee() {
  // duplicated once → translateX(-50%) loops seamlessly
  const loop = [...PARTNERS, ...PARTNERS];
  return (
    <div className="marquee-mask overflow-hidden">
      <div className="marquee-track py-1">
        {loop.map((p, i) => (
          <Item key={i} p={p} />
        ))}
      </div>
    </div>
  );
}
