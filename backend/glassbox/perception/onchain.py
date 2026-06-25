"""Read on-chain BEP-20 balances directly via JSON-RPC `eth_call(balanceOf)`.

TWAK's `wallet portfolio` API misses some token holdings (it never reported a freshly
bought AVAX even after `wallet register`), which made the agent lose sight of a real
position and stop managing its risk. Reading balances straight from the chain is the
source of truth — deterministic and independent of any backend indexer.
"""
from __future__ import annotations

import httpx

# Public BSC RPC endpoints (tried in order; first success wins per token).
_RPCS = [
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.defibit.io",
    "https://bsc.publicnode.com",
    "https://rpc.ankr.com/bsc",
]

_BALANCE_OF = "0x70a08231"  # balanceOf(address) selector


def _balance_of(client: httpx.Client, rpc: str, token_addr: str, wallet_no0x: str) -> int:
    data = _BALANCE_OF + "0" * 24 + wallet_no0x  # 12-byte left-pad + 20-byte address
    payload = {"jsonrpc": "2.0", "method": "eth_call",
               "params": [{"to": token_addr, "data": data}, "latest"], "id": 1}
    r = client.post(rpc, json=payload, timeout=10)
    r.raise_for_status()
    res = r.json().get("result")
    return int(res, 16) if res and res not in ("0x", "0x0") else 0


def token_balances(wallet: str, tokens: dict, rpc_url: str | None = None) -> dict[str, float]:
    """Return {symbol: float balance} for every allowlisted token the wallet holds
    (non-zero), read on-chain. `tokens` maps symbol -> TokenInfo (needs .address, .decimals).
    Raises if EVERY rpc/token call fails (caller treats that as 'keep last book')."""
    rpcs = ([rpc_url] if rpc_url else []) + _RPCS
    wallet_no0x = wallet.lower().replace("0x", "").rjust(40, "0")
    out: dict[str, float] = {}
    any_ok = False
    with httpx.Client() as client:
        for sym, tok in tokens.items():
            for rpc in rpcs:
                try:
                    raw = _balance_of(client, rpc, tok.address, wallet_no0x)
                    any_ok = True
                    if raw > 0:
                        out[sym] = raw / (10 ** int(tok.decimals))
                    break  # this token done
                except Exception:
                    continue  # try next rpc
    if not any_ok:
        raise RuntimeError("all BSC RPC endpoints failed")
    return out
