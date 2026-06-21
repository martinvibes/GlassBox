# GlassBox — Live Trading Runbook (competition week)

Real funds on BSC, self-custody. The wallet signs **locally** via the `~/.twak` keystore;
the private key never leaves the machine. The agent **stands by** (reconcile + risk-exits
only) until `GLASSBOX_TRADE_AFTER`, then trades autonomously inside the risk gate.

## Status (set up 2026-06-21)
- **Wallet** `0x3D0d14207eb8Ef26b5110786C4b625b67D9083BE` — registered on-chain ✅
- **Funded**: ~$9.98 **USDT** + ~$2.35 BNB (gas). USDC was converted to USDT (base currency).
  - conversion tx: `0xaecbbd11c7fdd912bffb92d7d5be5915b73fba467a2722be8dd9f885fe616d36` (proved live swaps work; gas is sponsored)
- **Trading starts**: `2026-06-22T07:00:00+01:00` (07:00 WAT = 06:00 UTC)
- **Mode**: live; heartbeat 120s.

## Risk posture (tuned for a $10 book — "never lose ~$1")
- **Internal drawdown ceiling 7%** → flatten everything at ≈$0.70 down from the high-water
  mark (inside the $1 line, far inside the 30% DQ cap).
- **At most 2 small positions**, target ~22% each (~$2.20); regime caps keep most of the book
  in stablecoin (neutral ≤25% deployed, risk_on ≤40%).
- **Stop-loss −1.5%**, trailing stop arms at +1.2% / trails 0.4% — winners run, losers cut fast.
- **Selective**: only enters on high-conviction setups (conviction ≥0.62) and skips broad
  downtrends (market-breadth filter). It will mostly hold cash.
- **≥1 trade/day** satisfied by a zero-risk USDT↔USDC keep-alive on quiet days (stays qualified
  without market risk).

## Go live
Foreground (simplest — keep the terminal open):
```bash
bash deploy/run_live.sh
```
Resilient (survives crashes/reboots — recommended for the week):
```bash
cp deploy/com.glassbox.live.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.glassbox.live.plist
```
Either way it stands by until 07:00 and trades after. **Keep the Mac plugged in and awake**
(`caffeinate` is built into the script; closing the lid on a laptop may still sleep it).

## Monitor
```bash
tail -f /tmp/glassbox.live.out                 # launchd logs
twak wallet portfolio --json                   # real balances
twak compete status                            # registration
```
Or run the dashboard locally (reads backend/data): `cd frontend && npm run dev`.

## Stop / pause
- **Stop** (launchd): `launchctl bootout gui/$(id -u)/com.glassbox.live`
- **Stop** (foreground): Ctrl-C
- **Pause without stopping**: set `{"paused": true}` in `backend/data/control.json` (or the
  dashboard Pause button) — risk exits still run, no new entries.

## Emergency flatten (everything → USDT, now)
```bash
# the gate also auto-flattens at the 7% ceiling; this is the manual override
twak swap <TOKEN_QTY> <TOKEN_ADDR> 0x55d398326f99059fF775485246999027B3197955 --chain bsc --slippage 0.8 --json
```

## Going live on Railway (24/7 cloud — laptop-independent)

Runs the live agent in the cloud so uptime doesn't depend on your Mac. The wallet still
signs with TWAK; the keystore is shipped to Railway as encrypted env vars (the wallet file
stays encrypted, the password is a separate var). Still self-custody — it's *your* deploy
signing with *your* key, no third-party custodian.

> Run the live agent in **ONE place only**. If you go cloud, do NOT also run `run_live.sh`
> locally — two agents on one wallet would double-trade.

**1. Generate the two keystore values** (run locally; copies to clipboard, never leaves your machine):
```bash
base64 -i ~/.twak/wallet.json      | tr -d '\n' | pbcopy   # → TWAK_WALLET_JSON_B64
base64 -i ~/.twak/credentials.json | tr -d '\n' | pbcopy   # → TWAK_CREDENTIALS_JSON_B64
```

**2. Push** (rebuilds the image with the TWAK CLI baked in):
```bash
git push
```

**3. Set Railway env vars** (service → Variables) and redeploy:
| Variable | Value |
|---|---|
| `GLASSBOX_MODE` | `live` |
| `GLASSBOX_TRADE_AFTER` | `2026-06-22T07:00:00+01:00` |
| `GLASSBOX_HEARTBEAT_SECONDS` | `120` |
| `TWAK_WALLET_ADDRESS` | `0x3D0d14207eb8Ef26b5110786C4b625b67D9083BE` |
| `TWAK_WALLET_PASSWORD` | *(your wallet password)* |
| `TWAK_WALLET_JSON_B64` | *(from step 1)* |
| `TWAK_CREDENTIALS_JSON_B64` | *(from step 1)* |
| `TWAK_ACCESS_ID` / `TWAK_HMAC_SECRET` | *(your TWAK API creds)* |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `GLASSBOX_LLM_MODEL` | `claude-haiku-4-5-20251001` |
| `GLASSBOX_CONTROL_SECRET` | *(optional — set any string to lock the dashboard's pause/flatten buttons; pass it as `?key=...` to use them)* |

Keep the persistent volume mounted at `/app/backend/data`. On boot the container restores the
keystore, reconciles the real wallet (~$10), stands by until 07:00, then trades. Watch it in
Railway's deploy logs (look for `reconciled wallet: equity $9.98` and `standing by`).

**Rotate** the wallet password + API keys after the competition (they lived in cloud env).

## Honest caveats
- $10 is small: a normal position is ~10–22% of the book, and fees/slippage bite more than on
  a large book. The agent trades rarely and small by design.
- Uptime is on you: if the Mac sleeps/loses network for a whole day, the daily keep-alive may
  miss and risk the activity rule. Keep it awake and online.
- Top up anytime (send USDT to the wallet) — reconciliation picks it up next cycle; more capital
  makes positions clear the $1 minimum more comfortably.
