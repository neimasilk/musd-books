"""End-to-end test of the Wave 2 in-app Mezo actions on Mezo Testnet, using the scripted EIP-1193 wallet from wallet_flow_test.py.

The page is the real app, the contracts are Mezo's real BorrowerOperations and StabilityPool, the account is the demo Trove owner
(testnet-only key from D:\\cariuang\\.env, never printed). Each action is checked onchain afterwards, not just in the page:

  1. Repay MUSD from the statement's Trove card   -> repayMUSD on BorrowerOperations, MUSD burned from the owner, debt down by the amount
  2. Add BTC collateral from the same card          -> addColl with value, Trove collateral up by the amount
  3. Deposit MUSD to the Stability Pool             -> approve (if needed) + provideToSP, compounded deposit up by the amount
  4. Withdraw part of it                            -> withdrawFromSP, deposit down by the amount
  5. Guard rails: a repayment above the allowed maximum is refused in the preview and on click, with no transaction sent;
     the Trove card states the system mode (Normal / Recovery) and keeps the 110% liquidation line.

Usage: python test/trove_actions_test.py   (serves ../docs on 127.0.0.1:8767 itself)
"""
import http.server
import json
import pathlib
import socketserver
import sys
import threading
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from wallet_flow_test import WALLET_JS, env_key, rpc as rpc_once, RPC  # noqa: E402


def rpc(method, params):
    """rpc_once with retries: the load-balanced public RPC sometimes answers with an error or from a lagging node."""
    last = None
    for _ in range(30):
        try:
            return rpc_once(method, params)
        except Exception as e:  # KeyError on an error reply, network errors
            last = e
            time.sleep(2)
    raise SystemExit(f"{method} failed: {last!r}")


def receipt(tx):
    for _ in range(60):
        r = rpc("eth_getTransactionReceipt", [tx])
        if r:
            return r
        time.sleep(2)
    raise SystemExit("no receipt for " + tx)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OWNER = "0x444156722777F12f29F789F04fe9EAA5e90B10a9"
MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503"
TROVE_MANAGER = "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0"
BORROWER_OPS = "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5"
STABILITY_POOL = "0x1CCA7E410eE41739792eA0A24e00349Dd247680e"
TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
E = 10 ** 18
PORT = 8767

bad = 0


def check(name, ok, extra=""):
    global bad
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  {extra}"))
    if not ok:
        bad += 1


def call(to, data, block="latest"):
    # The public RPC is load-balanced and some nodes lag a few blocks, so read at an explicit block and retry until it is served.
    tag = block if block == "latest" else hex(block)
    for _ in range(30):
        try:
            res = rpc("eth_call", [{"to": to, "data": data}, tag])
            if res is not None:
                return res
        except Exception:
            pass
        time.sleep(2)
    raise SystemExit(f"eth_call at {tag} not served")


def arg(a):
    return a.lower().replace("0x", "").rjust(64, "0")


def trove(block="latest"):
    h = call(TROVE_MANAGER, "0xb91af97c" + arg(OWNER), block)[2:]
    w = [int(h[i:i + 64], 16) for i in range(0, len(h), 64)]
    return {"coll": w[0], "debt": w[1] + w[2]}


def sp_deposit(block="latest"):
    return int(call(STABILITY_POOL, "0x8c4726eb" + arg(OWNER), block), 16)


def around(r):
    """Block numbers just before and at a transaction, for exact before/after reads."""
    n = int(r["blockNumber"], 16)
    return n - 1, n


def serve():
    srv = socketserver.TCPServer(("127.0.0.1", PORT), type("H", (http.server.SimpleHTTPRequestHandler,), {
        "__init__": lambda self, *a, **k: http.server.SimpleHTTPRequestHandler.__init__(self, *a, directory=str(ROOT / "docs"), **k),
        "log_message": lambda self, *a, **k: None}))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def last_tx(page, status_id):
    link = page.locator(f"#{status_id} a").first.get_attribute("href")
    return link.split("/tx/")[1]


def act(page, input_id, value, button_id, status_id):
    page.fill(f"#{input_id}", value)
    page.click(f"#{button_id}")
    try:
        page.wait_for_function(
            f"() => /Done in|reverted|Error|Connect the wallet|At most|holds|no Trove|no Stability/.test(document.getElementById('{status_id}').innerText)",
            timeout=180000)
    except Exception:
        print("  timeout; status:", page.locator(f"#{status_id}").inner_text()[:300])
        print("  send errors:", page.evaluate("window.__sendErrors || []"))
        return None
    text = page.locator(f"#{status_id}").inner_text()
    if "Done in" not in text:
        print("  status:", text[:300])
        print("  send errors:", page.evaluate("window.__sendErrors || []"))
        return None
    return last_tx(page, status_id)


def main():
    latest = int(rpc("eth_blockNumber", []), 16)
    url = f"http://127.0.0.1:{PORT}/index.html?account={OWNER}&from={latest - 260}&to={latest - 60}&net=testnet#trove"
    srv = serve()
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 1200, "height": 1000})
        ctx.add_init_script(WALLET_JS.replace("__KEY__", env_key()).replace("__RPC__", RPC))
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url, wait_until="domcontentloaded")
        try:
            page.wait_for_selector("#troveActions:not(.hidden)", timeout=120000)
        except Exception:
            print("  statement status:", page.locator("#genStatus").inner_text()[:300], "| trove box hidden:",
                  page.evaluate("document.getElementById('troveBox').classList.contains('hidden')"), "| errors:", errors[:3])
            raise
        page.wait_for_selector("#poolBox:not(.hidden)", timeout=60000)

        system = page.locator("#troveSystem").inner_text()
        check("Trove card states the system mode and the 110% line", ("Normal Mode" in system or "Recovery Mode" in system) and "110%" in (system + page.locator("#troveStats").inner_text()), system[:200])

        # 5. Guard rail first: too large a repayment never reaches the wallet.
        page.fill("#repayAmt", "100000")
        check("preview refuses a repayment above the maximum", "At most" in page.locator("#trovePreview").inner_text(), page.locator("#trovePreview").inner_text()[:200])
        sends_before = page.evaluate("(window.__walletLog || []).filter(m => m === 'eth_sendTransaction').length")
        page.click("#repayBtn")
        page.wait_for_function("() => /At most/.test(document.getElementById('troveActStatus').innerText)", timeout=60000)
        sends_after = page.evaluate("(window.__walletLog || []).filter(m => m === 'eth_sendTransaction').length")
        check("clicking it is refused with no transaction sent", sends_after == sends_before)
        page.fill("#repayAmt", "")
        page.evaluate("document.getElementById('troveActStatus').innerHTML = ''")

        # 1. Repay
        tx = act(page, "repayAmt", "1.5", "repayBtn", "troveActStatus")
        check("repay: page reports success", tx is not None)
        if tx:
            r = receipt(tx)
            before, after = around(r)
            t0 = trove(before)
            burns = [l for l in r["logs"] if l["address"].lower() == MUSD.lower() and l["topics"][0] == TRANSFER
                     and l["topics"][1].endswith(arg(OWNER)) and int(l["topics"][2], 16) == 0]
            t1 = trove(after)
            check("repay: tx to BorrowerOperations succeeded", r["status"] == "0x1" and r["to"].lower() == BORROWER_OPS.lower())
            check("repay: 1.5 MUSD burned from the owner", len(burns) == 1 and int(burns[0]["data"], 16) == 15 * E // 10)
            # interest accrues every second, so allow a hair of drift
            check("repay: Trove debt down by 1.5 MUSD", abs((t0["debt"] - t1["debt"]) - 15 * E // 10) < E // 1000, f"{t0['debt']} -> {t1['debt']}")

        # 2. Add collateral
        tx = act(page, "collAmt", "0.0002", "addCollBtn", "troveActStatus")
        check("add collateral: page reports success", tx is not None)
        if tx:
            r = receipt(tx)
            before, after = around(r)
            t0, t1 = trove(before), trove(after)
            check("add collateral: tx to BorrowerOperations succeeded", r["status"] == "0x1" and r["to"].lower() == BORROWER_OPS.lower())
            check("add collateral: Trove collateral up by 0.0002 BTC", t1["coll"] - t0["coll"] == 2 * E // 10000, f"{t0['coll']} -> {t1['coll']}")

        # 3. Stability Pool deposit
        tx = act(page, "spAmt", "2", "spDepositBtn", "poolActStatus")
        check("pool deposit: page reports success", tx is not None)
        if tx:
            r = receipt(tx)
            before, after = around(r)
            d0, d1 = sp_deposit(before), sp_deposit(after)
            check("pool deposit: provideToSP succeeded", r["status"] == "0x1" and r["to"].lower() == STABILITY_POOL.lower())
            check("pool deposit: deposit up by 2 MUSD", abs((d1 - d0) - 2 * E) < E // 1000, f"{d0} -> {d1}")

        # 4. Stability Pool withdrawal
        page.wait_for_function("!document.getElementById('spWithdrawBtn').disabled", timeout=60000)
        tx = act(page, "spAmt", "1", "spWithdrawBtn", "poolActStatus")
        check("pool withdraw: page reports success", tx is not None)
        if tx:
            r = receipt(tx)
            before, after = around(r)
            d0, d1 = sp_deposit(before), sp_deposit(after)
            check("pool withdraw: withdrawFromSP succeeded", r["status"] == "0x1" and r["to"].lower() == STABILITY_POOL.lower())
            check("pool withdraw: deposit down by 1 MUSD", abs((d0 - d1) - E) < E // 1000, f"{d0} -> {d1}")

        check("Trove and pool cards are still shown after the last action",
              page.evaluate("!document.getElementById('troveBox').classList.contains('hidden') && !document.getElementById('poolBox').classList.contains('hidden')"))
        page.screenshot(path=str(ROOT / "test" / "trove_actions_last.png"), full_page=True)
        b.close()
    srv.shutdown()
    check("no page errors", not errors, "; ".join(errors[:3]))
    print("ALL PASS" if not bad else f"{bad} FAILED")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
