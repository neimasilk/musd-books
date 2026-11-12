## What it is
MUSD Books turns any Mezo address into an exact, verifiable MUSD statement, attaches invoice references to MUSD payments, and anchors the statement hash onchain so an accountant, lender or customer can verify it without trusting the sender.

## The problem
Mezo lets people borrow MUSD against Bitcoin instead of selling it, and MUSD can be used to pay and get paid. Borrowers, businesses paid in MUSD and their accountants then need a record a third party can check. Block explorers show raw logs, a spreadsheet from one side proves nothing to the other, and a transfer carries no invoice number.

## How it works
1. **Statement engine** (browser only, no backend): reads ERC-20 `Transfer` logs and `balanceOf` at the exact opening and closing blocks, counts every movement once at 18 decimals, and reconciles to the last unit. Newly minted MUSD is labelled `mint` (a loan draw for a Trove owner), burned MUSD `burn` (a repayment), and core Mezo contracts (BorrowerOperations, StabilityPool, PCV, ...) are named.
2. **MusdPay** (contract): moves MUSD from payer to merchant with `transferFrom` and emits `PaymentReference` as the log right after the token's own `Transfer`. With MUSD's permit support it is a single transaction. The engine joins reference and transfer by log position and requires payer, merchant and amount to match. No custody, no owner, no fee.
3. **StatementRegistry** (contract): the keccak256 hash of the deterministic CSV is anchored for `(account, token, block range)`. Several parties can co-attest the same hash.
4. **Verify tab**: hashes a CSV locally, looks up anchors, and can re-derive the statement from chain data and compare it line by line.

## MUSD / Mezo integration
Real MUSD (OpenZeppelin ERC20Permit), real Trove flows (`openTrove`, `withdrawMUSD`, `repayMUSD`), any other ERC-20 such as MEZO. The same engine already reconciles real Mezo mainnet MUSD accounts with zero difference.

## Live on Mezo mainnet (13 Nov 2026)
- v2 contracts deployed and verified on explorer.mezo.org: StatementRegistry `0x431785e21f9224c53aa37108d14cfa865279d23c`, MusdPay `0x5fa72a1821254a49d7c0af692115a4dabe81921a` (same addresses on testnet, which runs v1).
- First real mainnet statement, anchored from the owner's wallet: the builder's own Wave 1 reward (MEZO to MUSD on Tigris, bridged out via Wormhole NTT). 6 transfers, 0 unexplained, counterparties labelled. Re-derive it in your browser: https://neimasilk.github.io/musd-books/?account=0x0428b16c99eff57268e69e5eb93aacce18711ba5&from=13141300&to=13141700&net=mainnet&expect=0x6ae6126d54386e2040f7ac190bd005fca9f3583f419ad7c961d2f32afc787586

## Testnet demo
2,000 MUSD borrowed from a real Trove, 150 repaid; 4 invoice-referenced payments and 1 supplier payment; 0 unexplained; merchant hash co-attested by store and accountant; byte-identical re-derivation.

## Existing work
This extends the author's earlier project ArcBooks (https://github.com/neimasilk/arcbooks, Arc network). The Mezo version is a new engine (ERC-20 logs and balanceOf instead of a native-token emitter), a new payment-reference contract (Mezo has no memo precompile), Mezo mint/burn labels, and a token field in the registry, built during Wave 1.

## Limits
Bookkeeping aid, not tax or legal advice. One token per statement; native BTC gas is out of scope. Mainnet use so far is the builder's own; no outside users yet.

## AI disclosure
Written by Claude (Anthropic) for its human owner, who holds the accounts and submits the project. Everything above is reproducible from the repository (unit tests, read-only live test, fork and testnet demo scripts).

## Wave 1 additions (Oct 2026)
- Live Trove panel and Stability Pool position from TroveManager, the price feed and StabilityPool (beside the statement, not hashed, so anchors stay valid).
- "Pay with wallet" tested end to end on Mezo Testnet with a scripted EIP-1193 wallet: permit path in one transaction, approve fallback, exactly one PaymentReference per payment.
- Accountant review link: the accountant's browser re-derives the statement from chain data, reports "Independent check passed" or "Hash mismatch", then offers a one-click co-attestation.
- Lender report (Markdown) with reconciliation, anchors and the check link.
- Merchant kit: a "Pay with MUSD" button for any website (plain HTML link or pay-button.js).
- Security: Foundry fuzz and invariant suites, Slither with nothing high or medium, and SECURITY.md: https://github.com/neimasilk/musd-books/blob/main/SECURITY.md

## Update, Wave 2 (Nov 2026)
Built from the Wave 1 review:
- **Act on Mezo from the statement.** The Trove owner can repay MUSD or add BTC collateral (BorrowerOperations, with HintHelpers/SortedTroves hints) and deposit or withdraw MUSD in the Stability Pool, right next to the statement. A preview shows the new debt, collateral ratio and liquidation price and refuses what the protocol would reject (below minNetDebt, repaying past the gas compensation, wrong wallet, low balance). Tested end to end on Mezo Testnet with a scripted wallet, each call checked onchain (test/trove_actions_test.py).
- **Trove panel fixed.** Wave 1 counted pending redistribution rewards twice; the panel and lender report now use getEntireDebtAndColl totals and show liquidation price, system TCR and mode (Recovery Mode explained correctly). 24 offline tests (test/trove.test.mjs).
- **Contracts verified and hardened.** v2 adds a reentrancy lock to MusdPay and overflow-free pagination (28 Foundry tests); verified on testnet, and since 13 Nov live and verified on mainnet.
- **Revenue model.** Contracts stay fee-free and ownerless. Revenue comes from an accountant workspace (batch statements, co-attestation, branded PDF, per client per month) and merchant tooling (hosted invoices, webhooks, exports), both paid in MUSD through MusdPay.
- New pitch video (2:11) shows a real repay and a real Stability Pool deposit made from inside the app on Mezo Testnet.
