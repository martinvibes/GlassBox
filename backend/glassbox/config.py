"""Configuration: loads env, the rulebook, and the token allowlist.

Everything the gate needs to make deterministic decisions is resolved here once
at startup and passed down — the gate itself reads no files and touches no env.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # dotenv is optional
    pass

REPO_ROOT = Path(__file__).resolve().parent.parent
RULES_DIR = REPO_ROOT / "rules"


@dataclass
class TokenInfo:
    symbol: str
    address: str
    decimals: int
    is_stable: bool


@dataclass
class Settings:
    mode: str
    heartbeat_seconds: int
    data_dir: Path
    rulebook: dict[str, Any]
    allowlist: dict[str, TokenInfo]            # symbol -> TokenInfo
    base_currency: str
    # live-stack credentials (empty in paper mode)
    cmc_mcp_api_key: str = ""
    cmc_mcp_endpoint: str = ""
    cmc_x402_enabled: bool = False
    anthropic_api_key: str = ""
    llm_model: str = "claude-opus-4-8"
    twak_access_id: str = ""
    twak_hmac_secret: str = ""
    twak_mcp_endpoint: str = ""
    twak_wallet_address: str = ""
    twak_wallet_password: str = ""
    bnb_agent_private_key: str = ""
    bnb_rpc_url: str = ""
    bnb_anchoring_enabled: bool = False
    env: dict[str, str] = field(default_factory=dict)

    @property
    def is_live(self) -> bool:
        return self.mode == "live"


def _load_rulebook(path: Path | None = None) -> dict[str, Any]:
    path = path or (RULES_DIR / "rulebook.yaml")
    with open(path, "r") as f:
        return yaml.safe_load(f)


def _load_allowlist(path: Path | None = None) -> dict[str, TokenInfo]:
    path = path or (RULES_DIR / "token_allowlist.json")
    with open(path, "r") as f:
        raw = json.load(f)
    out: dict[str, TokenInfo] = {}
    for t in raw.get("tokens", []):
        out[t["symbol"]] = TokenInfo(
            symbol=t["symbol"],
            address=t["address"],
            decimals=int(t["decimals"]),
            is_stable=bool(t.get("is_stable", False)),
        )
    return out


def _env_bool(key: str, default: bool = False) -> bool:
    return os.getenv(key, str(default)).strip().lower() in ("1", "true", "yes", "on")


def load_settings(mode: str | None = None) -> Settings:
    rulebook = _load_rulebook()
    allowlist = _load_allowlist()
    base_currency = rulebook["capital"]["base_currency"]

    if base_currency not in allowlist:
        raise ValueError(
            f"base_currency {base_currency!r} is not in the token allowlist — "
            "the gate cannot settle PnL without it."
        )

    data_dir = Path(os.getenv("GLASSBOX_DATA_DIR", "./data")).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)

    return Settings(
        mode=mode or os.getenv("GLASSBOX_MODE", "paper"),
        heartbeat_seconds=int(os.getenv("GLASSBOX_HEARTBEAT_SECONDS", "900")),
        data_dir=data_dir,
        rulebook=rulebook,
        allowlist=allowlist,
        base_currency=base_currency,
        cmc_mcp_api_key=os.getenv("CMC_MCP_API_KEY", ""),
        cmc_mcp_endpoint=os.getenv("CMC_MCP_ENDPOINT", "https://mcp.coinmarketcap.com/mcp"),
        cmc_x402_enabled=_env_bool("CMC_X402_ENABLED"),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        llm_model=os.getenv("GLASSBOX_LLM_MODEL", "claude-opus-4-8"),
        twak_access_id=os.getenv("TWAK_ACCESS_ID", ""),
        twak_hmac_secret=os.getenv("TWAK_HMAC_SECRET", ""),
        twak_mcp_endpoint=os.getenv("TWAK_MCP_ENDPOINT", "https://mcp.trustwallet.com/tws"),
        twak_wallet_address=os.getenv("TWAK_WALLET_ADDRESS", ""),
        twak_wallet_password=os.getenv("TWAK_WALLET_PASSWORD", ""),
        bnb_agent_private_key=os.getenv("BNB_AGENT_PRIVATE_KEY", ""),
        bnb_rpc_url=os.getenv("BNB_RPC_URL", ""),
        bnb_anchoring_enabled=_env_bool("BNB_ANCHORING_ENABLED"),
        env=dict(os.environ),
    )
