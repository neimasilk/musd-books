"""Takes gallery screenshots of the live site: the accountant review check and the merchant kit.
Usage: python scripts/make_shots.py    (reads https://neimasilk.github.io/musd-books/, writes docs/assets/shot-review.png and shot-kit.png)
"""
import pathlib

from playwright.sync_api import sync_playwright

SITE = "https://neimasilk.github.io/musd-books/"
STORE = "0x21F5ae9d165a7E0EFDaf17A85c225713199eC439"
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
    b.close()
print("done")
