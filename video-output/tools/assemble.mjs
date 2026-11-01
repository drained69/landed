#!/usr/bin/env node
/*
 LANDED demo assembler.
 Builds both finals from rendered slide PNGs + edge-tts narration segments.

 Timing model
   video slide k duration  D_k = lead + tts_k + tail   (close gets a long hold)
   transitions             crossfade 0.5s chained via xfade
   audio segment length    L_k = D_k - 0.5             (crossfade eats 0.5)
   narration starts        0.4s into its segment
   audio finalization      loudnorm I=-16 TP=-1.5 LRA=11
*/
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { execFileSync } from "child_process";

const ROOT = "/Users/uba/projects/landed/video-output";
const VO = `${ROOT}/assets/vo`;
const MANIFEST = `${ROOT}/assets/deck-manifest.json`;
const OUT = `${ROOT}`;
const TTS = JSON.parse(readFileSync(`${VO}/durations.json`, "utf8"));
const KEYS = Object.keys(TTS); // 01-hook ... 11-close in order

const CROSS = 0.5;
const N = KEYS.length;
const D = KEYS.map((k, i) => {
  const tts = TTS[k];
  if (i === 0) return 0.65 + tts + 0.55;      // open breathe
  if (i === N - 1) return 0.4 + tts + 5.0;    // closing hold
  return 0.3 + tts + 0.55;
});
const OFFSETS = [];
let acc = 0;
for (let i = 0; i < N; i++) {
  acc += D[i];
  OFFSETS.push(acc - CROSS * (i + 1)); // xfade offset for transition ending slide i (0-based)
}
const TOTAL = acc - CROSS * (N - 1);
console.log("total video:", TOTAL.toFixed(2), "s");

const VARIANTS = [
  { name: "LANDED-demo-wide-final.mp4", slides: `${ROOT}/assets/slides`, w: 1920, h: 1080 },
  { name: "LANDED-demo-vertical-final.mp4", slides: `${ROOT}/assets/slides-v`, w: 1080, h: 1920 },
];

function run(args) {
  execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
}

for (const v of VARIANTS) {
  const tmpVideo = `${OUT}/.tmp-${v.name}`;
  const audioList = [];

  /* --- audio segments --- */
  for (let i = 0; i < N; i++) {
    const L = i === N - 1 ? D[i] : D[i] - CROSS;
    const seg = `${OUT}/.seg-${i}.wav`;
    run([
      "-y", "-i", `${VO}/${KEYS[i]}.mp3`,
      "-af", "aresample=44100,aformat=channel_layouts=stereo,adelay=400|400,apad",
      "-t", String(L), seg,
    ]);
    audioList.push(`file '${seg}'`);
  }
  const listFile = `${OUT}/.audio-list.txt`;
  writeFileSync(listFile, audioList.join("\n") + "\n");
  const narration = `${OUT}/.narration-${v.w}.wav`;
  run(["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", narration]);

  /* --- video with chained crossfades + narration mux --- */
  const inputs = [];
  for (let i = 0; i < N; i++) {
    inputs.push("-loop", "1", "-framerate", "30", "-t", String(D[i]), "-i", `${v.slides}/${KEYS[i]}.png`);
  }
  const filters = [];
  const chains = [];
  for (let i = 0; i < N; i++) {
    filters.push(`[${i}:v]scale=${v.w}:${v.h},setsar=1,format=yuv420p,framerate=fps=30[v${i}]`);
  }
  let prev = "v0";
  for (let i = 1; i < N; i++) {
    const out = `x${i}`;
    filters.push(`[${prev}][v${i}]xfade=transition=fade:duration=${CROSS}:offset=${OFFSETS[i - 1].toFixed(3)}[${out}]`);
    prev = out;
  }
  filters.push(`[${prev}]tpad=stop_duration=0.6:stop_mode=clone[xfinal]`);
  filters.push(`[${N}:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[afinal]`);
  // note: audio input is index N (after the N video inputs)
  run([
    "-y",
    ...inputs,
    "-i", narration,
    "-filter_complex", filters.join(";"),
    "-map", "[xfinal]", "-map", "[afinal]",
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-r", "30", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    "-t", String(TOTAL + 0.6),
    tmpVideo,
  ]);
  const final = `${OUT}/${v.name}`;
  rmSync(final, { force: true });
  execFileSync("mv", [tmpVideo, final]);
  console.log("built", final);
}
console.log("assemble done");
