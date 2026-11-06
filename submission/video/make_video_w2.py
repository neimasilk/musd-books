"""Builds the Wave 2 pitch video for MUSD Books (in-app Mezo actions, Trove panel fixes, business model).

Same pipeline as make_video_v2.py (edge-tts narration, headless browser recording, ffmpeg mux), with two differences:
- the app is driven by the scripted EIP-1193 wallet from test/wallet_flow_test.py (testnet-only demo key read from
  D:\\cariuang\\.env, never printed), so the recording shows real Mezo Testnet transactions sent from the page;
- the timeline is dynamic: each narration segment starts when its picture is ready (for example after a transaction
  is confirmed), and the audio is placed at the recorded times.
The voice is synthetic and the video says so.

Usage: python make_video_w2.py [--plan-only | --remux]      (writes out3/musdbooks-pitch-w2.mp4)
"""
import asyncio
import http.server
import json
import pathlib
import socketserver
import subprocess
import sys
import threading
import time

import edge_tts
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out3"
OUT.mkdir(exist_ok=True)
ROOT = HERE.parent.parent  # musdbooks
sys.path.insert(0, str(ROOT / "test"))
from wallet_flow_test import WALLET_JS, env_key, RPC  # noqa: E402

PORT = 8771
BASE = f"http://127.0.0.1:{PORT}/"
DECK = BASE + "deck/index.html"
OWNER = "0x444156722777F12f29F789F04fe9EAA5e90B10a9"
BORROWER = BASE + f"index.html?account={OWNER}&from=16192202&to=16192312&net=testnet"

VOICE = "en-US-AndrewNeural"
W, H = 1280, 720

SEGMENTS = [
    ("w1", "MUSD Books gives MUSD users verifiable books: a statement an accountant, a lender or a customer can check "
           "without trusting the sender. This is the Wave 2 update. It runs on Mezo testnet, and it was written by Claude, "
           "an AI, for its human owner. The voice is synthetic."),
    ("w2", "Here is a borrower's statement, reconciled to the chain. Next to it is the live Trove: collateral, debt with "
           "interest, the collateral ratio and the liquidation price. Wave 1 counted pending rewards twice. That is fixed, "
           "and the card now shows the system's total collateral ratio and its mode."),
    ("w3", "New in this wave, the owner can act on Mezo right from the statement. Type an amount to repay, and the preview "
           "shows the new debt, ratio and liquidation price before anything is signed. Ask for more than the protocol allows, "
           "and it is refused before it reaches the wallet. A valid repayment goes to BorrowerOperations, with list hints "
           "from HintHelpers and SortedTroves."),
    ("w4", "Confirmed on Mezo testnet, with the transaction link right there."),
    ("w5", "Adding Bitcoin collateral works the same way. And the Stability Pool is on the same page: here, one MUSD goes in "
           "through provideToSP."),
    ("w6", "Every one of these flows is tested with a scripted wallet against the real Mezo contracts, and checked onchain "
           "afterwards. The registry and MusdPay are verified on the explorer, and version two adds a reentrancy lock, "
           "with twenty eight Foundry tests."),
    ("w7", "The contracts stay free and ownerless, so a statement never depends on trusting us. Revenue comes from the "
           "tools around them: an accountant workspace and merchant tooling, paid in MUSD through MusdPay. Honest status: "
           "there are no outside users yet. A first bookkeeper piloting the workspace is the next milestone. Thank you."),
]
LEAD = 2.4
GAP = 0.8


def ffprobe_duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(json.loads(out)["format"]["duration"])


async def synth_all():
    for sid, text in SEGMENTS:
        p = OUT / f"{sid}.mp3"
        if not p.exists():
            await edge_tts.Communicate(text, VOICE, rate="-4%").save(str(p))


def serve():
    handler = type("H", (http.server.SimpleHTTPRequestHandler,), {
        "__init__": lambda self, *a, **k: http.server.SimpleHTTPRequestHandler.__init__(self, *a, directory=str(ROOT / "docs"), **k),
        "log_message": lambda self, *a, **k: None})
    srv = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def record(durs):
    starts = [None] * len(SEGMENTS)
    state = {"cursor": LEAD}
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": W, "height": H}, record_video_dir=str(OUT / "raw"),
                            record_video_size={"width": W, "height": H}, device_scale_factor=1)
        ctx.add_init_script(WALLET_JS.replace("__KEY__", env_key()).replace("__RPC__", RPC))
        page = ctx.new_page()
        t0 = time.time()

        def now():
            return time.time() - t0

        def start(i):
            """Start segment i when its picture is ready, but never before the previous segment has finished."""
            n = now()
            if n < state["cursor"]:
                time.sleep(state["cursor"] - n)
                n = state["cursor"]
            starts[i] = n
            state["cursor"] = n + durs[i] + GAP
            print(f"  {SEGMENTS[i][0]} at {n:.1f}s")

        def at(i, offset):
            d = starts[i] + offset - now()
            if d > 0:
                time.sleep(d)

        def scroll_to(y, ms=1500):
            page.evaluate("""([y, ms]) => new Promise((res) => {
                const y0 = window.scrollY, t0 = performance.now();
                const ease = (t) => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
                const step = (now) => { const k = Math.min(1, (now - t0) / ms); window.scrollTo(0, y0 + (y - y0) * ease(k)); k < 1 ? requestAnimationFrame(step) : res(); };
                requestAnimationFrame(step); })""", [y, ms])

        def scroll_el(sel, ms=1500, offset=80):
            y = page.evaluate("(s) => document.querySelector(s).getBoundingClientRect().top + window.scrollY", sel)
            scroll_to(max(0, y - offset), ms)

        def scroll_h2(text, ms=1200, offset=30):
            y = page.evaluate("""(t) => { const h = Array.from(document.querySelectorAll('h2')).find((e) => e.textContent.includes(t));
                return h.getBoundingClientRect().top + window.scrollY; }""", text)
            scroll_to(max(0, y - offset), ms)

        def wait_status(status_id, timeout=180000):
            page.wait_for_function(
                f"() => /Done in|reverted|Error|At most|holds|no Trove|no Stability/.test(document.getElementById('{status_id}').innerText)",
                timeout=timeout)
            text = page.locator(f"#{status_id}").inner_text()
            if "Done in" not in text:
                raise SystemExit(f"action failed: {text[:200]} | {page.evaluate('window.__sendErrors || []')}")

        # w1: deck title
        page.goto(DECK, wait_until="load")
        start(0)

        # w2: borrower statement, then the Trove card (wallet connected as the Trove owner)
        page.goto(BORROWER, wait_until="domcontentloaded")
        page.evaluate("document.documentElement.style.zoom='1.18'")
        page.get_by_text("Fully reconciled").first.wait_for(state="visible", timeout=90000)
        page.wait_for_selector("#troveActions:not(.hidden)", timeout=120000)
        page.wait_for_selector("#poolBox:not(.hidden)", timeout=60000)
        start(1)
        at(1, 5.0); scroll_el("#troveBox", 1800, 100)
        at(1, durs[1] - 6.0); scroll_el("#troveSystem", 1400, 260)

        # w3: preview, guard rail, then a valid repayment
        start(2)
        scroll_el("#troveActions", 1400, 160)
        at(2, 6.0); page.type("#repayAmt", "1", delay=150)
        at(2, 13.0); page.fill("#repayAmt", "100000")
        at(2, 15.0); page.click("#repayBtn")
        page.wait_for_function("() => /At most/.test(document.getElementById('troveActStatus').innerText)", timeout=60000)
        at(2, 20.5); page.fill("#repayAmt", "")
        page.evaluate("document.getElementById('troveActStatus').innerHTML = ''")
        page.type("#repayAmt", "1", delay=150)
        at(2, durs[2] - 2.0); page.click("#repayBtn")
        wait_status("troveActStatus")

        # w4: confirmation with the transaction link
        start(3)
        scroll_el("#troveActStatus", 900, 300)

        # w5: Stability Pool deposit
        start(4)
        scroll_el("#poolBox", 1500, 100)
        at(4, durs[4] * 0.5); page.type("#spAmt", "1", delay=150)
        at(4, durs[4] - 1.0); page.click("#spDepositBtn")
        wait_status("poolActStatus")
        scroll_el("#poolActStatus", 900, 300)

        # w6: deck slide for Wave 2
        page.goto(DECK, wait_until="load")
        page.wait_for_selector("h2:has-text('Wave 2: act on Mezo')")
        scroll_h2("Wave 2: act on Mezo", 10)
        start(5)

        # w7: business model and honest status
        at(5, durs[5] - 1.0)
        scroll_h2("Business model and honest status", 1400)
        start(6)
        time.sleep(max(0, state["cursor"] + 1.0 - now()))
        vid = page.video.path()
        ctx.close()
        b.close()
        return vid, starts


def cuts_for(starts, durs, keep_head=3.5, keep_tail=1.5):
    """Idle stretches while a transaction confirms: keep a few seconds at each end, cut the middle."""
    out = []
    for i in range(len(SEGMENTS) - 1):
        idle_from = starts[i] + durs[i] + GAP
        if starts[i + 1] - idle_from > keep_head + keep_tail + 1.0:
            out.append((idle_from + keep_head, starts[i + 1] - keep_tail))
    return out


def mux(video, starts, durs):
    cuts = cuts_for(starts, durs)
    keep, t = [], 0.0
    for a, b in cuts:
        keep.append((t, a))
        t = b
    keep.append((t, None))
    shifted = [s - sum(b - a for a, b in cuts if b <= s) for s in starts]
    print("cuts:", [f"{a:.1f}-{b:.1f}" for a, b in cuts], "-> starts", [f"{s:.1f}" for s in shifted])

    vf = []
    for k, (a, b) in enumerate(keep):
        rng = f"start={a:.3f}" + (f":end={b:.3f}" if b is not None else "")
        vf.append(f"[0:v]trim={rng},setpts=PTS-STARTPTS[v{k}]")
    vf.append("".join(f"[v{k}]" for k in range(len(keep))) + f"concat=n={len(keep)}:v=1:a=0[vout]")
    cut_mp4 = OUT / "video-cut.mp4"
    subprocess.run(["ffmpeg", "-y", "-i", str(video), "-filter_complex", ";".join(vf), "-map", "[vout]", "-r", "30",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "21", str(cut_mp4)], check=True, capture_output=True)

    inputs, filt = [], []
    for i, (sid, _) in enumerate(SEGMENTS):
        inputs += ["-i", str(OUT / f"{sid}.mp3")]
        ms = int(shifted[i] * 1000)
        filt.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(SEGMENTS)))
    filt.append(f"{mix}amix=inputs={len(SEGMENTS)}:normalize=0[aout]")
    wav = OUT / "narration.wav"
    subprocess.run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filt), "-map", "[aout]", "-ar", "44100", str(wav)],
                   check=True, capture_output=True)
    mp4 = OUT / "musdbooks-pitch-w2.mp4"
    subprocess.run(["ffmpeg", "-y", "-i", str(cut_mp4), "-i", str(wav), "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                    "-shortest", str(mp4)], check=True, capture_output=True)
    return mp4


if __name__ == "__main__":
    asyncio.run(synth_all())
    durs = [ffprobe_duration(OUT / f"{sid}.mp3") for sid, _ in SEGMENTS]
    print("segments:", [f"{d:.1f}s" for d in durs], "narration total", f"{sum(durs) + GAP * len(durs) + LEAD:.1f}s")
    if "--plan-only" in sys.argv:
        sys.exit(0)
    if "--remux" in sys.argv:  # reuse the last recording
        meta = json.loads((OUT / "recording.json").read_text())
        print("wrote", mux(pathlib.Path(meta["video"]), meta["starts"], durs))
        sys.exit(0)
    srv = serve()
    try:
        vid, starts = record(durs)
    finally:
        srv.shutdown()
    (OUT / "recording.json").write_text(json.dumps({"video": str(vid), "starts": starts}))
    print("recorded", vid)
    print("wrote", mux(vid, starts, durs))
