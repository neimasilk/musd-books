"""Takes gallery screenshots of the live site: the accountant review check, the merchant kit and the Stability Pool card.
Usage: python scripts/make_shots.py    (reads https://neimasilk.github.io/musd-books/, writes docs/assets/shot-review.png, shot-kit.png, shot-pool.png)
"""
import pathlib

from playwright.sync_api import sync_playwright

SITE = "https://neimasilk.github.io/musd-books/"
STORE = "0x21F5ae9d165a7E0EFDaf17A85c225713199eC439"
BORROWER = "0x444156722777F12f29F789F04fe9EAA5e90B10a9"
RANGE = "from=16192210&to=16192312&net=testnet"
OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "assets"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1100, "height": 900}, device_scale_factor=2)
    pg.goto(f"{SITE}?account={STORE}&{RANGE}")
    pg.wait_for_selector("#resHash:not(:empty)", timeout=120000)
    h = pg.inner_text("#resHash").strip()
    pg.goto(f"{SITE}?account={STORE}&{RANGE}&expect={h}")
    pg.wait_for_selector("#reviewBanner .notice", timeout=120000)
    pg.wait_for_selector("#existingAnchors .notice", timeout=60000)
    pg.wait_for_timeout(800)
    pg.locator("#result > .card").first.screenshot(path=str(OUT / "shot-review.png"))
    # the anchor card with the co-attest button and the share link
    pg.locator("#shareReview").scroll_into_view_if_needed()
    pg.locator("#result .card", has=pg.locator("#anchorBtn")).screenshot(path=str(OUT / "shot-review-anchor.png"))

    pg2 = b.new_page(viewport={"width": 1100, "height": 900}, device_scale_factor=2)
    pg2.goto(SITE + "?net=testnet")
    pg2.locator('button[data-tab="request"]').click()
    pg2.fill("#reqTo", STORE)
    pg2.fill("#reqAmount", "25.00")
    pg2.fill("#reqRef", "INV-2026-0042")
    pg2.click("#reqBtn")
    pg2.wait_for_selector("#embedKit #embedScript")
    pg2.locator("#tab-request .card").first.screenshot(path=str(OUT / "shot-kit.png"))

    pg3 = b.new_page(viewport={"width": 1100, "height": 900}, device_scale_factor=2)
    pg3.goto(f"{SITE}?account={BORROWER}&from=16192202&to=16192312&net=testnet")
    pg3.wait_for_selector("#troveBox:not(.hidden)", timeout=120000)
    pg3.wait_for_selector("#poolBox:not(.hidden)", timeout=60000)
    pg3.wait_for_timeout(600)
    pg3.locator("#poolBox").screenshot(path=str(OUT / "shot-pool.png"))
    b.close()
print("done")
