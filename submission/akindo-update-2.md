# AKINDO update 2 (live on the product page since 17 Oct 2026, evening)

AKINDO rejects a product description longer than about 6,000 characters (the save returns HTTP 400), so this is the
compact version that is live. The full text is in the README, SECURITY.md and the deck. The video field now points to
the version 2 pitch: https://youtu.be/ReoPlqnpgkc

## Update 2, 17 Oct 2026, evening
Stability Pool position: next to the Trove, the app reads the account's deposit in the Mezo Stability Pool (after liquidation losses), its share of the pool and the pending BTC gain, straight from the StabilityPool contract. Not part of the hashed CSV. Checked with a real 100 MUSD testnet deposit and a mainnet read.
Security: 27 Foundry tests with fuzz and invariant suites (128,000 random calls each), a hook-token test, Slither with nothing high or medium, and SECURITY.md listing every finding and the limits of a self-review: https://github.com/neimasilk/musd-books/blob/main/SECURITY.md
New pitch video (1:50) covers all additions.
