# AKINDO Wave 2 submission: MUSD Books (draft, copy and paste)

Status of this draft (3 Nov 2026): items 1-4 are live and tested. Decided 3 Nov: no mainnet deployment in Wave 2
(getting BTC gas onto Mezo mainnet costs more in Ethereum fees than it is worth now; testnet is accepted by the rules).
The remaining TODO (a real accountant) must be filled in or removed before submitting.
Wave 2 deadline on AKINDO: **13 Nov 2026, 12:30 WIB** (05:30 UTC). The program page says Wave 2 runs to Nov 15; the
AKINDO countdown is the one that closes the form.

## "Updates in this Wave" field (max 3,000 characters)

Wave 1 review asked for four things. What changed:

1. Act on Mezo from inside MUSD Books. Next to a statement, the Trove owner can now repay MUSD or add BTC collateral (BorrowerOperations.repayMUSD / addColl, with list hints from HintHelpers and SortedTroves) and deposit or withdraw MUSD in the Stability Pool (provideToSP / withdrawFromSP). A preview shows the new debt, collateral ratio and liquidation price, and refuses what the protocol would reject (net debt below minNetDebt, repaying more than debt minus the gas compensation, wrong wallet, low balance). The lender report links the owner straight to these actions. Tested end to end on Mezo Testnet with a scripted wallet, every call checked onchain afterwards (test/trove_actions_test.py).

2. Trove panel fixed. getEntireDebtAndColl already includes pending redistribution rewards; Wave 1 added them a second time. The panel and lender report now use the returned totals, name the redistributed part, show the liquidation price, the system TCR and the mode. In MUSD, Recovery Mode does not move the 110% liquidation line (TroveManager only liquidates below MCR); it blocks collateral withdrawals and limits new debt, and the app says exactly that. 24 offline tests pin both (test/trove.test.mjs).

3. Contracts verified and hardened. StatementRegistry and MusdPay are verified on the Mezo Testnet explorer. Version 2 adds a reentrancy lock to MusdPay (finding I-1) and overflow-free pagination (L-1); 28 Foundry tests pass. This Wave stays on Mezo Testnet: v2 is the version for a later mainnet deployment.

4. Revenue model. The contracts stay fee-free and ownerless, so a statement never depends on trusting us. Revenue comes from tools around them: (a) accountant workspace: batch monthly statements and co-attestations for many client addresses, branded PDF, reminders, priced per client per month in MUSD; (b) merchant tooling: hosted invoice pages, payment webhooks and exports to local bookkeeping software, monthly in MUSD. Both are paid through MusdPay, so our own revenue appears on a verifiable MUSD Books statement.

TODO real use: name the accountant or merchant and link their anchor/co-attestation transaction, or remove this line.

Links: app https://neimasilk.github.io/musd-books/ · code https://github.com/neimasilk/musd-books · security notes https://github.com/neimasilk/musd-books/blob/main/SECURITY.md

## Other form fields that change from Wave 1

- Project readiness: Testnet deployment.
- Chain deployed on: Mezo (testnet, chain id 31611).
- Future milestones:
  1. December 2026: accountant workspace pilot with one practice (batch statements, co-attestation).
  2. Q1 2027: merchant webhooks and export to local bookkeeping software.
  3. Q1 2027: MEZO and other Mezo ERC-20 statements side by side with MUSD in one report.
- Video: TODO new 2-minute pitch covering the in-app actions.
