"""Thin, real wrapper around the Trust Wallet Agent Kit (`twak`) CLI.

Verified against the Trust Wallet Agent SDK docs (developer.trustwallet.com):

    twak swap <amount> <from> <to> --chain bsc --slippage <pct> [--quote-only] [--json]
    twak wallet create --password <pw> [--json]
    twak wallet balance [--chain bsc] [--all] [--json]

  * BEP-20 assets use Trust Wallet asset IDs: c714_t0x<CONTRACT>  (714 = BSC coin id).
  * The CLI handles HMAC-SHA256 auth (Access ID + HMAC Secret) and LOCAL signing
    via the keystore in ~/.twak/. We never see or handle the private key.

Command construction is split into pure helpers so it is unit-testable without the
CLI installed. Only `run()` touches the system.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass

from glassbox.config import Settings, TokenInfo

def bsc_token_ref(token: TokenInfo) -> str:
    """Token reference the `twak swap` CLI accepts with `--chain bsc`.

    Confirmed against twak v0.19.1: a plain BEP-20 contract address works
    (e.g. `twak swap 100 0x55d3...955 0xbb4C...95c --chain bsc`). The `c714_t0x`
    asset-id form is NOT recognized for BSC."""
    addr = token.address
    if not addr.lower().startswith("0x"):
        raise ValueError(f"bad token address for {token.symbol}: {addr!r}")
    return addr


def build_swap_args(
    amount: float,
    from_asset: str,
    to_asset: str,
    slippage_pct: float,
    quote_only: bool,
    password: str | None,
) -> list[str]:
    """Pure: build the argv for a `twak swap`. (No password value is logged.)"""
    if amount <= 0:
        raise ValueError("swap amount must be positive")
    args = [
        "swap",
        f"{amount:.10f}".rstrip("0").rstrip("."),  # human-readable amount
        from_asset,
        to_asset,
        "--chain", "bsc",
        "--slippage", f"{slippage_pct:g}",
        "--json",
    ]
    if quote_only:
        args.append("--quote-only")
    if password:
        args += ["--password", password]
    return args


@dataclass
class TwakResult:
    ok: bool
    raw: dict
    error: str | None = None


class TwakCLI:
    def __init__(self, settings: Settings, binary: str = "twak") -> None:
        self.s = settings
        self.binary = binary

    def available(self) -> bool:
        """True if the `twak` binary is on PATH and responds to --version."""
        if shutil.which(self.binary) is None:
            return False
        try:
            subprocess.run(
                [self.binary, "--version"],
                capture_output=True, timeout=15, check=True,
            )
            return True
        except Exception:
            return False

    def _env(self) -> dict:
        """Credentials passed via env (the CLI also reads ~/.twak/)."""
        env = dict(os.environ)
        if self.s.twak_access_id:
            env["TWAK_ACCESS_ID"] = self.s.twak_access_id
        if self.s.twak_hmac_secret:
            env["TWAK_HMAC_SECRET"] = self.s.twak_hmac_secret
        # Headless signing: the CLI reads the wallet password from this env var (no OS
        # keychain on Linux, and cleaner than --password which warns about shell history).
        if self.s.twak_wallet_password:
            env["TWAK_WALLET_PASSWORD"] = self.s.twak_wallet_password
        return env

    def run(self, args: list[str], timeout: int = 90) -> TwakResult:
        """Run a twak subcommand with --json and parse the result."""
        try:
            proc = subprocess.run(
                [self.binary, *args],
                capture_output=True, text=True, timeout=timeout, env=self._env(),
            )
        except FileNotFoundError:
            return TwakResult(ok=False, raw={}, error="twak CLI not installed (npm i -g @trustwallet/cli)")
        except subprocess.TimeoutExpired:
            return TwakResult(ok=False, raw={}, error="twak command timed out")

        if proc.returncode != 0:
            msg = (proc.stderr or proc.stdout or "").strip()[:500]
            return TwakResult(ok=False, raw={}, error=f"twak exited {proc.returncode}: {msg}")
        try:
            return TwakResult(ok=True, raw=json.loads(proc.stdout or "{}"))
        except json.JSONDecodeError:
            # some commands may print non-JSON; keep the text for debugging
            return TwakResult(ok=True, raw={"_stdout": (proc.stdout or "").strip()})

    def swap(
        self, amount: float, from_asset: str, to_asset: str,
        slippage_pct: float, quote_only: bool, password: str | None,
    ) -> TwakResult:
        return self.run(
            build_swap_args(amount, from_asset, to_asset, slippage_pct, quote_only, password)
        )

    def wallet_balance(self) -> TwakResult:
        return self.run(["wallet", "balance", "--chain", "bsc", "--all", "--json"], timeout=45)

    def wallet_portfolio(self, chains: str = "bsc") -> TwakResult:
        """Live USD balances + token holdings — used to reconcile the portfolio."""
        return self.run(["wallet", "portfolio", "--chains", chains, "--json"], timeout=60)

    # ── ERC-8004 identity (on-chain proof; bsc + bsctestnet have deployments) ──
    def erc8004_register(
        self, uri: str, metadata: dict | None, chain: str, password: str | None,
    ) -> TwakResult:
        args = ["erc8004", "register", "--uri", uri, "--chain", chain, "--json"]
        for k, v in (metadata or {}).items():
            args += ["--metadata", f"{k}={v}"]
        if password:
            args += ["--password", password]
        return self.run(args, timeout=180)

    def erc8004_set_metadata(
        self, agent_id: str, key: str, value: str, chain: str, password: str | None,
    ) -> TwakResult:
        args = [
            "erc8004", "set-metadata", str(agent_id),
            "--key", key, "--value", value, "--chain", chain, "--json",
        ]
        if password:
            args += ["--password", password]
        return self.run(args, timeout=180)
