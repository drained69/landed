#!/usr/bin/env python3
"""Generate LANDED demo narration per slide with edge-tts, then measure durations."""
import asyncio, json, subprocess, sys
from pathlib import Path

VENV_PY = Path(__file__).parent / "venv" / "bin" / "python"  # create with: python3 -m venv tools/venv && tools/venv/bin/pip install edge-tts
OUT = Path("/Users/uba/projects/landed/video-output/assets/vo")
OUT.mkdir(parents=True, exist_ok=True)

SEGMENTS = [
  ("01-hook", "Your balance says five thousand twenty-four fifty. It says nothing about rent and internet due in days, the groceries this week, or the hundred thirty-four you promised to protect. A balance shows what you have. It never shows what is safe to use."),
  ("02-problem", "Most money apps stop there. They quote you, then forget what happened: a fee that doubled, a delivery that took a day, a salary late. And the same mistake repeats. LANDED replaces the number with an answer, and it learns from every outcome."),
  ("03-overview", "LANDED answers one question: what is safe to move right now? The next forty-five days are simulated in integer cents: every bill, every savings contribution, your spending pace, a buffer. Expected income stays out until it lands. Not five thousand. Not three hundred. One hundred thirty dollars."),
  ("04-plan", "She asks plainly: can I send three hundred to my sister today? LANDED simulates it against every obligation and every route."),
  ("05-answer", "The no-memory baseline says: send all three hundred today. With her confirmed lessons: one hundred fifty now, the rest after payday. Predicted buffer one fifty seventy-two. Shortfall risk eight percent. Confidence sixty-two."),
  ("06-why", "The counterfactual shows the identical snapshot with memory removed: three hundred today. Two lessons change the answer: cap the move at half of safe-to-move while rent is near, prefer the route that delivered last time. Every adjustment names its memory."),
  ("07-spend", "Between decisions, her rules keep working. Dining is thirty-two over the one twenty limit she set. The streaming bundle charged twenty-one ninety-nine against an approved eighteen. Every alert names the memory behind it, and none exists without your approval."),
  ("08-walrus", "Here is the memory. Confirmed lessons live on Walrus, Sui Mainnet; a write counts only when the relayer returns a blob ID. This ledger shows lesson, typed rule, blob, and the source decision. Restore from Walrus rebuilds it on a fresh device. The namespace follows the person."),
  ("09-track", "Outcomes grade the lessons that shaped advice. Held ones gain confidence. Failed ones lose influence and go to review. After a real miss, LANDED learned thirteen lessons; twenty now in force."),
  ("10-onchain", "Facts are verified, not claimed: Sui reads run through Tatum on Mainnet, rates come from its Data API, and digests are re-read server-side before anything is marked verified. Unconfigured means blocked, never fake."),
  ("11-close", "LANDED. Money that remembers."),
]

async def main():
    sys.path.insert(0, "")
    import edge_tts
    durs = {}
    for key, text in SEGMENTS:
        mp3 = OUT / f"{key}.mp3"
        voice = "en-US-AvaNeural"
        com = edge_tts.Communicate(text, voice, rate="-4%")
        await com.save(str(mp3))
        print("tts", key, "ok")
    for key, _ in SEGMENTS:
        p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(OUT / f"{key}.mp3")], capture_output=True, text=True)
        durs[key] = float(p.stdout.strip())
    print(json.dumps(durs, indent=1))
    print("TOTAL", round(sum(durs.values()), 2))
    (OUT / "durations.json").write_text(json.dumps(durs, indent=1))

asyncio.run(main())
