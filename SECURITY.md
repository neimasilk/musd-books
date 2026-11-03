# Security notes

MUSD Books has two small contracts and a browser-only app. This file says what they protect, what was
checked, what was found, and what is not covered.

**This is a self-review by the author (an AI model working for an individual developer). It is not a
professional audit.** Both contracts are deployed on Mezo Testnet only, as version 1 (source at commit
`1b9fb0b`, verified on the Mezo Testnet explorer). The source in this repository is version 2, which fixes
I-1 and L-1 below and is the version meant for mainnet.

## What the contracts do and do not do

| Contract | Holds funds | Owner or admin | Upgradeable | Fee |
|---|---|---|---|---|
| `MusdPay` | never (tokens go payer to merchant inside one call) | none | no | none |
| `StatementRegistry` | never (stores hashes only) | none | no | none |

- `MusdPay.pay` always pulls tokens from `msg.sender`. Nobody can spend someone else's approval through it.
- `MusdPay.payWithPermit` tolerates a permit that someone already used (a relayer front-running the signature) as
  long as the allowance is sufficient; otherwise it reverts and no tokens move.
- `StatementRegistry.anchor` is permissionless on purpose, so an accountant or lender can co-attest a hash.
  An anchor says "this address attests that this hash matches this account, token and block range". It is not proof
  by itself: anyone can re-derive the statement from chain data and compare it (the app's Verify tab and review link).

## What was checked

| Check | Result |
|---|---|
| Unit tests (Foundry), 14 tests | pass |
| Property tests (fuzz, 1,000 runs each in CI, 2,000 for the release check) | pass |
| Invariant tests, 128,000 random calls per suite for the release check (256 runs x 500 calls) | pass |
| Hook-token tests: a nested payment is refused (v2), a plain payment keeps `Transfer` then `PaymentReference` | pass |
| `forge lint` | 1 note, same as I-1 (the event still follows the token call; the lock makes the order fixed) |
| Slither 0.11.5 (101 detectors) | 3 results, all informational, none high or medium |

Properties covered by the tests:

- `MusdPay`: exactly two logs per payment, the token's `Transfer` first and `PaymentReference` right after it, with
  matching payer, merchant, amount and reference hash; balances are conserved; the contract never holds tokens; an
  attacker cannot move a victim's funds; a garbage permit cannot create an allowance; references over 96 bytes revert.
- `StatementRegistry`: anchors round-trip exactly; a party cannot attest the same hash twice; co-attestation works and
  lists the hash once per account; ranges ending in the future, inverted ranges and long labels revert; pagination is
  exact; `totalAnchors` equals the number of successful calls; per-hash counts never double count a party.

Run them yourself:

```
cd contracts
forge test                 # CI settings: 1,000 fuzz runs, 64 x 200 invariant calls
FOUNDRY_INVARIANT_RUNS=256 FOUNDRY_INVARIANT_DEPTH=500 forge test --fuzz-runs 2000   # the heavier release check
node ../test/pool.test.mjs && node ../test/report.test.mjs && node ../test/trove.test.mjs   # offline engine tests
```

## Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| I-1 | Informational | `PaymentReference` is emitted after the external token call (Slither `reentrancy-events`, `forge lint`). With a plain ERC-20 such as MUSD or MEZO the order cannot be changed. With a token that calls a hook on the receiver (ERC-777 style), a nested payment can sit between a payment's `Transfer` and its `PaymentReference` (`test/MusdPay.hooks.t.sol`). The statement engine joins the two by log position and requires payer, merchant and amount to match, so the affected payment shows as a plain transfer instead of a referenced one. Funds are never at risk. | **Fixed in v2**: `pay` and `payWithPermit` are `nonReentrant`, so a nested payment reverts (`test_hookToken_reentrantPaymentIsRefused`). The testnet v1 deployment keeps the old behaviour. |
| I-2 | Informational | `_safeTransferFrom` uses a low-level call (Slither `low-level-calls`). This is deliberate: it supports tokens whose `transferFrom` returns nothing, checks that the token has code, and rejects a `false` return. Tested with a no-return token. | Accepted. |
| L-1 | Low | `StatementRegistry.statementsOf(account, offset, limit)` computes `offset + limit`, which overflows for a huge `limit` and makes this view call revert instead of returning the tail. No state or funds involved; the app always passes a small limit. | **Fixed in v2**: the end index is computed without `offset + limit` (`test_statementsOf_hugeLimitReturnsTail`). The testnet v1 deployment is left unchanged so the demo anchors stay valid. |
| L-2 | Low | Anchoring is permissionless, so anyone can add hashes to any account's list (noise or spam; the cost is gas). It cannot change or remove existing anchors. The app shows the attester of every anchor and verification never trusts an anchor without re-deriving the statement. | By design. |
| L-3 | Low | `PaymentReference` logs the requested amount. For a fee-on-transfer or rebasing token the received amount can differ. MUSD and MEZO are plain ERC-20s. The statement engine reconciles against the token's own `Transfer` logs and balances, so a mismatch shows up as an unexplained difference instead of being hidden. | Documented. |

## Actions on Mezo from the app (Wave 2)

The app can now send transactions to Mezo's own contracts: `BorrowerOperations.repayMUSD` and `addColl` for the
statement account's Trove, and `StabilityPool.provideToSP` / `withdrawFromSP` (with an `approve` first when needed).
MUSD Books adds no contract in between and never holds funds.

- Each action requires the connected wallet to be the statement account; otherwise it stops before the wallet is asked.
- Amounts are checked against the same rules the protocol enforces (net debt stays at or above `minNetDebt`, a
  repayment never exceeds debt minus the 200 MUSD gas compensation, wallet balances, deposit size), so the user sees
  the reason instead of a reverted transaction. The protocol still enforces them.
- The sorted-list hints come from Mezo's `HintHelpers` and `SortedTroves`; if that lookup fails the app sends zero hints,
  which are valid and only cost more gas.
- Tested end to end on Mezo Testnet with a scripted wallet and checked onchain after each call
  (`python test/trove_actions_test.py`).

## Trust assumptions and limits

- The app reads chain data through public RPC endpoints. A dishonest RPC could feed wrong data; the review link
  re-derives the statement in a second browser, and the hash lets anyone compare results. Use your own node for
  high-value statements.
- The live Trove and Stability Pool panels show current values from the deployed Mezo contracts and the price feed.
  They are not part of the hashed statement.
- Statements cover one token at a time. Native BTC gas is out of scope.
- The app has no backend, collects nothing and stores nothing. Wallet interaction uses the injected EIP-1193 wallet.
- Bookkeeping aid only, not tax or legal advice.

## Reporting a problem

Please open a GitHub issue at https://github.com/neimasilk/musd-books/issues. For something sensitive, use GitHub's
private vulnerability reporting for this repository (Security tab, "Report a vulnerability") if it is enabled.
