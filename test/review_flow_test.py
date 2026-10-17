"""Test of the accountant review link on Mezo Testnet (read-only, no wallet, no transactions).

  1. Open the demo store's statement and read its hash.
  2. Open the review link the app produces ("expect" = that hash): the page must report a passed independent check.
  3. Open the same link with one hex digit changed: the page must report a mismatch and not claim a pass.
  4. Check that the shared link round-trips (contains the same account, range and hash).

Usage: python test/review_flow_test.py   (serves ../docs on 127.0.0.1:8767 itself)
"""
import http.server
import pathlib
import socketserver
import sys
import threading
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
STORE = "0x21F5ae9d165a7E0EFDaf17A85c225713199eC439"
BASE = "http://127.0.0.1:8767/index.html"
RANGE = "from=16192210&to=16192312&net=testnet"


def serve():
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(ROOT / "docs"), **k)

        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", 8767), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def open_page(p, url):
    b = p.chromium.launch(headless=True)
    pg = b.new_page()
    pg.goto(url)
    pg.wait_for_selector("#resHash:not(:empty)", timeout=120000)
    return b, pg


def main():
    srv = serve()
    fails = []
    with sync_playwright() as p:
        b, pg = open_page(p, f"{BASE}?account={STORE}&{RANGE}")
        h = pg.inner_text("#resHash").strip()
        assert h.startswith("0x") and len(h) == 66, h
        if pg.inner_text("#reviewBanner").strip():
            fails.append("a plain statement must not show a review banner")
        if pg.inner_text("#anchorBtn").strip() != "Anchor statement":
            fails.append("plain statement must keep the 'Anchor statement' button")
        link = pg.eval_on_selector("#shareReview a", "a => a.href")
        b.close()

        q = parse_qs(urlparse(link).query)
        if q.get("expect", [""])[0].lower() != h.lower() or q.get("account", [""])[0].lower() != STORE.lower() or q.get("from") != ["16192210"] or q.get("to") != ["16192312"]:
            fails.append(f"share link does not round-trip: {link}")

        b, pg = open_page(p, link.replace("http://127.0.0.1:8767/index.html", BASE))
        txt = pg.inner_text("#reviewBanner")
        if "Independent check passed" not in txt:
            fails.append(f"matching hash did not pass: {txt!r}")
        if pg.inner_text("#anchorBtn").strip() != "Co-attest this statement":
            fails.append("reviewer should see the co-attest button label")
        b.close()

        bad = h[:-1] + ("0" if h[-1] != "0" else "1")
        b, pg = open_page(p, f"{BASE}?account={STORE}&{RANGE}&expect={bad}")
        txt = pg.inner_text("#reviewBanner")
        if "Hash mismatch" not in txt or "passed" in txt:
            fails.append(f"changed hash must be reported as a mismatch: {txt!r}")
        b.close()

        b, pg = open_page(p, f"{BASE}?account={STORE}&{RANGE}&expect=0x123")
        if pg.inner_text("#reviewBanner").strip():
            fails.append("a malformed expect value must be ignored")
        b.close()
    srv.shutdown()
    if fails:
        print("FAIL")
        for f in fails:
            print(" -", f)
        sys.exit(1)
    print("PASS: plain statement, matching review link, mismatch, malformed hash, link round-trip")


if __name__ == "__main__":
    main()
