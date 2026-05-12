import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type VoiceProvider = "mock" | "elevenlabs" | "openai";

export type VoiceJobInput = {
  text: string;
  voiceId?: string;
  fileName?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
};

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
  const normalized = normalizeVoiceInput(input);
  const provider = getVoiceProvider();
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

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify(buildElevenLabsBody(normalized)),
    },
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs voiceover failed: ${response.status} ${await response.text()}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  const outputDir = path.join(process.cwd(), "public", "voiceover");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, fileName);
  await writeFile(outputPath, audio);

  return {
    provider,
    status: "created",
    fileName,
    path: `/voiceover/${fileName}`,
    characterCount: normalized.text.length,
    requestId: response.headers.get("request-id"),
  };
}

function normalizeVoiceInput(input: VoiceJobInput): Required<Pick<VoiceJobInput, "text" | "fileName">> &
  VoiceJobInput {
  if (!input.text?.trim()) {
    throw new Error("Voiceover text is required.");
  }

  const safeName =
    input.fileName?.replace(/[^a-z0-9._-]/gi, "-").toLowerCase() ??
    `opaija-voiceover-${Date.now()}.mp3`;

  return {
    ...input,
    text: input.text.trim(),
    fileName: safeName.endsWith(".mp3") ? safeName : `${safeName}.mp3`,
    stability: input.stability ?? 0.52,
    similarityBoost: input.similarityBoost ?? 0.78,
    style: input.style ?? 0.24,
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
      model: input.modelId ?? process.env.OPENAI_TTS_MODEL ?? "tts-1",
      voice: input.voiceId ?? process.env.OPENAI_TTS_VOICE ?? "alloy",
      input: input.text,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI voiceover failed: ${response.status} ${await response.text()}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  const outputDir = path.join(process.cwd(), "public", "voiceover");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, fileName);
  await writeFile(outputPath, audio);

  return {
    provider: "openai",
    status: "created",
    fileName,
    path: `/voiceover/${fileName}`,
    characterCount: input.text.length,
    requestId: response.headers.get("x-request-id"),
  };
}

function buildElevenLabsBody(input: Required<Pick<VoiceJobInput, "text" | "fileName">> & VoiceJobInput) {
  return {
    text: input.text,
    model_id: input.modelId ?? process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
    voice_settings: {
      stability: input.stability,
      similarity_boost: input.similarityBoost,
      style: input.style,
    },
  };
}
