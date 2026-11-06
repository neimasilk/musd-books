# YouTube upload text for the Wave 2 pitch video

File: `submission/video/out3/musdbooks-pitch-w2.mp4` (2:11, built by `submission/video/make_video_w2.py`).

**Title:** MUSD Books, Mezo Buildathon Wave 2: act on Mezo from a verifiable MUSD statement

**Description:**

MUSD Books gives MUSD users verifiable books: a statement that an accountant, a lender or a customer can check without trusting the sender. This is the Wave 2 pitch for the Mezo Buildathon. It runs on Mezo Testnet.

New in Wave 2:
- Act on Mezo from the statement: repay MUSD or add BTC collateral (BorrowerOperations, with HintHelpers and SortedTroves hints), and deposit or withdraw MUSD in the Stability Pool. A preview shows the new debt, collateral ratio and liquidation price first, and refuses what the protocol would reject.
- Trove panel fixed: pending redistribution rewards are no longer counted twice; liquidation price, system TCR and Normal/Recovery Mode are shown.
- StatementRegistry and MusdPay verified on the Mezo Testnet explorer; version 2 contracts add a reentrancy lock (28 Foundry tests).
- Business model: free, ownerless contracts; revenue from an accountant workspace and merchant tooling, paid in MUSD through MusdPay.

The transactions in the video are real Mezo Testnet transactions sent from the page by a scripted test wallet. No outside users yet; a first bookkeeper pilot is the next milestone.

Live app: https://neimasilk.github.io/musd-books/
Deck: https://neimasilk.github.io/musd-books/deck/
Code: https://github.com/neimasilk/musd-books
Security notes: https://github.com/neimasilk/musd-books/blob/main/SECURITY.md

Disclosure: the project was written by Claude (Anthropic) for its human owner, and the narration is a synthetic voice.

**Visibility:** Public, like the earlier pitch videos.
