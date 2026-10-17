"""Browser test of two features, on Mezo Testnet (read only, no wallet, no transactions):

  A. Merchant kit: the Request tab produces a plain HTML snippet and a script snippet; both render a working "Pay with MUSD" button
     whose link opens the pay page with the right payee, amount and reference. Invalid settings render a disabled button.
  B. Lender report: the borrower's statement downloads a Markdown report with the statement hash, reconciliation, anchors and a live Trove section.
  C. Stability Pool: the borrower made a real 100 MUSD deposit, so the statement page shows a pool card and the report has a pool section;
     the store has no deposit, so its page shows no pool card.

Usage: python test/features_test.py   (serves ../docs on 127.0.0.1:8768 itself)
"""
import html
import http.server
import pathlib
import re
import socketserver
import sys
import threading
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "http://127.0.0.1:8768/"
STORE = "0x21F5ae9d165a7E0EFDaf17A85c225713199eC439"
BORROWER = "0x444156722777F12f29F789F04fe9EAA5e90B10a9"
fails = []


def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  {extra}"))
    if not ok:
        fails.append(name)


def serve():
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(ROOT / "docs"), **k)

        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", 8768), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    srv = serve()
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)

        # ---- A. merchant kit
        pg = b.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(BASE + "index.html?net=testnet")
        pg.locator('button[data-tab="request"]').click()
        pg.fill("#reqTo", STORE)
        pg.fill("#reqAmount", "25.5")
        pg.fill("#reqRef", "INV-KIT-1")
        pg.click("#reqBtn")
        pg.wait_for_selector("#embedKit #embedScript")
        link_snip = pg.input_value("#embedLink")
        script_snip = pg.input_value("#embedScript")
        href = html.unescape(re.search(r'href="([^"]+)"', link_snip).group(1))
        q = parse_qs(urlparse(href).query)
        check("link snippet has the pay URL", q.get("pay") == [STORE] and q.get("amount") == ["25.5"] and q.get("ref") == ["INV-KIT-1"] and q.get("net") == ["testnet"], href)
        check("link snippet needs no script", "<script" not in link_snip)
        check("script snippet carries the settings", 'data-to="%s"' % STORE in script_snip and 'data-amount="25.5"' in script_snip and "pay-button.js" in script_snip, script_snip)
        check("preview button is shown", pg.locator("#embedPreview a").count() == 1)

        host = b.new_page()
        host.goto(BASE + "index.html?net=testnet")  # any page on the same origin so the absolute script URL loads
        host.set_content("<html><body>" + script_snip + '<div id="bad" data-musd-pay data-to="0x12" data-amount="x" data-ref="r"></div></body></html>')
        host.wait_for_selector("[data-musd-pay] a")
        a = host.locator("[data-musd-pay] a").first
        sq = parse_qs(urlparse(a.get_attribute("href")).query)
        check("script renders the button with the same link", sq == q and urlparse(a.get_attribute("href")).netloc == urlparse(href).netloc, str(a.get_attribute("href")))
        check("button text names the amount", a.inner_text() == "Pay 25.5 MUSD", a.inner_text())
        bad = host.locator("#bad a")
        check("invalid settings give a disabled button without a link", bad.get_attribute("aria-disabled") == "true" and bad.get_attribute("href") is None)

        pay = b.new_page()
        pay.goto(href)
        pay.wait_for_selector("#payTo:not(:empty)")
        pay.wait_for_selector("#payAmount:not(:empty)", timeout=60000)  # symbol is read from the token contract first
        check("pay page shows payee, amount and reference", pay.inner_text("#payTo").lower() == STORE.lower() and "25.5" in pay.inner_text("#payAmount") and pay.inner_text("#payRef") == "INV-KIT-1")
        check("no script errors on the request tab", not errs, str(errs))

        # ---- B. lender report
        pg2 = b.new_page()
        pg2.goto(BASE + f"index.html?account={BORROWER}&from=16192202&to=16192312&net=testnet")
        pg2.wait_for_selector("#resHash:not(:empty)", timeout=120000)
        pg2.wait_for_selector("#troveBox:not(.hidden)", timeout=60000)
        pg2.wait_for_selector("#existingAnchors .notice, #existingAnchors .muted", timeout=60000)
        h = pg2.inner_text("#resHash").strip()
        with pg2.expect_download() as dl:
            pg2.click("#dlLender")
        path = dl.value.path()
        md = pathlib.Path(path).read_text(encoding="utf-8")
        check("report file is Markdown named for the account", dl.value.suggested_filename.endswith("_lender_report.md"), dl.value.suggested_filename)
        check("report holds the statement hash", h in md)
        check("report says reconciled", "fully reconciled" in md)
        check("report explains loan draw and repayment", "loan draw: 2000" in md.replace(",", "") and "repayment: 150" in md, md[:900])
        check("report has a live Trove section", "Status: active" in md and "Collateral ratio:" in md and "Liquidation applies below 110%" in md, md[md.find("## Mezo Trove"):][:700])
        check("report carries an independent-check link", "expect=" + h in md)

        # ---- C. Stability Pool
        pg2.wait_for_selector("#poolBox:not(.hidden)", timeout=60000)
        pool_txt = pg2.inner_text("#poolStats")
        check("pool card shows the deposit, the share of the pool and the pending BTC gain", re.search(r"100(\.0+)? MUSD", pool_txt) and "Share of pool" in pool_txt and "Pending BTC gain" in pool_txt, pool_txt)
        check("report has a Stability Pool section with the deposit", "## Mezo Stability Pool" in md and "Deposit (after liquidation losses): 100 MUSD" in md, md[md.find("## Mezo Stability Pool"):][:500])
        check("report explains that pooled MUSD is not spent", "is not spent" in md)
        pg3 = b.new_page()
        pg3.goto(BASE + f"index.html?account={STORE}&from=16192210&to=16192312&net=testnet")
        pg3.wait_for_selector("#resHash:not(:empty)", timeout=120000)
        pg3.wait_for_timeout(6000)  # give the optional pool read time to finish
        check("an account without a deposit shows no pool card", pg3.locator("#poolBox.hidden").count() == 1)
        b.close()
    srv.shutdown()
    if fails:
        print("FAILED:", fails)
        sys.exit(1)
    print("ALL PASS")


if __name__ == "__main__":
    main()
