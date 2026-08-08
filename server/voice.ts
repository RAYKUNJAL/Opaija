import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { characterAlignmentToWords, type CharacterAlignment } from "./captions.js";

export type VoiceProvider = "mock" | "elevenlabs" | "openai";

export type VoiceJobInput = {
  text: string;
  voiceId?: string;
  fileName?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  useSpeakerBoost?: boolean;
  pronunciation?: Record<string, string>;
  injectBreaks?: boolean;
};

// IPA phoneme overrides for OPAIJA-canon proper nouns. Applied via SSML
// <phoneme alphabet="ipa"> tags before the text is sent to ElevenLabs.
const OPAIJA_PRONUNCIATION_DEFAULTS: Record<string, string> = {
  gayelle: "ɡəˈjɛl",
  bois: "bwɑ",
  lavway: "lɑˈweɪ",
  doubles: "ˈdʌbəlz",
  kalinda: "kəˈlɪndə",
  tabanca: "təˈbæŋkə",
  Kairo: "ˈkaɪroʊ",
  Tariq: "təˈriːk",
  Asha: "ˈɑːʃə",
  Jabari: "dʒəˈbɑːri",
};

/**
 * Insert SSML <break/> tags between sentences and paragraphs to give the
 * Web-Teller narrator natural breathing room. We keep break durations <= 0.4s
 * because longer pauses cause ElevenLabs to drift / hallucinate phantom audio.
 * Quoted character dialogue is left untouched — only narrator prose gets breaks.
 */
export function injectBreaks(text: string): string {
  if (!text) return text;
  const segments = text.split(/("[^"]*"|“[^”]*”|'[^']*')/g);
  const processed = segments.map((segment, idx) => {
    // Odd indices in the split-with-capture result are the quoted regions.
    if (idx % 2 === 1) return segment;
    let out = segment.replace(/\n{2,}/g, ' <break time="0.4s"/>\n\n');
    out = out.replace(/([.!?])(\s+)(?=[A-Z“"'(\[])/g, '$1 <break time="0.35s"/>$2');
    return out;
  });
  return processed.join("");
}

/**
 * Wrap canonical-name occurrences with <phoneme alphabet="ipa" ph="..."> tags.
 * Case-insensitive match but preserves the original casing in the wrapped text.
 */
export function applyPronunciationOverrides(
  text: string,
  overrides: Record<string, string> = {},
): string {
  const merged = { ...OPAIJA_PRONUNCIATION_DEFAULTS, ...overrides };
  let out = text;
  for (const [word, ipa] of Object.entries(merged)) {
    if (!word || !ipa) continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b(${escaped})\\b`, "gi");
    out = out.replace(re, `<phoneme alphabet="ipa" ph="${ipa}">$1</phoneme>`);
  }
  return out;
}

export type VoiceJobResponse = {
  provider: VoiceProvider;
  status: "created" | "dry_run";
  path?: string;
  fileName: string;
  characterCount: number;
  requestId?: string | null;
  input?: Record<string, unknown>;
};

export function getVoiceProvider(): VoiceProvider {
  const provider = process.env.VOICE_PROVIDER?.toLowerCase() ?? "mock";
  if (provider === "openai") return "openai";
  return provider === "elevenlabs" ? "elevenlabs" : "mock";
}

export async function createVoiceover(input: VoiceJobInput): Promise<VoiceJobResponse> {
  const provider = getVoiceProvider();
  const normalized = normalizeVoiceInput(input, provider);
  const fileName = normalized.fileName;

  if (provider === "mock") {
    return {
      provider,
      status: "dry_run",
      fileName,
      characterCount: normalized.text.length,
      input: buildElevenLabsBody(normalized),
    };
  }

  if (provider === "openai") {
    return createOpenAiVoiceover(normalized, fileName);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = normalized.voiceId ?? process.env.ELEVENLABS_NARRATOR_VOICE_ID;

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is missing. Set it in .env before creating voiceover audio.");
  }

  if (!voiceId) {
    throw new Error("A voiceId or ELEVENLABS_NARRATOR_VOICE_ID is required for ElevenLabs voiceover.");
  }

  // Use the with-timestamps endpoint so we get character-level alignment for free.
  // Returns JSON: { audio_base64, alignment, normalized_alignment }
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_192`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
        Accept: "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify(buildElevenLabsBody(normalized)),
    },
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs voiceover failed: ${response.status} ${await response.text()}`);
  }

  const outputDir = path.join(process.cwd(), "public", "voiceover");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, fileName);

  const contentType = response.headers.get("content-type") ?? "";
  let audio: Buffer;
  let alignment: CharacterAlignment | null = null;

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as {
      audio_base64?: string;
      alignment?: CharacterAlignment;
      normalized_alignment?: CharacterAlignment;
    };
    if (!payload.audio_base64) {
      throw new Error("ElevenLabs with-timestamps response missing audio_base64");
    }
    audio = Buffer.from(payload.audio_base64, "base64");
    alignment = payload.normalized_alignment ?? payload.alignment ?? null;
  } else {
    // Fallback: older API or mock proxy returned raw audio. Still produce the MP3.
    audio = Buffer.from(await response.arrayBuffer());
  }

  await writeFile(outputPath, audio);

  if (alignment) {
    const sidecarPath = `${outputPath}.alignment.json`;
    const words = characterAlignmentToWords(alignment);
    await writeFile(
      sidecarPath,
      JSON.stringify({ words, characters: alignment }, null, 2),
      "utf8",
    );
  }

  return {
    provider,
    status: "created",
    fileName,
    path: `/voiceover/${fileName}`,
    characterCount: normalized.text.length,
    requestId: response.headers.get("request-id"),
  };
}

function normalizeVoiceInput(input: VoiceJobInput, provider: VoiceProvider): Required<Pick<VoiceJobInput, "text" | "fileName">> &
  VoiceJobInput {
  if (!input.text?.trim()) {
    throw new Error("Voiceover text is required.");
  }

  const safeName =
    input.fileName?.replace(/[^a-z0-9._-]/gi, "-").toLowerCase() ??
    `opaija-voiceover-${Date.now()}.mp3`;

  // Pre-process text: phoneme overrides first (so SSML breaks don't land
  // inside the matched word boundaries), then SSML breaks for narrator pacing.
  let processedText = input.text.trim();
  if (provider === "elevenlabs" || provider === "mock") {
    const shouldApplyPronunciation =
      input.pronunciation !== undefined ||
      process.env.VOICE_DISABLE_PRONUNCIATION_DEFAULTS !== "true";
    if (shouldApplyPronunciation) {
      processedText = applyPronunciationOverrides(processedText, input.pronunciation ?? {});
    }
    const shouldInjectBreaks = input.injectBreaks !== false;
    if (shouldInjectBreaks) {
      processedText = injectBreaks(processedText);
    }
  }

  return {
    ...input,
    text: processedText,
    fileName: safeName.endsWith(".mp3") ? safeName : `${safeName}.mp3`,
    stability: input.stability ?? 0.40,
    similarityBoost: input.similarityBoost ?? 0.75,
    style: input.style ?? 0.70,
    speed: input.speed ?? 1.15,
    useSpeakerBoost: input.useSpeakerBoost ?? true,
  };
}

async function createOpenAiVoiceover(
  input: Required<Pick<VoiceJobInput, "text" | "fileName">> & VoiceJobInput,
  fileName: string,
): Promise<VoiceJobResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Set it in .env before creating OpenAI voiceover audio.");
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.modelId ?? process.env.OPENAI_VOICE_MODEL ?? "tts-1",
      voice: input.voiceId ?? process.env.OPENAI_VOICE_ID ?? "alloy",
      input: input.text,
      format: "mp3",
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI voiceover failed: ${response.status} ${await response.text()}`);
  }

  const outputDir = path.join(process.cwd(), "public", "voiceover");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, fileName);
  const audio = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, audio);

  return {
    provider: "openai",
    status: "created",
    fileName,
    path: `/voiceover/${fileName}`,
    characterCount: input.text.length,
    requestId: response.headers.get("request-id"),
  };
}

function buildElevenLabsBody(
  input: Required<Pick<VoiceJobInput, "text" | "fileName">> & VoiceJobInput,
) {
  return {
    text: input.text,
    model_id: input.modelId ?? process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
    voice_settings: {
      stability: input.stability ?? 0.40,
      similarity_boost: input.similarityBoost ?? 0.75,
      style: input.style ?? 0.70,
      use_speaker_boost: input.useSpeakerBoost ?? true,
      speed: input.speed ?? 1.15,
    },
  };
}
