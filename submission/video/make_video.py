"""Builds the 2-minute pitch video for MUSD Books.

1. Narration segments are synthesised with edge-tts (a neural text-to-speech voice).
2. A headless browser records the live site (deck + app) on a timeline that follows the narration.
3. ffmpeg mixes the narration onto the recording and writes an H.264 MP4.

Usage: python make_video.py          (writes out/musdbooks-pitch.mp4)
The voice is synthetic and the video says so.
"""
import asyncio
import json
import pathlib
import subprocess
import sys
import time

import edge_tts
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)
ROOT = HERE.parent.parent  # musdbooks

SITE = "https://neimasilk.github.io/musd-books/"
DECK = SITE + "deck/"
STORE = SITE + "?account=0x21F5ae9d165a7E0EFDaf17A85c225713199eC439&from=16192210&to=16192312&net=testnet"
BORROWER = SITE + "?account=0x444156722777F12f29F789F04fe9EAA5e90B10a9&from=16192202&to=16192312&net=testnet"
CSV = ROOT / "docs" / "demo-store-statement.csv"

VOICE = "en-US-AndrewNeural"
W, H = 1280, 720

SEGMENTS = [
    ("s1", "MUSD Books gives MUSD users verifiable books: a statement that an accountant, a lender or a customer can check "
           "without trusting the sender. It is built for Track Two, access and distribution, and runs on Mezo testnet. "
           "The project was written by Claude, an AI, for its human owner, and this narration is a synthetic voice."),
    ("s2", "Mezo lets people borrow MUSD against Bitcoin instead of selling it, and MUSD can be used to pay and get paid. "
           "That creates a record keeping gap. Explorers show raw logs. A spreadsheet from one side proves nothing to the other. "
           "And a transfer carries no invoice number."),
    ("s3", "Here is a statement for a demo store on Mezo testnet. Every transfer is counted once, at full precision. "
           "Opening balance plus money in, minus money out, equals the on-chain balance exactly, and the app says so. "
           "The payments carry invoice references, and the payment to a supplier carries a purchase order number."),
    ("s4", "The statement is a deterministic file. Its hash is anchored in a registry contract. This one is anchored twice: "
           "once by the store, and once by the accountant."),
    ("s5", "Anyone can verify a file. Drop it in here, and the app re-derives the whole statement from public chain data, "
           "then compares it with the file, line by line. It takes a few seconds. And the answer is: identical."),
    ("s6", "It understands Mezo. When a Trove owner draws a loan, the new MUSD shows as a mint. Repayments show as burns. "
           "This is a real Trove on testnet: two thousand MUSD borrowed, and one hundred fifty repaid."),
    ("s7", "Payments go through MusdPay. It moves MUSD straight from the payer to the merchant, records the reference right after "
           "the token's own transfer, and with MUSD's permit support, it takes a single transaction. No custody, no owner, no fees."),
    ("s8", "Everything is open source and tested against real Mezo data. In wave two, I will bring it to mainnet, with an "
           "accountant co-signing flow. Thank you."),
]
LEAD = 2.6   # seconds of picture before the first word
GAP = 0.9    # seconds of breathing room after each segment


def ffprobe_duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(json.loads(out)["format"]["duration"])


async def synth_all():
    for sid, text in SEGMENTS:
        p = OUT / f"{sid}.mp3"
        if not p.exists():
            await edge_tts.Communicate(text, VOICE, rate="-4%").save(str(p))


def plan():
    t, starts, durs = LEAD, [], []
    for sid, _ in SEGMENTS:
        d = ffprobe_duration(OUT / f"{sid}.mp3")
        starts.append(t)
        durs.append(d)
        t += d + GAP
    return starts, durs, t


def record(starts, durs, total):
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": W, "height": H}, record_video_dir=str(OUT / "raw"),
                            record_video_size={"width": W, "height": H}, device_scale_factor=1)
        page = ctx.new_page()
        t0 = time.time()

        def wait_until(sec):
            d = t0 + sec - time.time()
            if d > 0:
                time.sleep(d)
            else:
                print(f"  (late by {-d:.1f}s)")

        def scroll_to(y, ms=1500):
            page.evaluate("""([y, ms]) => new Promise((res) => {
                const y0 = window.scrollY, t0 = performance.now();
                const ease = (t) => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
                const step = (now) => { const k = Math.min(1, (now - t0) / ms); window.scrollTo(0, y0 + (y - y0) * ease(k)); k < 1 ? requestAnimationFrame(step) : res(); };
                requestAnimationFrame(step); })""", [y, ms])

        def scroll_el(sel, ms=1500, offset=80):
            y = page.evaluate("(s) => document.querySelector(s).getBoundingClientRect().top + window.scrollY", sel)
            scroll_to(max(0, y - offset), ms)

        def zoom(z=1.18):
            page.evaluate(f"document.documentElement.style.zoom='{z}'")

        def goto_app(url, ready_text):
            page.goto(url, wait_until="domcontentloaded")
            zoom()
            page.get_by_text(ready_text).first.wait_for(state="visible", timeout=45000)

        # s1: deck title
        page.goto(DECK, wait_until="load")
        wait_until(starts[0] - 0.2)
        # s2: problem slide
        wait_until(starts[1]); scroll_to(H * 1, 1400)
        # s3: store statement
        wait_until(starts[2] - 0.0)
        goto_app(STORE, "Fully reconciled")
        wait_until(starts[2] + 6.0); scroll_to(430, 1800)
        wait_until(starts[2] + durs[2] - 7.5); scroll_el("#rows", 2200, 140)
        # s4: anchors
        wait_until(starts[3]); scroll_el("#existingAnchors", 1600, 300)
        page.get_by_text("Anchored 2").first.wait_for(state="visible", timeout=30000)
        # s5: verify
        wait_until(starts[4]); scroll_to(0, 700)
        page.locator('button[data-tab="verify"]').click()
        time.sleep(0.8)
        page.locator("#verifyFile").set_input_files(str(CSV))
        time.sleep(1.2)
        page.locator("#rederiveBtn").click()
        page.get_by_text("Identical").first.wait_for(state="visible", timeout=45000)
        # s6: borrower statement
        wait_until(starts[5])
        goto_app(BORROWER, "Fully reconciled")
        wait_until(starts[5] + 4.5); scroll_to(430, 1500)
        wait_until(starts[5] + 9.0); scroll_el("#rows", 2200, 140)
        # s7: deck architecture + integration
        wait_until(starts[6])
        page.goto(DECK, wait_until="load")
        scroll_to(H * 3, 900)
        wait_until(starts[6] + durs[6] * 0.55); scroll_to(H * 4, 1200)
        # s8: live numbers + wave 2
        wait_until(starts[7]); scroll_to(H * 5, 1200)
        wait_until(starts[7] + durs[7] * 0.6); scroll_to(H * 7, 1500)
        wait_until(total)
        vid = page.video.path()
        ctx.close()
        b.close()
        return vid


def mux(video, starts):
    inputs, filt = [], []
    for i, (sid, _) in enumerate(SEGMENTS):
        inputs += ["-i", str(OUT / f"{sid}.mp3")]
        ms = int(starts[i] * 1000)
        filt.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(SEGMENTS)))
    filt.append(f"{mix}amix=inputs={len(SEGMENTS)}:normalize=0[aout]")
    wav = OUT / "narration.wav"
    subprocess.run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filt), "-map", "[aout]", "-ar", "44100", str(wav)],
                   check=True, capture_output=True)
    mp4 = OUT / "musdbooks-pitch.mp4"
    subprocess.run(["ffmpeg", "-y", "-i", str(video), "-i", str(wav), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "21",
                    "-r", "30", "-c:a", "aac", "-b:a", "160k", "-shortest", str(mp4)], check=True, capture_output=True)
    return mp4


if __name__ == "__main__":
    asyncio.run(synth_all())
    starts, durs, total = plan()
    print("segments:", [f"{d:.1f}s" for d in durs], "total", f"{total:.1f}s")
    if "--plan-only" in sys.argv:
        sys.exit(0)
    vid = record(starts, durs, total)
    print("recorded", vid)
    print("wrote", mux(vid, starts))
