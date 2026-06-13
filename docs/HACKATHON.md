# BNB HACK: AI Trading Agent Edition — verified facts

Independently confirmed June 2026 via Chainwire / Benzinga / CoinMarketCap / KuCoin
press releases. The DoraHacks `/detail` page and the X posts block automated fetching,
so a few internal numbers (exact DD %, min-trade count, full token allowlist) still
need confirming directly on the page — treat rulebook values as conservative until then.

## Structure
- **Total pool: $36,000.** Two tracks. Build window **June 3–21, 2026**; judging the week after.
- Hosted on DoraHacks: https://dorahacks.io/hackathon/bnbhack-twt-cmc
- Partners: **BNB Chain + CoinMarketCap + Trust Wallet.**

## Track 1 — Autonomous Trading Agents (our target)
- **$24,000 across 5 winners.** Top prize **$10,000** + four runners-up.
- **Live trading on BSC during a one-week window: June 22–28, 2026.**
- Scored on **real PnL**, subject to a **max-drawdown cap** as a risk safeguard.
- **Trust Wallet Agent Kit (TWAK) is mandatory:** local self-custody signing,
  autonomous operation mode, on-chain execution on native BNB venues
  (PancakeSwap spot, BSC perpetual contracts).

## Track 2 — Strategy Skills (not our target)
- Build CMC Skills that generate backtestable strategies from market data; no live
  execution. Judged by an expert panel on technical execution, originality, relevance.
- Prizes: $3,000 / $2,000 / $1,000.

## Special prizes (stackable with main placement)
- **$2,000 each** for best use of: **CMC Agent Hub**, **Trust Wallet Agent Kit**,
  **BNB AI Agent SDK**. ($6,000 total.)
- Winners also eligible for: API credits, **Claude API compute**, mentorship,
  Kickstart consideration, Trust Wallet Developer Portal listing.

## Sponsor stacks
- **CMC Agent Hub** — decision-ready signals (not raw API). MCP endpoint
  `https://mcp.coinmarketcap.com/mcp`, header `X-CMC-MCP-API-KEY`; x402 pay-per-call path.
- **TWAK** — `npm i -g @trustwallet/cli`; `twak serve` exposes MCP tools; agent-wallet
  autonomous mode (no per-tx approval); keys in `~/.twak/`.
- **BNB AI Agent SDK** — ERC-8004 identity + agent commerce. NOTE (corrected via the
  installed `twak` CLI v0.19.1): the **ERC-8004 registry is deployed on `bsc` mainnet
  AND `bsctestnet`** — usable now via `twak erc8004`. The earlier "testnet-only" caveat
  referred to the standalone bnbagent Python SDK; we use the TWAK CLI's erc8004 instead.

## Verified from the installed TWAK CLI (v0.19.1)
- BSC chain key is **`bsc`** (eip155). `twak chains` lists 25+ chains.
- **`twak compete register` / `twak compete status`** — the hackathon registration is a
  first-class CLI command ("BNB HACK: AI TRADING AGENT EDITION — register and check status (BSC)").
  It has a registration deadline (check via `compete status`).
- `twak swap <amt> <from> <to> --chain bsc --slippage <pct> [--usd <amt>] [--quote-only] [--json]`.
- Assets: `c714_t0x<contract>` for BEP-20 (714 = BSC). Tokens in the registry may resolve by symbol.
- `twak wallet portfolio --chains bsc --json` → live USD balances (for reconciliation).
- `twak auth setup --api-key <id> --api-secret <secret>` is non-interactive.
- All data/trade commands require API credentials (portal.trustwallet.com). Wallet password
  stored in OS keychain by default.

## Strategic read (why "GlassBox")
A 7-day, capped-drawdown, low-min-trade live PnL contest rewards **survival over alpha**:
- Over ~7 trades you can't prove statistical edge, but you can blow up. Most entrants
  over-leverage perps and trip the drawdown cap → self-DQ.
- Win by capital preservation: default flat/stablecoin, deploy only on conviction,
  hard-flatten at an internal ceiling well inside the cap.
- Layer transparency (auditable reasoning log + dashboard) + clean integration of all
  three sponsor stacks to also sweep the $2k specials.

## TODO — confirm on the DoraHacks /detail page
- [ ] Exact max-drawdown % (DQ threshold).
- [ ] Exact minimum trade count / activity rule.
- [ ] The official BEP-20 token allowlist (~149 tokens).
- [ ] Whether mainnet or testnet is required for the live window.
- [ ] Whether the BNB SDK mainnet contracts go live before the window.

## Sources
- https://chainwire.org/2026/06/03/bnb-chain-coinmarketcap-and-trust-wallet-launch-36000-bnb-hack-ai-trading-agent-edition/
- https://chainwire.org/2026/06/03/bnb-chain-launches-36000-hackathon-to-advance-on-chain-ai-trading-agents/
- https://www.benzinga.com/pressreleases/26/06/52966611/bnb-chain-coinmarketcap-and-trust-wallet-launch-36-000-bnb-hack-ai-trading-agent-edition
- https://www.kucoin.com/news/flash/trust-wallet-launches-ai-trading-agent-hackathon-with-bnb-chain-and-coinmarketcap-total-prize-pool-of-36-000
- https://dorahacks.io/hackathon/bnbhack-twt-cmc
