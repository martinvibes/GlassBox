"""Tests for the TWAK CLI command construction. These are pure (no binary needed)
and verify we build exactly the documented `twak swap` invocation, and that the
wallet password is never embedded when not provided."""

from __future__ import annotations

import pytest

from glassbox.config import TokenInfo
from glassbox.execution.twak_cli import bsc_token_ref, build_swap_args

USDT = TokenInfo("USDT", "0x55d398326f99059fF775485246999027B3197955", 18, True)
WBNB = TokenInfo("WBNB", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", 18, False)


def test_bsc_token_ref_is_plain_address():
    # confirmed against twak v0.19.1: --chain bsc takes the plain contract address
    assert bsc_token_ref(WBNB) == "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
    assert bsc_token_ref(USDT).startswith("0x")


def test_bsc_token_ref_rejects_bad_address():
    bad = TokenInfo("X", "not-an-address", 18, False)
    with pytest.raises(ValueError):
        bsc_token_ref(bad)


def test_build_swap_args_buy_quote_only_has_no_password():
    args = build_swap_args(
        amount=100.0, from_asset=bsc_token_ref(USDT), to_asset=bsc_token_ref(WBNB),
        slippage_pct=0.8, quote_only=True, password=None,
    )
    assert args[0] == "swap"
    assert "--chain" in args and args[args.index("--chain") + 1] == "bsc"
    assert "--slippage" in args and args[args.index("--slippage") + 1] == "0.8"
    assert "--json" in args
    assert "--quote-only" in args
    assert "--password" not in args  # never sign on a quote


def test_build_swap_args_execute_includes_password():
    args = build_swap_args(
        amount=0.5, from_asset=bsc_token_ref(WBNB), to_asset=bsc_token_ref(USDT),
        slippage_pct=1.0, quote_only=False, password="hunter2",
    )
    assert "--quote-only" not in args
    assert args[args.index("--password") + 1] == "hunter2"
    # amount is human-readable and trimmed
    assert args[1] == "0.5"


def test_build_swap_args_rejects_nonpositive_amount():
    with pytest.raises(ValueError):
        build_swap_args(0, "a", "b", 1.0, False, None)
