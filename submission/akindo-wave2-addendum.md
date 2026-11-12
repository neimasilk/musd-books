# Wave 2 addendum (13 Nov 2026)

This text goes on the AKINDO product page before judging starts. The Wave 2 submission deadline in the API is 15 Nov 2026 15:00 UTC (22:00 WIB).

It answers the Wave 1 review points that the Wave 2 update had left open: "verify MusdPay and StatementRegistry, deploy mainnet" and "show real use".

## Text to paste

**Update, 13 Nov: MUSD Books is on Mezo mainnet**

- **Contracts:** the v2 contracts (with the reentrancy lock) are deployed on Mezo mainnet and verified on explorer.mezo.org.
  - StatementRegistry: https://explorer.mezo.org/address/0x431785e21f9224c53aa37108d14cfa865279d23c
  - MusdPay: https://explorer.mezo.org/address/0x5fa72a1821254a49d7c0af692115a4dabe81921a
- **First real mainnet statement, anchored onchain.** It covers the builder's own Wave 1 reward: MEZO swapped to MUSD on Tigris, then bridged out through Wormhole NTT.
  - The statement has 6 MUSD transfers. It is fully reconciled, with zero unexplained.
  - Each counterparty is labelled (Tigris MEZO/MUSD pool, Tigris BTC/MUSD pool, Wormhole NTT).
  - Anchor tx: https://explorer.mezo.org/tx/0xc788baefbb176764045b7c0f750a1cee8d5ff7c58dcfa79c7b128c93def9bcd2
- **Check it yourself.** The link below makes your browser re-derive the statement from chain data, compare its hash, and show the onchain anchor: https://neimasilk.github.io/musd-books/?account=0x0428b16c99eff57268e69e5eb93aacce18711ba5&from=13141300&to=13141700&net=mainnet&expect=0x6ae6126d54386e2040f7ac190bd005fca9f3583f419ad7c961d2f32afc787586
- **Honest status:** this is the builder's own use, not an outside user yet. The deploy gas was 0.0000017 BTC.
