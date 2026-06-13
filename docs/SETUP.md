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

### Get your keys
1. Install the CLI: `npm i -g @trustwallet/cli`  (verify: `twak --version`).
2. Go to **https://portal.trustwallet.com** and sign in.
3. **Create an app**, then **create an API key** inside that app.
4. Copy the **Access ID** and the **HMAC Secret**.
   ⚠️ The **HMAC Secret is shown only once** — save it immediately.
5. Put them in `backend/.env`:
   ```
   TWAK_ACCESS_ID=...
   TWAK_HMAC_SECRET=...
   ```

### Create + fund the agent wallet
```bash
twak wallet create --password "<a-strong-password>"   # the agent's own self-custody wallet
twak wallet balance --chain bsc --all --json          # find/confirm the address
```
- Put the password in `.env` as `TWAK_WALLET_PASSWORD` and the address as `TWAK_WALLET_ADDRESS`.
- **Fund it on BSC**: send a little **BNB** (for gas) and your trading **USDT** to that address.
  Start tiny for the test window.

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

## 3. BNB AI Agent SDK — on-chain proof (optional, Best BNB SDK special)
- ⚠️ testnet-only right now. Set `BNB_AGENT_PRIVATE_KEY`, `BNB_ANCHORING_ENABLED=true`.
  Wire `register_identity()` / `anchor()` in `backend/glassbox/verify/anchor.py`.

## Security
- Never commit `.env` (gitignored). Keys live in `~/.twak/` and env only.
- The wallet password is passed to the CLI and never logged by GlassBox.
- Start the live window with **small** capital and conservative rulebook values.
