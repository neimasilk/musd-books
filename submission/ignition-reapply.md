# Mezo Ignition Program: re-application (after the Buildathon)

**SUBMITTED 25 Nov 2026 ~23:35 WIB** (Typeform LCp2ZIYq showed "Form received!"). The W2 reward (9,716.52 MEZO = US$30) had landed on 24 Nov. The user filled name, email (amien@ubhinus.ac.id), X username and X link, and ticked the terms and submitted. The AI filled the rest: role, Telegram @neimasilk, LinkedIn skipped, 1-5, Bank on Bitcoin, Mainnet, and fields 12-16. Field 12 used the text below plus "After the Wave 2 review it added the 110% collateral-ratio checks the judges asked for." Field 16 added "and on 20 Nov to wait until the rewards were distributed (Wave 2 rewards arrived on 24 Nov)". The judge-feedback fixes (items 2-4) were pushed before submitting, in commits d2413c9, 3ad1724 and 9a73f30. Mezo replies within ~3 weeks, and only if accepted. Do not submit again.

Status 16 Nov 2026: the first application (15 Nov) was **not rejected on merit**. André Coutinho (Executive Director, Supernormal Foundation) replied on 16 Nov at 11:52 UTC:

> Deploying on both Mezo mainnet and testnet with real MUSD integration (permit payments, BorrowerOperations for Trove repay and collateral, Stability Pool deposits) is the kind of application the program looks for. [...] Our policy is to ask Buildathon teams to complete the Buildathon first and then apply, so we can assess the finished product and your standing in the program. Please do re-apply once the Buildathon wraps up.

When: the Buildathon has only 2 waves (AKINDO API, W2 `nextWaveEnabled: false`). W2 judging ends **19 Nov 2026 05:30 UTC (12:30 WIB)**. Re-apply after the W2 results are out, unless André's reply asks us to wait for the reward distribution. The user sent that question to André on 17 Nov at 00:18 WIB (thread in amien@ubhinus.ac.id).

Form: the same Typeform https://form.typeform.com/to/LCp2ZIYq. Use `ignition-application.md` for every field, with the changes below. The user again fills the **(you)** fields, ticks the terms and clicks Submit.

## Changes from the first submission

**12. Describe your product** (add the last sentence; fill in the W2 result)
```
Verifiable MUSD statements, invoice-referenced payments and onchain proof. MUSD Books turns any Mezo address into an exact MUSD statement that reconciles to the last unit, attaches invoice numbers to MUSD payments through MusdPay, and anchors the statement hash onchain, so an accountant, lender or customer can verify it from chain data without trusting the sender. It completed both waves of the Mezo Buildathon on AKINDO and earned a reward in each (Wave 1: US$16; Wave 2: US$30, judged at level L4).
```

**16. How did you hear about the program?**
```
Through the Mezo Buildathon on AKINDO, which MUSD Books completed (Wave 1: reward, judge scores 6/6/6/8/8; Wave 2: US$30 reward, level L4, 8/10 on improvement over the Wave 1 feedback), and the Supernormal Foundation website. This is a re-application: André Coutinho asked us on 16 Nov 2026 to re-apply once the Buildathon wrapped up.
```

Fields 7, 11, 13, 14 and 15 stay the same, but re-check them on the day:
- 11 still "Mainnet"; 13 still true (contracts on 31612 and 31611).
- 15: the deck at https://neimasilk.github.io/musd-books/ignition/ needs a short "Buildathon complete" line with the W1 and W2 results. The roadmap dates (M1 31 Dec, M2 31 Jan, M3 28 Feb) still work for a late-Nov re-application. Move them by a month only if the re-application slips past mid-December.

## W2 result (read 23 Nov 2026 ±18:30 WIB from the AKINDO public API)
- Judge vote on our product (2026-11-23T10:38Z): **US$30** (fixed_amount). W1 was US$16.
- W2 distribution across 165 submissions: 360 x5, 120 x10, **30 x30 (us)**, 11 x54, 0 x66. Only 15 teams are above us, so we sit in the top ~27%.
- The wave is NOT completed yet: `completedAt` is null and `judgementDeadline` moved to **2026-11-24T05:30Z (24 Nov 12:30 WIB)**. Re-check that the amount has not changed once `completedAt` is set. The [RESULT] text above is already filled in with US$30.
- Judge feedback (paraphrased): we reach L4. The app sends repayMUSD, addColl, provideToSP and withdrawFromSP, but only from our own wallet on testnet, and our contracts never call a Mezo primitive. To go higher:
  1. get those actions used on mainnet by wallets we don't control, plus statements or MusdPay payments from a real outside accountant or merchant (MusdPay has 0 mainnet txs);
  2. add a newICR >= 110% check to the repay and top-up preview;
  3. pre-check withdrawFromSP when any Trove is below MCR;
  4. make the materials agree on whether v2 is live on mainnet;
  5. build and price one paid feature from the revenue model.
  Items 2-4 are cheap code/doc fixes worth doing before the re-application. Items 1 and 5 make it stronger, but item 1 needs real outside users (no students, per the project rules).

## On the day (AFTER the W2 rewards are distributed; André, 20 Nov: "It would be best to wait until the rewards have been distributed")
W2 judging closes 22 Nov 12:30 WIB. W1 paid about 10 days after judging, so expect W2 distribution around 2-5 Dec. Re-apply once the W2 reward has landed in the wallet (or AKINDO/Mezo announce distribution is complete).
1. Read the W2 result on the AKINDO product page (score, reward, judge feedback). Replace `[RESULT]` above with something exact, for example "reward, scores x/x/x" or "submitted, no reward".
2. André answered the timing question on 20 Nov: wait until rewards are distributed (done, see heading).
3. Update the deck status line, push, and confirm the page loads.
4. The AI fills the non-personal fields via Playwright (persistent profile), and the user fills the personal ones and submits.
