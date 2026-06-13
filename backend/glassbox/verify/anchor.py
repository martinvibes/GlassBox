"""Verifiability layer — on-chain decision anchoring via ERC-8004.

This is the audit trail that makes GlassBox "glass": the agent has an on-chain
ERC-8004 identity (an NFT), and each DecisionRecord's canonical hash is written to
that identity's on-chain metadata — so judges can verify our reasoning log wasn't
edited after the fact. (→ "Best BNB SDK" / on-chain-proof story.)

Implemented with the real `twak erc8004` CLI, which has known registry deployments
on both `bsc` (mainnet) and `bsctestnet`. The wallet signs locally via ~/.twak/.

FAIL-SOFT CONTRACT: anchoring must NEVER block or delay a trade. On any failure we
log the hash locally (the hash-chained JSONL is the source of truth) and continue.

GAS NOTE: minting the identity and writing metadata cost gas. Identity is minted
ONCE (cached in data/agent_identity.json). Anchoring is OFF by default
(BNB_ANCHORING_ENABLED=false); enable it for the live window / demo.
"""

from __future__ import annotations

import json
from pathlib import Path

from glassbox.config import Settings
from glassbox.execution.twak_cli import TwakCLI

AGENT_URI = "data:application/json,%7B%22name%22%3A%22GlassBox%22%7D"  # {"name":"GlassBox"}


class Anchor:
    def __init__(self, settings: Settings) -> None:
        self.s = settings
        self.cli = TwakCLI(settings)
        self.enabled = settings.bnb_anchoring_enabled
        self.chain = settings.anchor_chain
        self.agent_id: str | None = None
        self._id_path: Path = settings.data_dir / "agent_identity.json"
        self._load_identity()

    def _password(self) -> str | None:
        # Prefer keychain / inherited TWAK_WALLET_PASSWORD env over passing --password.
        return None

    def _load_identity(self) -> None:
        if self._id_path.exists():
            try:
                self.agent_id = json.loads(self._id_path.read_text()).get("agent_id")
            except Exception:
                self.agent_id = None

    def register_identity(self) -> str | None:
        """Mint (once) the agent's ERC-8004 identity. Cached so we never re-mint.
        Returns the agent id, or None if disabled/unavailable."""
        if not self.enabled or self.agent_id:
            return self.agent_id
        if not self.cli.available():
            return None
        try:
            res = self.cli.erc8004_register(
                AGENT_URI, {"name": "GlassBox", "track": "bnbhack-t1"},
                self.chain, self._password(),
            )
            if res.ok:
                aid = (
                    res.raw.get("agentId") or res.raw.get("agent_id")
                    or res.raw.get("tokenId") or res.raw.get("id")
                )
                if aid:
                    self.agent_id = str(aid)
                    self._id_path.write_text(
                        json.dumps({"agent_id": self.agent_id, "chain": self.chain})
                    )
        except Exception:
            return None
        return self.agent_id

    def anchor(self, decision_hash: str) -> str | None:
        """Write a decision hash to the identity's on-chain metadata. Returns the
        tx hash, or None on any failure. Fail-soft: trading never depends on this."""
        if not self.enabled or not self.agent_id:
            return None
        try:
            res = self.cli.erc8004_set_metadata(
                self.agent_id, "glassbox:lastDecision", "0x" + decision_hash,
                self.chain, self._password(),
            )
            if res.ok:
                return (
                    res.raw.get("txHash") or res.raw.get("tx_hash")
                    or res.raw.get("hash") or res.raw.get("transactionHash")
                )
        except Exception:
            return None
        return None
