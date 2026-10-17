"""Builds the updated 2-minute pitch video for MUSD Books (version 2, covers what was added during Wave 1).

Same pipeline as make_video.py: edge-tts narration, a headless browser recording of the live site on a timeline that
follows the narration, and ffmpeg to mix the audio into an H.264 MP4. The voice is synthetic and the video says so.

Usage: python make_video_v2.py [--plan-only]      (writes out/musdbooks-pitch-v2.mp4)
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
OUT = HERE / "out2"
OUT.mkdir(exist_ok=True)
ROOT = HERE.parent.parent  # musdbooks

SITE = "https://neimasilk.github.io/musd-books/"
DECK = SITE + "deck/"
STORE_ACCT = "0x21F5ae9d165a7E0EFDaf17A85c225713199eC439"
STORE = SITE + f"?account={STORE_ACCT}&from=16192210&to=16192312&net=testnet"
BORROWER = SITE + "?account=0x444156722777F12f29F789F04fe9EAA5e90B10a9&from=16192202&to=16192312&net=testnet"

VOICE = "en-US-AndrewNeural"
W, H = 1280, 720

SEGMENTS = [
    ("v1", "MUSD Books gives MUSD users verifiable books: a statement an accountant, a lender or a customer can check "
           "without trusting the sender. It runs on Mezo testnet. Written by Claude, an AI, for its human owner. "
           "The voice is synthetic."),
    ("v2", "Here is a store's statement. Every transfer is counted once, at full precision, and opening plus in, minus out, "
           "equals the on-chain balance exactly. Payments carry invoice references, recorded by MusdPay right after "
           "the token's own transfer."),
    ("v3", "New: the accountant review link. The statement hash travels in a link. The accountant's browser re-derives the "
           "statement from chain data and reports: independent check passed. Change one digit and it reports a mismatch. "
           "One click co-attests it in the registry."),
    ("v4", "It reads Mezo itself. For a borrower it shows the live Trove: collateral, debt with interest, the collateral "
           "ratio, and how far Bitcoin must fall before liquidation. And the Stability Pool position: deposit, share of "
           "the pool, and pending Bitcoin gain. A real Trove and a real deposit, on testnet."),
    ("v5", "A lender gets a Markdown report with all of it. A merchant gets a pay with MUSD button for any website, as plain "
           "HTML or one script."),
    ("v6", "It is tested: twenty seven Foundry tests with fuzz and invariant suites, a scripted wallet test of the pay page, "
           "and live tests against Mezo. Slither finds nothing high or medium, and the security notes list every finding."),
    ("v7", "Next, wave two: mainnet deployment, after review and the owner's approval. Thank you."),
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

        # v1: deck title
        page.goto(DECK, wait_until="load")
        wait_until(starts[0] - 0.2)

        # v2: the store's statement
        wait_until(starts[1])
        goto_app(STORE, "Fully reconciled")
        page.wait_for_selector("#resHash:not(:empty)", timeout=60000)
        stmt_hash = page.inner_text("#resHash").strip()
        wait_until(starts[1] + 5.5); scroll_to(430, 1800)
        wait_until(starts[1] + durs[1] - 6.5); scroll_el("#rows", 2200, 140)

        # v3: accountant review link (hash travels in the link; independent check passes)
        wait_until(starts[2])
        goto_app(STORE + f"&expect={stmt_hash}", "Fully reconciled")
        page.wait_for_selector("#reviewBanner .notice", timeout=120000)
        scroll_to(0, 400)
        wait_until(starts[2] + durs[2] - 6.0); scroll_el("#shareReview", 1800, 260)

        # v4: borrower with Trove and Stability Pool panels
        wait_until(starts[3])
        goto_app(BORROWER, "Fully reconciled")
        page.wait_for_selector("#troveBox:not(.hidden)", timeout=60000)
        page.wait_for_selector("#poolBox:not(.hidden)", timeout=60000)
        wait_until(starts[3] + 4.0); scroll_el("#troveBox", 1800, 120)
        wait_until(starts[3] + durs[3] * 0.55); scroll_el("#poolBox", 1800, 120)

        # v5: lender report button, then the merchant kit on the Request tab
        wait_until(starts[4]); scroll_el("#dlLender", 1400, 260)
        wait_until(starts[4] + durs[4] * 0.45)
        page.goto(SITE + "?net=testnet", wait_until="domcontentloaded"); zoom()
        page.locator('button[data-tab="request"]').click()
        page.fill("#reqTo", STORE_ACCT)
        page.fill("#reqAmount", "25.00")
        page.fill("#reqRef", "INV-2026-0042")
        page.click("#reqBtn")
        page.wait_for_selector("#embedKit #embedScript", timeout=30000)
        scroll_el("#embedKit", 1400, 120)

        # v6: the deck's "since the first submission" slide
        wait_until(starts[5])
        page.goto(DECK, wait_until="load")
        page.wait_for_selector("h2:has-text('Since the first submission')")
        scroll_el("h2:has-text('Since the first submission')", 1200, 30)

        # v7: close on the live numbers slide
        wait_until(starts[6])
        scroll_el("h2:has-text('Live on Mezo Testnet')", 1200, 30)
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
    mp4 = OUT / "musdbooks-pitch-v2.mp4"
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
