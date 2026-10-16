# MUSD Books

**Exact, reconciled, verifiable MUSD statements, and invoice-referenced payments, on Mezo.**

MUSD Books turns any Mezo address into a bookkeeping-grade statement for MUSD (or MEZO, or any ERC-20) in seconds, with no backend, indexer or API key. Each statement:

- counts **every `Transfer` exactly once at full 18-decimal precision** (`BigInt`),
- **reconciles to the last unit** against the onchain `balanceOf` at the exact opening and closing blocks, and says so when it cannot,
- labels **Mezo-specific flows**: tokens newly minted to the account (`mint`, a loan draw for a Trove owner), tokens burned (`burn`, a repayment), and names core Mezo contracts (BorrowerOperations, StabilityPool, PCV, ...),
- shows the **invoice or order reference** attached to a payment through `MusdPay`,
- exports a **deterministic CSV** whose keccak256 hash can be **anchored onchain** in `StatementRegistry`, so an accountant, lender or tax consultant can verify the file without trusting the sender, and can re-derive it from public chain data.

> It extends the author's earlier project [ArcBooks](https://github.com/neimasilk/arcbooks) (the same idea on Arc). The statement engine was rewritten for Mezo during Wave 1 of the Mezo Buildathon: ERC-20 logs instead of a native-token emitter, `balanceOf` instead of native balances, a new payment-reference contract, Mezo labels, and a token field in the registry.

## Why

Mezo lets people borrow MUSD against Bitcoin instead of selling it. A borrower, a small business paid in MUSD and their accountant all need a clean, checkable record of what came in, what went out, what was borrowed and what was repaid. A block explorer shows raw logs; a spreadsheet export from one party proves nothing to another. MUSD Books produces a statement a third party can verify.

## How it works

| Piece | What it does |
|---|---|
| `docs/engine.js` | Dependency-free statement engine (browser and Node). Chunks `eth_getLogs` to the 10,000-block RPC limit, joins `PaymentReference` logs to transfers, classifies mint/burn/payment/transfer, produces the canonical CSV (`musdbooks-statement-v1`). |
| `contracts/src/MusdPay.sol` | Pays an ERC-20 from payer to merchant with `transferFrom` and emits `PaymentReference` as the log **right after** the token's own `Transfer`. No owner, no fee, no custody, no upgrade path. `payWithPermit` makes it one transaction with MUSD (OpenZeppelin `ERC20Permit`). |
| `contracts/src/StatementRegistry.sol` | Anyone can anchor a statement hash for an `(account, token, block range)`. Several parties can attest the same hash. Verification is one view call. |
| `docs/` | Static app (GitHub Pages, no build step): Statement (with a live Trove panel), Verify, Payment request, How it works. |

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
- **Mezo Trove panel** (`node test/trove.live.test.mjs`): reads the account's Trove (collateral, debt, interest, collateral ratio) live from `TroveManager` and the price feed, checked against a real testnet Trove and a mainnet one (`ICR = collateral value / debt`). It is shown next to the statement and is not part of the hashed CSV, so existing anchors stay valid.
- **Foundry unit tests:** 13 tests for `MusdPay` (log order, permit, already-used permit, tokens that return nothing, bad inputs) and `StatementRegistry`.

## Run locally

```bash
# app
cd docs && python -m http.server 8765      # open http://127.0.0.1:8765

# engine against Mezo mainnet (read only), or testnet
node test/statement.live.test.mjs mainnet 5000

# contracts
cd contracts && forge test
```

## Deployments

See `deployments.json` (written by `scripts/deploy.mjs`) and `docs/config.js`.

| Item | Value |
|---|---|
| Network | Mezo Testnet (chain id 31611) |
| MUSD (testnet) | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| StatementRegistry | see `deployments.json` |
| MusdPay | see `deployments.json` |

## Repository layout

```
contracts/   Foundry project: StatementRegistry.sol, MusdPay.sol + unit tests
docs/        Static app (engine.js, app.js, config.js, index.html, assets/)
scripts/     deploy.mjs, demo.mjs, lib.mjs, icon generator
test/        Live read-only test of the statement engine
```

## Limitations

- MUSD Books is a bookkeeping aid, not tax or legal advice.
- Statements cover one token per address and period. Native BTC (gas) is not included.
- The hackathon build is deployed on Mezo testnet; mainnet deployment is a configuration change.
- Counterparty names come from a frozen table of core Mezo contracts; unknown addresses are shown as addresses.

## AI assistance disclosure

This project was written by Claude (Anthropic) working for its human owner, who holds the accounts and submits it. Everything claimed above can be reproduced from this repository: the unit tests, the read-only live test against Mezo and the fork demo script.

## License

MIT
