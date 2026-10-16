# 2-minute pitch video: script and shot list

Target length 1:50 to 2:00. Speak calmly. Record the screen with the app open at
https://neimasilk.github.io/musd-books/ . Words in [brackets] are actions, not speech.

**0:00 [show the deck, slide 1]**
"Hi, I'm presenting MUSD Books, built for Track 2, Access and Distribution. It gives MUSD users verifiable books: a statement an accountant, a lender or a customer can check without trusting the person who sent it."

**0:15 [slide 2]**
"Mezo lets people borrow MUSD against Bitcoin instead of selling it, and MUSD is something you can pay and get paid in. That creates a record-keeping gap. A block explorer shows raw logs. A spreadsheet from one side proves nothing to the other. And a transfer carries no invoice number."

**0:35 [open the app, demo store statement link]**
"Here is a statement for a demo store on Mezo testnet. Every MUSD transfer is counted once, with full 18-decimal precision. Opening plus money in minus money out equals the on-chain closing balance exactly, and the app says so. The invoice references, INV-0001 to INV-0003, are attached to the payments. A supplier payment goes out with its purchase order number."

**1:00 [scroll to Anchor onchain]**
"The statement is a deterministic CSV. Its hash is anchored in a registry contract. This one is anchored twice: once by the store and once by the accountant. Anyone can verify a file with one view call, and can re-derive the whole statement from chain data."

**1:20 [switch to the borrower statement or the Mezo mainnet account]**
"It understands Mezo. When a Trove owner draws a loan, the new MUSD shows as a mint. Repayments show as burns. Core contracts like BorrowerOperations and the Stability Pool are named. This statement comes from a real Trove on testnet: two thousand MUSD borrowed, one hundred fifty repaid."

**1:40 [slide 5 or the Payment request tab]**
"Payments use MusdPay. It moves MUSD straight from payer to merchant and records the reference right after the token's own transfer, in a single transaction using MUSD's permit support. No custody, no owner, no fees."

**1:52 [slide 8]**
"It's open source, tested against real Mezo data, and in Wave 2 I'll bring it to mainnet with an accountant co-signing flow. Thank you."

## Notes
- If you stumble, keep going; a natural take is better than a polished one.
- Do not show wallet pop-ups, private keys or your email.
- Upload the video to YouTube (unlisted) or Loom and paste the link in the AKINDO form.
