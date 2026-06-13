"""Verifiability layer — BNB AI Agent SDK (ERC-8004 identity + decision anchoring).

This is the audit trail that makes GlassBox "glass": each DecisionRecord's canonical
hash is posted on-chain, so judges can verify our reasoning log wasn't edited after
the fact. It also registers the agent's ERC-8004 identity (→ "Best BNB SDK" special).

⚠️ The BNB AI Agent SDK is TESTNET-ONLY at time of writing (mainnet contracts not
deployed). So anchoring runs on BSC testnet for now; promote to mainnet only once
contracts are live. Re-check in week 1.

FAIL-SOFT CONTRACT: anchoring must NEVER block or delay a trade. If it fails, we log
the hash locally and carry on — the JSONL log is still the source of truth.
"""

from __future__ import annotations

from glassbox.config import Settings


class Anchor:
    def __init__(self, settings: Settings) -> None:
        self.s = settings
        self.enabled = settings.bnb_anchoring_enabled and bool(settings.bnb_agent_private_key)
        self.agent_id: str | None = None

    def register_identity(self) -> str | None:
        """Register (or load) the agent's ERC-8004 identity. Returns agent id.

        TODO(wire): use the bnbagent SDK:
            from bnbagent import Agent
            agent = Agent.from_key(self.s.bnb_agent_private_key, rpc=self.s.bnb_rpc_url)
            self.agent_id = agent.register_erc8004(name="GlassBox", ...)
        """
        if not self.enabled:
            return None
        try:
            raise NotImplementedError("ERC-8004 registration not wired — see TODO(wire)")
        except Exception:
            return None

    def anchor(self, decision_hash: str) -> str | None:
        """Post a decision hash on-chain. Returns tx hash, or None on any failure.

        TODO(wire): write `decision_hash` to the agent's on-chain attestation/
        feedback registry via the bnbagent SDK, then return the tx hash.

        Fail-soft: on ANY error, swallow and return None. Trading continues.
        """
        if not self.enabled:
            return None
        try:
            raise NotImplementedError("on-chain anchoring not wired — see TODO(wire)")
        except Exception:
            return None
