/**
 * scripts/compute-timings.ts — word-level beat timing engine
 *
 * Ports two pieces of Cole Medin's hyperframes-ai-video-generation pipeline:
 *
 *   1. clean_sync_data (tts_lib.py) — strips phantom-punctuation "words"
 *      and SSML-tag fragments out of the ElevenLabs alignment, fixing the
 *      one-word-offset drift Cole's pipeline hit when downstream code
 *      counted script tokens against transcript words.
 *
 *   2. compute_timings.py — given the cleaned word list and the parsed
 *      narration beats (each beat is a slice of the script), figure out
 *      each beat's TRUE startSec / endSec / durSec from where its words
 *      actually land in the audio — instead of the even-split estimate
 *      stage-1 (parse) writes.
 *
 * Used by produce.ts stage-2b (sync). If the alignment sidecar is missing
 * (older narration), the orchestrator falls back to the static even-split
 * timings already in parsed.json — see produce.ts for the guard.
 */

import type { Beat, ParsedScript } from "./produce.js";

// ---------- types ----------

/**
 * Matches ElevenLabs' `normalized_alignment` (and `alignment`) shape.
 * The character_*_times_seconds arrays are 1:1 with `characters`.
 *
 * Some ElevenLabs response variants also surface a top-level word array;
 * we keep the optional `words` field for forward-compat but the porting
 * logic builds words from the character-level data, matching tts_lib.py.
 */
export type ElevenLabsAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
  words?: Array<{ word: string; start: number; end: number }>;
};

/** Cleaned word with its start/end timestamps in seconds. */
export type CleanWord = {
  word: string;
  start: number;
  end: number;
};

// === Naming === plural alias matches the brief's `CleanWords[]` signature
// while singular `CleanWord` reads better at call sites.
export type CleanWords = CleanWord;

/**
 * A beat enriched with the actual sub-second window its narration occupies
 * in the rendered audio. `durSec` is recomputed (endSec - startSec) so
 * downstream stages don't need to know the math.
 */
export type TimedBeat = ParsedScript["beats"][number] & {
  startSec: number;
  endSec: number;
  durSec: number;
  /** First word index (into the cleaned word list) that belongs to this beat. */
  narrationStartWordIdx: number;
  /** Last word index (inclusive) that belongs to this beat. */
  narrationEndWordIdx: number;
};

/** Same shape as produce.ts's `Beat`, surfaced here for callers. */
export type ParsedBeat = Beat;

// ---------- regexes (ported from tts_lib.py / compute_timings.py) ----------

const BREAK_TAG_RE = /<break[^>]*>?/gi;
const TIME_ATTR_RE = /time="[^"]*"\s*\/?>/g;
const SELF_CLOSE_RE = /\/>/g;
const LETTER_OR_DIGIT_RE = /[A-Za-z0-9]/;
// Strip leading/trailing punctuation when matching beat text against the
// transcript — punctuation in the script (commas, periods, em-dashes) does
// NOT have its own timestamp.
const EDGE_PUNCT_RE = /^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g;

// ---------- clean_sync_data ----------

/**
 * Build a per-word list from an ElevenLabs `normalized_alignment` payload
 * and strip phantom punctuation. Mirrors tts_lib.clean_sync_data plus the
 * character-level word assembly from generate_chunk in tts_lib.py.
 *
 * Fixes the same three problems Cole's pipeline hit:
 *   1. SSML fragments leaking into the word stream ("<break", 'time="0.4s"/>').
 *   2. Punctuation-only "words" inflating the count and shifting beat
 *      boundaries by one.
 *   3. End-times that overlap the next word's start (causes scrub overlap).
 */
export function cleanSyncData(alignment: ElevenLabsAlignment): CleanWord[] {
  // Prefer a pre-built word array if the caller supplied one (some ElevenLabs
  // response variants include it). Otherwise assemble from characters[].
  const rawWords: Array<{ word: string; start: number; end: number }> =
    alignment.words && alignment.words.length > 0
      ? alignment.words.map((w) => ({ word: w.word, start: w.start, end: w.end }))
      : assembleWordsFromCharacters(alignment);

  const cleaned: CleanWord[] = [];
  for (const entry of rawWords) {
    let word = entry.word ?? "";
    word = word.replace(BREAK_TAG_RE, "");
    word = word.replace(TIME_ATTR_RE, "");
    word = word.replace(SELF_CLOSE_RE, "");
    word = word.trim().replace(/\n/g, "");
    if (!word) continue;
    // Skip standalone punctuation "words" — tts_lib.py does the same.
    if (!LETTER_OR_DIGIT_RE.test(word)) continue;
    cleaned.push({
      word,
      start: Number(entry.start),
      end: Number(entry.end),
    });
  }

  // Tighten end times so word N never overlaps word N+1. Mirrors the second
  // pass in clean_sync_data (and the same correction in merge_chunk_syncs).
  for (let i = 0; i < cleaned.length - 1; i++) {
    if (cleaned[i].end > cleaned[i + 1].start) {
      cleaned[i].end = cleaned[i + 1].start;
    }
  }

  // Ensure leading/trailing punctuation that ElevenLabs may have collapsed
  // into a neighbour didn't leave us with a word that's just edge punct.
  // (Defensive — the LETTER_OR_DIGIT_RE filter above already drops them.)
  return cleaned;
}

/**
 * Walk the character-level alignment and group runs of non-whitespace into
 * words, taking the first character's start and the last character's end.
 * Matches the assembly loop inside tts_lib.generate_chunk.
 */
function assembleWordsFromCharacters(
  alignment: ElevenLabsAlignment,
): Array<{ word: string; start: number; end: number }> {
  const chars = alignment.characters ?? [];
  const starts = alignment.character_start_times_seconds ?? [];
  const ends = alignment.character_end_times_seconds ?? [];
  const out: Array<{ word: string; start: number; end: number }> = [];
  let current: { word: string; start: number; end: number } | null = null;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const isSpace = ch === undefined || /^\s$/.test(ch);
    if (isSpace) {
      if (current) {
        out.push(current);
        current = null;
      }
      continue;
    }
    if (!current) {
      current = { word: ch, start: Number(starts[i] ?? 0), end: Number(ends[i] ?? 0) };
    } else {
      current.word += ch;
      current.end = Number(ends[i] ?? current.end);
    }
  }
  if (current) out.push(current);
  return out;
}

// ---------- compute_timings ----------

/**
 * Token-count utility — counts whitespace-separated tokens that contain at
 * least one letter or digit. Mirrors `real_token_count` in compute_timings.py.
 */
function realTokenCount(text: string): number {
  if (!text) return 0;
  return text
    .split(/\s+/)
    .filter((t) => t.length > 0 && LETTER_OR_DIGIT_RE.test(t)).length;
}

/**
 * Walk through `parsedBeats` in order, advancing a cursor through the
 * cleaned word stream. Each beat claims as many words as its narration
 * text contains (counted via realTokenCount). The beat's startSec/endSec
 * become the first/last claimed word's start/end timestamps.
 *
 * If the cumulative word count drifts past the cleaned list (rare — usually
 * means the script and the rendered audio diverged), the last beat absorbs
 * the remainder rather than crashing.
 */
export function computeBeatTimings(
  parsedBeats: ParsedBeat[],
  cleanedWords: CleanWord[],
): TimedBeat[] {
  if (!parsedBeats.length) return [];
  if (!cleanedWords.length) {
    // No alignment data — return beats with their existing static timings,
    // marked with -1 word indices so downstream code can detect this case.
    let cursor = 0;
    return parsedBeats.map((b) => {
      const start = cursor;
      const end = cursor + (b.durSec || 0);
      cursor = end;
      return {
        ...b,
        startSec: +start.toFixed(3),
        endSec: +end.toFixed(3),
        durSec: +(end - start).toFixed(3),
        narrationStartWordIdx: -1,
        narrationEndWordIdx: -1,
      };
    });
  }

  const counts = parsedBeats.map((b) => realTokenCount(b.text));

  const timed: TimedBeat[] = [];
  let cursor = 0;
  for (let i = 0; i < parsedBeats.length; i++) {
    const beat = parsedBeats[i];
    const wantWords = counts[i];
    const isLast = i === parsedBeats.length - 1;

    let startIdx = cursor;
    let endIdx: number;

    if (isLast) {
      // Last beat takes everything left so trailing audio isn't dropped.
      endIdx = cleanedWords.length - 1;
    } else {
      endIdx = cursor + wantWords - 1;
      if (endIdx >= cleanedWords.length) endIdx = cleanedWords.length - 1;
    }

    if (startIdx > cleanedWords.length - 1) startIdx = cleanedWords.length - 1;
    if (endIdx < startIdx) endIdx = startIdx;

    const startSec = cleanedWords[startIdx].start;
    const endSec = cleanedWords[endIdx].end;

    timed.push({
      ...beat,
      startSec: +startSec.toFixed(3),
      endSec: +endSec.toFixed(3),
      durSec: +(endSec - startSec).toFixed(3),
      narrationStartWordIdx: startIdx,
      narrationEndWordIdx: endIdx,
    });

    cursor = endIdx + 1;
    if (cursor >= cleanedWords.length) cursor = cleanedWords.length;
  }

  return timed;
}

// ---------- exported helpers ----------

/** Total runtime implied by the timed beats (last beat's endSec). */
export function totalRuntimeFromTimedBeats(timed: TimedBeat[]): number {
  if (!timed.length) return 0;
  return +timed[timed.length - 1].endSec.toFixed(3);
}

// Re-export EDGE_PUNCT_RE for tests / future callers that want to strip
// the same edge punctuation when matching against the transcript.
export const _internal = {
  EDGE_PUNCT_RE,
  realTokenCount,
  assembleWordsFromCharacters,
};
