# AKINDO submission form: MUSD Books (copy and paste)

**Project name:** MUSD Books

**Project category (3-5 words):** payment systems, bookkeeping

**TL;DR (one sentence):** MUSD Books turns any Mezo address into an exact, verifiable MUSD statement, attaches invoice references to payments, and anchors the statement hash onchain so accountants, lenders and customers can verify it without trusting the sender.

**How it works:**
Problem: people who borrow MUSD against Bitcoin, and businesses paid in MUSD, need records a third party can verify. Explorers show raw logs, one-sided spreadsheets prove nothing, and transfers have no invoice numbers.
Solution: (1) A browser-only statement engine reads ERC-20 Transfer logs and balanceOf at the opening and closing blocks, counts every movement once at 18 decimals and reconciles to the last unit. Tokens minted to an account show as `mint` (a loan draw for a Trove owner), burns as `burn` (a repayment), and core Mezo contracts are named. (2) MusdPay moves MUSD from payer to merchant with transferFrom and emits PaymentReference as the log right after the token's Transfer, so each payment carries its invoice number; with MUSD's permit support it is a single transaction. The engine joins the two by log position and requires payer, merchant and amount to match. (3) The statement is a deterministic CSV; its keccak256 hash is anchored in StatementRegistry, where several parties can co-attest the same hash. (4) A Verify tab hashes a CSV locally, looks up its anchors and can re-derive the statement from chain data and compare line by line.
MUSD integration: real MUSD (OpenZeppelin ERC20Permit), real Trove flows (openTrove, withdrawMUSD, repayMUSD), any other ERC-20 such as MEZO.

**Target group:** Trove owners, small businesses that accept MUSD, their accountants and lenders. Desktop and mobile web, no install, Indonesia-based author but global use.

**Tech stack:** Solidity 0.8.30 (Foundry, london EVM), JavaScript (no framework, no backend), viem, GitHub Pages.

**Track:** Track 2 (Access and Distribution). It also touches Track 1 only lightly, so submit to Track 2.

**Chain deployed on:** Mezo (testnet, chain id 31611)

**Project status:** Existing project with new features added during the hackathon. The author's earlier project ArcBooks (https://github.com/neimasilk/arcbooks, Arc network) is the same idea. MUSD Books is a new engine for Mezo: ERC-20 logs and balanceOf instead of a native-token emitter, a new payment-reference contract (Mezo has no memo precompile), Mezo mint/burn labels and core-contract names, and a token field in the registry. Repo: https://github.com/neimasilk/musd-books

**Project readiness:** Testnet deployment (working demo, tested end to end)

**Future milestones:**
1. Wave 2 (by Nov 15): deploy StatementRegistry and MusdPay to Mezo mainnet; accountant request-and-co-sign flow.
2. December: Trove report (collateral, debt and interest next to MUSD movements) for lenders.
3. Q1 2027: embeddable "Pay with MUSD" button for merchants using MusdPay.

**Team info:** Solo builder (GitHub: neimasilk), built with AI assistance (Claude by Anthropic), disclosed in the README.

**Links:**
- Live app: https://neimasilk.github.io/musd-books/
- Demo statement: https://neimasilk.github.io/musd-books/?account=0x21F5ae9d165a7E0EFDaf17A85c225713199eC439&from=16192210&to=16192312&net=testnet
- Deck: https://neimasilk.github.io/musd-books/deck/
- Code: https://github.com/neimasilk/musd-books
- StatementRegistry (testnet): 0x431785e21f9224c53aa37108d14cfa865279d23c
- MusdPay (testnet): 0x5fa72a1821254a49d7c0af692115a4dabe81921a
- Video: (paste after recording)
