# GlassBox — setup guide

Perception runs on real data with **zero setup**. The steps below are only needed to
make **execution real** (TWAK) and to add richer signals (CMC) / on-chain proof (BNB SDK).

## 0. Backend (always works, no keys)
```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
glassbox --mode paper --once     # real market data, simulated fills
pytest -q                        # 22 tests
```

## 1. Trust Wallet Agent Kit (TWAK) — real execution
Verified against developer.trustwallet.com (Agent SDK docs).

### Get your keys  ← THIS is the only human step
The CLI is already installed (`twak --version` → 0.19.1). `twak auth status` currently
shows **not configured**. You need to create API credentials:

1. Go to **https://portal.trustwallet.com** and sign in.
2. **Create an app**, then **create an API key** inside that app.
3. Copy the **Access ID** and the **HMAC Secret**.
   ⚠️ The **HMAC Secret is shown only once** — save it immediately.
4. Hand them over (or run it yourself) — credential setup is non-interactive:
   ```bash
   twak auth setup --api-key <ACCESS_ID> --api-secret <HMAC_SECRET>
   twak auth status            # should now show "configured"
   ```
   You can also just put them in `backend/.env` (`TWAK_ACCESS_ID`, `TWAK_HMAC_SECRET`).

### Create + fund the agent wallet
```bash
twak wallet create --password "<a-strong-password>"   # saves password to OS keychain by default
twak wallet address --chain bsc                       # the BSC address to fund
twak wallet portfolio --chains bsc --json             # confirm holdings/USD values
```
- The password is stored in the **OS keychain** (no need to put it in `.env`; commands
  fall back to keychain or `TWAK_WALLET_PASSWORD`). Put the address in `TWAK_WALLET_ADDRESS`.
- **Fund it on BSC**: send a little **BNB** (gas) and your trading **USDT** to that address.
  Start tiny for the test window.
- ⚠️ **Back up the seed phrase** shown at creation — it controls real funds.

### Register for the hackathon (built into the CLI!)
```bash
twak compete status     # shows registration state + the registration deadline
twak compete register   # registers your agent wallet for BNB HACK Track 1 (BSC)
```

### Go live
```bash
glassbox --mode live --once     # quotes then executes one real swap if the gate allows
```
- Auth is **HMAC-SHA256**; the CLI signs **locally** with the `~/.twak/` keystore — the
  private key never enters the GlassBox process.
- Slippage tolerance comes from `rules/rulebook.yaml` (`limits.max_slippage_bps`).
- GlassBox **quotes first** (`--quote-only`), then executes — so bad routing fails safe.

> Auth/signing details (for reference): signature string is
> `METHOD + PATH + QUERY + ACCESS_ID + NONCE + DATE`, HMAC-SHA256 → base64, sent via
> headers `X-TW-Credential`, `X-TW-Nonce`, `X-TW-Date`, `Authorization`. The CLI does
> this for us; we don't reimplement it.

## 2. CMC Agent Hub — richer signals (optional, Best CMC special)
- Get an API key, set `CMC_MCP_API_KEY` in `.env`. Endpoint `https://mcp.coinmarketcap.com/mcp`,
  header `X-CMC-MCP-API-KEY`. Wire `_cmc_signals()` in `backend/glassbox/perception/cmc.py`.

## 3. On-chain proof — ERC-8004 identity + decision anchoring
Already wired via the `twak erc8004` CLI (registry deployed on `bsc` AND `bsctestnet`,
so no separate testnet-only SDK needed). Uses the same funded TWAK wallet.
```bash
# enable in .env: BNB_ANCHORING_ENABLED=true  GLASSBOX_ANCHOR_CHAIN=bsctestnet (dev) | bsc (live)
twak erc8004 register --uri 'data:application/json,{"name":"GlassBox"}' --chain bsctestnet --json
```
GlassBox mints the identity once (cached in `data/agent_identity.json`) and writes each
decision hash to its on-chain metadata. Costs gas — keep OFF until the live window/demo.

## Security
- Never commit `.env` (gitignored). Keys live in `~/.twak/` and env only.
- The wallet password is passed to the CLI and never logged by GlassBox.
- Start the live window with **small** capital and conservative rulebook values.
