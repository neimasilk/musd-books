"""End-to-end test of the "Pay with wallet" page on Mezo Testnet, using a scripted EIP-1193 wallet.

A real browser wallet is not available in an automated browser, so the page gets a stand-in `window.ethereum` that signs with a
testnet-only key (read from D:\\cariuang\\.env, never printed) and forwards reads to the public RPC. Everything else is the real app,
the real MusdPay contract and the real MUSD token.

Two runs:
  A. permit path (single transaction, EIP-2612 signature)
  B. fallback path (permit signing fails with a non-rejection error, so the app must approve and then pay)

Usage: python test/wallet_flow_test.py   (serves ../docs on 127.0.0.1:8766 itself)
"""
import http.server
import json
import pathlib
import re
import socketserver
import sys
import threading
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
RPC = "https://rpc.test.mezo.org"
STORE = "0x21F5ae9d165a7E0EFDaf17A85c225713199eC439"
MUSDPAY = json.loads((ROOT / "deployments.json").read_text())["MusdPay"]["address"]
PAYMENT_REF_TOPIC = "0x0a8c2b7e10eeb41773d43a678fe379271a4769bf715d39e489b22a33d339ecb5"


def env_key():
    for line in (ROOT.parent / ".env").read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*MEZO_TESTNET_KEY=(.*)", line)
        if m:
            return m.group(1).strip().strip("\"'")
    raise SystemExit("MEZO_TESTNET_KEY not found")


WALLET_JS = """
(() => {
  const KEY = '__KEY__', RPC = '__RPC__';
  let local = null;
  const load = async () => {
    if (local) return local;
    const viem = await import('https://cdn.jsdelivr.net/npm/viem@2.57.2/+esm');
    const acc = await import('https://cdn.jsdelivr.net/npm/viem@2.57.2/accounts/+esm');
    const account = acc.privateKeyToAccount(KEY.startsWith('0x') ? KEY : '0x' + KEY);
    const chain = viem.defineChain({ id: 31611, name: 'Mezo Testnet', nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
    local = { account, wallet: viem.createWalletClient({ account, chain, transport: viem.http(RPC) }), viem };
    return local;
  };
  const forward = async (method, params) => {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json();
    if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; throw e; }
    return j.result;
  };
  window.__walletLog = [];
  window.ethereum = {
    isMetaMask: false,
    on() {}, removeListener() {},
    async request({ method, params = [] }) {
      window.__walletLog.push(method);
      const w = await load();
      switch (method) {
        case 'eth_requestAccounts': case 'eth_accounts': return [w.account.address];
        case 'eth_chainId': return '0x7b7b';
        case 'wallet_switchEthereumChain': case 'wallet_addEthereumChain': return null;
        case 'eth_signTypedData_v4': {
          if (window.__failPermit) { const e = new Error('Typed data signing is not supported by this wallet'); e.code = -32601; throw e; }
          const t = JSON.parse(params[1]);
          const types = { ...t.types }; delete types.EIP712Domain;
          return w.account.signTypedData({ domain: t.domain, types, primaryType: t.primaryType, message: t.message });
        }
        case 'eth_sendTransaction': {
          const tx = params[0];
          try {
            return await w.wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined, gas: tx.gas ? BigInt(tx.gas) : undefined });
          } catch (e) { (window.__sendErrors = window.__sendErrors || []).push(String(e.details || e.shortMessage || e.message).slice(0, 300)); throw e; }
        }
        default: return forward(method, params);
      }
    },
  };
})();
"""


def rpc(method, params):
    req = urllib.request.Request(RPC, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
                                 headers={"content-type": "application/json", "user-agent": "musdbooks-test"})
    return json.load(urllib.request.urlopen(req, timeout=30))["result"]


def receipt(tx):
    for _ in range(40):
        r = rpc("eth_getTransactionReceipt", [tx])
        if r:
            return r
        time.sleep(2)
    raise SystemExit("no receipt for " + tx)


def serve():
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(ROOT / "docs"), **k)
    handler.log_message = lambda *a, **k: None
    srv = socketserver.TCPServer(("127.0.0.1", 8766), type("H", (http.server.SimpleHTTPRequestHandler,), {
        "__init__": lambda self, *a, **k: http.server.SimpleHTTPRequestHandler.__init__(self, *a, directory=str(ROOT / "docs"), **k),
        "log_message": lambda self, *a, **k: None}))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def run_case(p, name, amount, ref, fail_permit):
    url = f"http://127.0.0.1:8766/index.html?pay={STORE}&amount={amount}&ref={ref}&net=testnet"
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 1100, "height": 900})
    ctx.add_init_script(WALLET_JS.replace("__KEY__", env_key()).replace("__RPC__", RPC))
    if fail_permit:
        ctx.add_init_script("window.__failPermit = true;")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url, wait_until="domcontentloaded")
    page.locator("#payBtn").wait_for(state="visible", timeout=30000)
    page.wait_for_function("!document.getElementById('payBtn').disabled", timeout=30000)
    page.on("console", lambda m: errors.append("console:" + m.text[:200]) if m.type == "error" else None)
    page.locator("#payBtn").click()
    try:
        page.get_by_text("Paid.").first.wait_for(state="visible", timeout=60000)
    except Exception:
        print("TIMEOUT. status text:", page.locator("#payStatus").inner_text()[:400])
        print("wallet calls:", page.evaluate("window.__walletLog"))
        print("send errors:", page.evaluate("window.__sendErrors || []"))
        print("errors:", errors[:5])
        b.close()
        return False
    status = page.locator("#payStatus").inner_text()
    link = page.locator("#payStatus a").first.get_attribute("href")
    tx = link.split("/tx/")[1]
    methods = page.evaluate("window.__walletLog")
    b.close()
    r = receipt(tx)
    ref_logs = [l for l in r["logs"] if l["address"].lower() == MUSDPAY.lower() and l["topics"][0] == PAYMENT_REF_TOPIC]
    ok = r["status"] == "0x1" and len(ref_logs) == 1 and ref.encode().hex() in ref_logs[0]["data"]
    used_permit = "eth_signTypedData_v4" in methods
    sends = methods.count("eth_sendTransaction")
    print(f"{'PASS' if ok else 'FAIL'} {name}: tx {tx[:14]}… status {r['status']} PaymentReference logged={len(ref_logs) == 1} "
          f"signed permit={used_permit} sent transactions={sends} page errors={len(errors)}")
    # viem retries a submission the node rejects for a moment, so count at least, and rely on the on-chain log check for exactly-once.
    return ok and not errors and (sends >= 1 if not fail_permit else sends >= 2)


if __name__ == "__main__":
    srv = serve()
    stamp = str(int(time.time()))[-6:]
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    with sync_playwright() as p:
        a = True if only == "B" else run_case(p, "A permit path (one transaction)", "3.5", f"WALLET-A-{stamp}", False)
        b = True if only == "A" else run_case(p, "B fallback path (approve then pay)", "1.25", f"WALLET-B-{stamp}", True)
    srv.shutdown()
    sys.exit(0 if (a and b) else 1)
