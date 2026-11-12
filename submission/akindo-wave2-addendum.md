# Wave 2 addendum (draft, 13 Nov 2026)

Purpose: add to the AKINDO product page (or post as a comment on it) before judging starts. The Wave 2 submission deadline in the API is 15 Nov 2026 15:00 UTC (22:00 WIB).

The text answers two Wave 1 review points that the Wave 2 update left open: "mainnet" and "real users".

## Variant A (no spend; ready now)

**Mainnet check (13 Nov).** MUSD Books now reads Mezo mainnet. Its first real mainnet statement covers the builder's own Wave 1 reward: MEZO swapped to MUSD on Tigris, then bridged out through Wormhole NTT. The statement has 6 MUSD transfers, is fully reconciled with zero unexplained, and labels each counterparty (Tigris MEZO/MUSD pool, Tigris BTC/MUSD pool, Wormhole NTT). Anyone can re-derive it in the browser from chain data and compare the hash: https://neimasilk.github.io/musd-books/?account=0x0428b16c99eff57268e69e5eb93aacce18711ba5&from=13141300&to=13141700&net=mainnet&expect=0xcb4b90f9ac3290c85429e7d06142df12f5b241f1c45617064874c06d60b1e064

This is the builder's own use, not an outside user. The StatementRegistry and MusdPay contracts are still testnet only.

## Variant B (only if the user approves a mainnet deploy, about 1.8e-6 BTC ≈ $0.17 gas)

Same text as A, plus:

**v2 contracts on Mezo mainnet.** StatementRegistry `<addr>` and MusdPay `<addr>` are deployed and verified. The reward statement above is anchored onchain (tx `<hash>`), so its hash can be checked against the registry from the review link.
