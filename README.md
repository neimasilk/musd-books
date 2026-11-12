# MUSD Books

[![CI](https://github.com/neimasilk/musd-books/actions/workflows/ci.yml/badge.svg)](https://github.com/neimasilk/musd-books/actions/workflows/ci.yml)

**Exact, reconciled, verifiable MUSD statements, and invoice-referenced payments, on Mezo.**

MUSD Books turns any Mezo address into a bookkeeping-grade statement for MUSD (or MEZO, or any ERC-20) in seconds, with no backend, indexer or API key. Each statement:

- counts **every `Transfer` exactly once at full 18-decimal precision** (`BigInt`),
- **reconciles to the last unit** against the onchain `balanceOf` at the exact opening and closing blocks, and says so when it cannot,
- labels **Mezo-specific flows**: tokens newly minted to the account (`mint`, a loan draw for a Trove owner), tokens burned (`burn`, a repayment), and names core Mezo contracts (BorrowerOperations, StabilityPool, PCV, ...),
- shows the **invoice or order reference** attached to a payment through `MusdPay`,
- exports a **deterministic CSV** whose keccak256 hash can be **anchored onchain** in `StatementRegistry`, so an accountant, lender or tax consultant can verify the file without trusting the sender, and can re-derive it from public chain data.

> It extends the author's earlier project [ArcBooks](https://github.com/neimasilk/arcbooks) (the same idea on Arc). The statement engine was rewritten for Mezo during Wave 1 of the Mezo Buildathon: ERC-20 logs instead of a native-token emitter, `balanceOf` instead of native balances, a new payment-reference contract, Mezo labels, and a token field in the registry.

## New in Wave 2

- **Act on Mezo from inside MUSD Books.** Next to a statement, the Trove owner can repay MUSD or add BTC collateral
  (Mezo `BorrowerOperations`, with position hints from `HintHelpers` and `SortedTroves`), and deposit or withdraw MUSD in
  the Stability Pool. A preview shows the new debt, collateral ratio and liquidation price, and refuses amounts the
  protocol would reject. The lender report links straight to these actions.
- **Trove panel fixed.** `getEntireDebtAndColl` already includes pending redistribution rewards; Wave 1 added them a
  second time. The panel now shows the right numbers, names the redistributed part, shows the liquidation price, and
  states the system mode: in MUSD, Recovery Mode (TCR below 150%) does not move the 110% liquidation line, it blocks
  collateral withdrawals and limits new borrowing. Offline tests pin both (`node test/trove.test.mjs`).
- **Contracts verified** on the Mezo Testnet explorer, and **version 2** of both contracts (reentrancy lock on
  payments, overflow-free pagination). See [SECURITY.md](SECURITY.md).
- **On Mezo mainnet (13 Nov 2026).** The v2 contracts are deployed and verified on explorer.mezo.org (addresses under
  Deployments). The first real mainnet statement is the builder's own Wave 1 reward: MEZO to MUSD on Tigris, then
  bridged out through Wormhole NTT. It has 6 transfers, is fully reconciled with 0 unexplained, and is anchored
  onchain from the owner's wallet ([anchor tx](https://explorer.mezo.org/tx/0xc788baefbb176764045b7c0f750a1cee8d5ff7c58dcfa79c7b128c93def9bcd2)).
  [Re-derive it in your browser](https://neimasilk.github.io/musd-books/?account=0x0428b16c99eff57268e69e5eb93aacce18711ba5&from=13141300&to=13141700&net=mainnet&expect=0x6ae6126d54386e2040f7ac190bd005fca9f3583f419ad7c961d2f32afc787586).
  The app also labels the Tigris pools and the Wormhole NTT bridge.

## Why

Mezo lets people borrow MUSD against Bitcoin instead of selling it. A borrower, a small business paid in MUSD and their accountant all need a clean, checkable record of what came in, what went out, what was borrowed and what was repaid. A block explorer shows raw logs; a spreadsheet export from one party proves nothing to another. MUSD Books produces a statement a third party can verify.

## How it works

| Piece | What it does |
|---|---|
| `docs/engine.js` | Dependency-free statement engine (browser and Node). Chunks `eth_getLogs` to the 10,000-block RPC limit, joins `PaymentReference` logs to transfers, classifies mint/burn/payment/transfer, produces the canonical CSV (`musdbooks-statement-v1`). |
| `contracts/src/MusdPay.sol` | Pays an ERC-20 from payer to merchant with `transferFrom` and emits `PaymentReference` as the log **right after** the token's own `Transfer`. No owner, no fee, no custody, no upgrade path. `payWithPermit` makes it one transaction with MUSD (OpenZeppelin `ERC20Permit`). |
| `contracts/src/StatementRegistry.sol` | Anyone can anchor a statement hash for an `(account, token, block range)`. Several parties can attest the same hash. Verification is one view call. |
| `docs/` | Static app (GitHub Pages, no build step): Statement (with live Trove and Stability Pool panels), Verify, Payment request, How it works. |

### Invoice references without a memo precompile

Mezo has no memo precompile. `MusdPay.pay(token, merchant, amount, ref)` moves tokens straight from payer to merchant and emits `PaymentReference(token, payer, merchant, amount, refHash, ref)` immediately after the token's `Transfer`. The statement engine joins the two by `(txHash, logIndex + 1)` and requires payer, merchant and amount to match, so a reference can never attach to the wrong payment.

### Reconciliation

For a plain ERC-20 such as MUSD, `opening + in − out == closing` exactly, and the statement header records `unexplained,0`. A non-zero value would expose a rebasing or fee-on-transfer token, and the statement reports it instead of hiding it. Gas is paid in BTC on Mezo, so it never appears in a MUSD statement.

### Determinism

The same `(chain, account, token, from_block, to_block, pay_contract)` always yields the same bytes. The header contains everything needed to re-derive the statement, which is how the Verify tab proves a CSV is true and not just unchanged.

## Tested against real Mezo data

- **Mainnet, read only:** a busy MUSD account (the MUSD/BTC pool) reconciles with **0 unexplained** over thousands of blocks, and two independent builds produce byte-identical CSVs (`node test/statement.live.test.mjs mainnet 5000`).
- **Mint/burn labelling** was checked on a mainnet account that receives MUSD mints.
- **End to end on a fork of Mezo testnet** with the real MUSD contract: permit payment, approve-and-pay, a payment without reference, a supplier payment, mint, burn, two co-attestations of the same hash, and a byte-identical re-derivation (`scripts/demo.mjs --fork`).
- **The "Pay with wallet" page, end to end on Mezo Testnet** (`python test/wallet_flow_test.py`): a scripted EIP-1193 wallet drives the real page against the real `MusdPay` and MUSD contracts. Permit path: one transaction. Fallback path (permit signing unavailable): approve, then pay. Each leaves exactly one `PaymentReference` on chain. Running it found and fixed two real problems: the button was clickable before its handler existed, and the public RPC's gas estimate can fall below the EIP-7623 floor, so every wallet transaction now carries an explicit gas margin.
- **Accountant review link** (`python test/review_flow_test.py`, read only): after generating a statement, the app produces a link that carries its hash. The accountant's browser re-derives the statement from chain data and reports "Independent check passed" or "Hash mismatch" before offering a one-click co-attestation. The test covers a matching link, a hash changed by one digit, a malformed hash, and the link round trip.
- **Lender report and merchant kit** (`python test/features_test.py`, `node test/report.test.mjs`): the statement page downloads a Markdown report for a lender (statement summary, reconciliation, anchors, a live Trove section with collateral ratio and how far BTC must fall before liquidation, and an independent-check link). The Request tab produces a "Pay with MUSD" button for a merchant's website, either as a plain HTML link or with `pay-button.js`; the test checks that both render, that the link opens the pay page with the right payee, amount and reference, and that invalid settings give a disabled button.
- **Mezo Trove panel** (`node test/trove.live.test.mjs`): reads the account's Trove (collateral, debt, interest, collateral ratio) live from `TroveManager` and the price feed, checked against a real testnet Trove and a mainnet one (`ICR = collateral value / debt`). It is shown next to the statement and is not part of the hashed CSV, so existing anchors stay valid.
- **Mezo Stability Pool panel** (`node test/pool.test.mjs`, `node test/pool.live.test.mjs`, `python test/features_test.py`): reads the account's Stability Pool position (deposit after liquidation losses, share of the pool, pending BTC gain from liquidated Troves) live from the `StabilityPool` contract. A deposit leaves the wallet balance, so a statement shows it as MUSD out to the pool; this panel says what it is worth now. Validated with a real 100 MUSD deposit on Mezo Testnet (`node scripts/pool_demo.mjs`, which found that the pool pulls MUSD with `transferFrom` and needs an approval first) and a read of the mainnet pool. The lender report gets a matching section. Like the Trove panel, it is not part of the hashed CSV.
- **Foundry tests, 28 in total:** 14 unit tests for `MusdPay` (log order, permit, already-used permit, tokens that return nothing, bad inputs) and `StatementRegistry`, 11 property tests (log order and balances for any amount, an attacker cannot spend a victim's approval, garbage permits create no allowance, exact pagination and anchor round trips), 2 invariant suites (128,000 random calls each: the contract never holds tokens and supply is conserved; per-hash anchor counts always match), and two hook-token tests (version 2 refuses a nested payment; a plain payment keeps its log order). Slither reports 3 informational results and nothing high or medium. They run on every push in GitHub Actions (`.github/workflows/ci.yml`: Foundry tests, plus the offline engine tests). See [SECURITY.md](SECURITY.md) for the findings and the limits of this self-review.

## Run locally

```bash
# app
cd docs && python -m http.server 8765      # open http://127.0.0.1:8765

# engine against Mezo mainnet (read only), or testnet
node test/statement.live.test.mjs mainnet 5000

# contracts (unit, property and invariant tests); build output is not committed, so run forge build before deploy.mjs or demo.mjs
cd contracts && forge test

# engine and report tests
node test/pool.test.mjs && node test/report.test.mjs && node test/trove.test.mjs
python test/features_test.py && python test/review_flow_test.py && python test/wallet_flow_test.py
python test/trove_actions_test.py   # repay, add collateral, Stability Pool deposit and withdrawal on Mezo Testnet
```

## Deployments

See `deployments.json` (testnet) and `deployments.mainnet.json` (mainnet), both written by `scripts/deploy.mjs`
(`--mainnet` for chain 31612), and `docs/config.js`. Contracts are verified with `scripts/verify_blockscout.mjs`.

| Item | Mezo Mainnet (31612) | Mezo Testnet (31611) |
|---|---|---|
| Version | v2 | v1 |
| StatementRegistry | [`0x431785e21f9224c53aa37108d14cfa865279d23c`](https://explorer.mezo.org/address/0x431785e21f9224c53aa37108d14cfa865279d23c) | `0x431785e21f9224c53aa37108d14cfa865279d23c` |
| MusdPay | [`0x5fa72a1821254a49d7c0af692115a4dabe81921a`](https://explorer.mezo.org/address/0x5fa72a1821254a49d7c0af692115a4dabe81921a) | `0x5fa72a1821254a49d7c0af692115a4dabe81921a` |
| MUSD | `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186` | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |

The addresses match across networks because the same deployer used the same nonces.

## Repository layout

```
contracts/   Foundry project: StatementRegistry.sol, MusdPay.sol + unit, property and invariant tests
SECURITY.md  What was checked, findings with severity, trust assumptions
docs/        Static app (engine.js, app.js, config.js, index.html, assets/)
scripts/     deploy.mjs, demo.mjs, pool_demo.mjs, lib.mjs, icon and screenshot generators
test/        Engine, report, pool and browser tests (live read-only ones included)
```

## Limitations

- MUSD Books is a bookkeeping aid, not tax or legal advice.
- Statements cover one token per address and period. Native BTC (gas) is not included.
- Mainnet use so far is the builder's own; no outside accountant or merchant has used it yet.
- Counterparty names come from a frozen table of core Mezo contracts plus the Tigris MUSD pools and the Wormhole NTT bridge; unknown addresses are shown as addresses.

## AI assistance disclosure

This project was written by Claude (Anthropic) working for its human owner, who holds the accounts and submits it. Everything claimed above can be reproduced from this repository: the unit tests, the read-only live test against Mezo and the fork demo script.

## License

MIT
