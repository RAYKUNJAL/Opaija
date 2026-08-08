import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type Word = {
  word: string;
  startMs: number;
  endMs: number;
};

export type Alignment = {
  words: Word[];
};

export type GetAlignmentOptions = {
  sourceText?: string;
};

export type CharacterAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

/**
 * Resolve a word-level alignment for an audio file.
 *
 * Strategy (in order):
 *   1. Sidecar `<audioPath>.alignment.json` written by voice.ts (free — ElevenLabs)
 *   2. OpenAI Whisper API (requires OPENAI_API_KEY)
 *   3. Synthetic 1-word/sec timing derived from sourceText
 */
export async function getAlignment(
  audioPath: string,
  options: GetAlignmentOptions = {},
): Promise<Alignment> {
  const sidecar = await loadSidecarAlignment(audioPath);
  if (sidecar) return sidecar;

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      return await transcribeWithWhisper(audioPath, apiKey);
    } catch (err) {
      console.warn(`[captions] Whisper transcription failed, falling back: ${(err as Error).message}`);
    }
  }

  return syntheticAlignment(options.sourceText ?? "");
}

async function loadSidecarAlignment(audioPath: string): Promise<Alignment | null> {
  const sidecarPath = `${audioPath}.alignment.json`;
  try {
    await stat(sidecarPath);
  } catch {
    return null;
  }
  try {
    const raw = await readFile(sidecarPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.words)) {
      return { words: parsed.words as Word[] };
    }
    if (parsed?.characters && parsed?.character_start_times_seconds) {
      return { words: characterAlignmentToWords(parsed as CharacterAlignment) };
    }
    return null;
  } catch (err) {
    console.warn(`[captions] Failed to read sidecar ${sidecarPath}: ${(err as Error).message}`);
    return null;
  }
}

async function transcribeWithWhisper(audioPath: string, apiKey: string): Promise<Alignment> {
  const buffer = await readFile(audioPath);
  const fileName = path.basename(audioPath);
  const blob = new Blob([buffer], { type: "audio/mpeg" });

  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("model", process.env.WHISPER_MODEL ?? "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Whisper failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { words?: Array<{ word: string; start: number; end: number }> };
  const words = (data.words ?? []).map((w) => ({
    word: w.word,
    startMs: Math.round(w.start * 1000),
    endMs: Math.round(w.end * 1000),
  }));

  return { words };
}

function syntheticAlignment(sourceText: string): Alignment {
  const tokens = sourceText.split(/\s+/).filter(Boolean);
  if (!tokens.length) return { words: [] };
  const wordDurationMs = 1000;
  const words: Word[] = tokens.map((token, idx) => ({
    word: token,
    startMs: idx * wordDurationMs,
    endMs: (idx + 1) * wordDurationMs,
  }));
  return { words };
}

/**
 * Convert ElevenLabs character-level alignment into word-level timing.
 * Words are split on whitespace; punctuation stays attached to its word.
 */
export function characterAlignmentToWords(alignment: CharacterAlignment): Word[] {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
  const words: Word[] = [];

  let buffer = "";
  let bufferStart: number | null = null;
  let bufferEnd: number | null = null;

  const flush = () => {
    if (buffer && bufferStart !== null && bufferEnd !== null) {
      words.push({
        word: buffer,
        startMs: Math.round(bufferStart * 1000),
        endMs: Math.round(bufferEnd * 1000),
      });
    }
    buffer = "";
    bufferStart = null;
    bufferEnd = null;
  };

  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    const start = character_start_times_seconds[i] ?? 0;
    const end = character_end_times_seconds[i] ?? start;

    if (/\s/.test(ch)) {
      flush();
      continue;
    }

    if (bufferStart === null) bufferStart = start;
    bufferEnd = end;
    buffer += ch;
  }
  flush();

  return words;
}

/**
 * Format an Alignment as SRT subtitles.
 * Defaults to 2 words per cue for TikTok-style word-burst captions.
 */
export function toSrt(alignment: Alignment, options: { maxWordsPerCue?: number } = {}): string {
  const max = Math.max(1, options.maxWordsPerCue ?? 2);
  const cues: Array<{ index: number; startMs: number; endMs: number; text: string }> = [];

  for (let i = 0, idx = 1; i < alignment.words.length; i += max, idx++) {
    const chunk = alignment.words.slice(i, i + max);
    if (!chunk.length) continue;
    cues.push({
      index: idx,
      startMs: chunk[0].startMs,
      endMs: chunk[chunk.length - 1].endMs,
      text: chunk.map((w) => w.word).join(" "),
    });
  }

  return cues
    .map((cue) => `${cue.index}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${cue.text}\n`)
    .join("\n");
}

/**
 * Convert an Alignment to Remotion-friendly cues (millisecond timing).
 */
export function toRemotionCaptions(alignment: Alignment): Array<{ from: number; to: number; text: string }> {
  return alignment.words.map((w) => ({
    from: w.startMs,
    to: w.endMs,
    text: w.word,
  }));
}

function formatSrtTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return (
    `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`
  );
}

function pad(value: number, length: number): string {
  return value.toString().padStart(length, "0");
}
