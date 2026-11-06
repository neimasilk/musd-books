# AKINDO Wave 2 submission: MUSD Books (draft, copy and paste)

Status of this draft (3 Nov 2026): items 1-4 are live and tested. Decided 3 Nov: no mainnet deployment in Wave 2
(getting BTC gas onto Mezo mainnet costs more in Ethereum fees than it is worth now; testnet is accepted by the rules).
Decided 4 Nov: no outside user is claimed (the user will not ask students or colleagues); the "Real use" line says so plainly.
Video made 6 Nov and published (2:11, `submission/video/make_video_w2.py`, upload text in `submission/youtube-w2.md`). 7 Nov: product page updated on AKINDO (video link, Wave 2 section, Limits line; description cap is 6,000 characters, so the two 17 Oct update sections were condensed), and the Wave 2 dialog filled; only the "Submit the product" click remains (user).
Wave 2 deadline on AKINDO: **13 Nov 2026, 12:30 WIB** (05:30 UTC). The program page says Wave 2 runs to Nov 15; the
AKINDO countdown is the one that closes the form.

## "Updates in this Wave" field (as entered 7 Nov, 2,787 / 3,000 characters)

Declared goals: (1) accountant flow, (2) Trove report and (3) "Pay with wallet" testing were delivered early, during Wave 1 (17 Oct: review link with co-attestation, lender report with a Trove section, scripted-wallet tests of permit and approve paths). (4) Mainnet was conditional; it is deferred (see 3). Wave 2 work followed the Wave 1 review:

1. Act on Mezo from inside MUSD Books. Next to a statement, the Trove owner can repay MUSD or add BTC collateral (BorrowerOperations.repayMUSD / addColl, hints from HintHelpers and SortedTroves) and deposit or withdraw MUSD in the Stability Pool (provideToSP / withdrawFromSP). A preview shows the new debt, collateral ratio and liquidation price, and refuses what the protocol would reject (net debt below minNetDebt, repaying more than debt minus gas compensation, wrong wallet, low balance). Tested end to end on Mezo Testnet with a scripted wallet, every call checked onchain (test/trove_actions_test.py). The video shows a real repay and a real Stability Pool deposit made in the app.

2. Trove panel fixed. getEntireDebtAndColl already includes pending redistribution rewards; Wave 1 added them twice. Panel and lender report now use the returned totals, name the redistributed part, and show liquidation price, system TCR and mode. Recovery Mode does not move the 110% liquidation line in MUSD; it blocks collateral withdrawals and limits new debt, and the app says so. 24 offline tests (test/trove.test.mjs).

3. Contracts verified and hardened. StatementRegistry and MusdPay are verified on the Mezo Testnet explorer. v2 adds a reentrancy lock to MusdPay and overflow-free pagination; 28 Foundry tests pass. This Wave stays on testnet; v2 is the version for mainnet.

4. Revenue model. Contracts stay fee-free and ownerless, so a statement never depends on trusting us. Revenue comes from tools around them: an accountant workspace (batch monthly statements and co-attestations for many client addresses, branded PDF, reminders; per client per month in MUSD) and merchant tooling (hosted invoices, payment webhooks, exports to local bookkeeping software; monthly in MUSD). Both are paid through MusdPay, so our own revenue appears on a verifiable MUSD Books statement.

Real use: no outside accountant or merchant has used it yet. Every flow above was run end to end on Mezo Testnet by us; first outside users are the next milestone.

Track 2 (Access and Distribution) · Mezo Testnet, chain 31611 · Solo builder (GitHub neimasilk), built with Claude (Anthropic)
Video (2:11): https://youtu.be/bl1slN8c7cc · Deck: https://neimasilk.github.io/musd-books/deck/
App: https://neimasilk.github.io/musd-books/ · Code: https://github.com/neimasilk/musd-books · Security notes: https://github.com/neimasilk/musd-books/blob/main/SECURITY.md

## Other form fields that change from Wave 1

- Project readiness: Testnet deployment.
- Chain deployed on: Mezo (testnet, chain id 31611).
- Future milestones:
  1. December 2026: first outside users: one accountant or bookkeeper piloting the workspace (batch statements, co-attestation).
  2. Q1 2027: merchant webhooks and export to local bookkeeping software.
  3. Q1 2027: MEZO and other Mezo ERC-20 statements side by side with MUSD in one report.
- Video: https://youtu.be/bl1slN8c7cc (published on the "Mukhlis Amien" channel of amien@ubhinus.ac.id).
- The Wave 2 dialog has no readiness/chain fields; it shows the Wave 1 "Declared build goals" and asks for milestones per Wave. Entered:
  - 3rd Wave: First outside users: one accountant or bookkeeper piloting the accountant workspace (batch monthly statements for several client addresses, co-attestation, branded PDF). MEZO and other Mezo ERC-20 statements side by side with MUSD in one report. Spreadsheet and PDF exports generated from the same deterministic statement.
  - 4th Wave: Merchant tooling: hosted invoice pages, payment webhooks and export to local bookkeeping software, paid monthly in MUSD through MusdPay. Mainnet deployment of the v2 contracts (StatementRegistry, MusdPay) once there is a real user to serve.
