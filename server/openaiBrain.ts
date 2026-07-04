import OpenAI from "openai";

export type BrainTaskInput = {
  task: "character-bible" | "seedance-prompt" | "episode-script" | "marketing-hook" | "style-check";
  brief: string;
  characterName?: string;
  outputFormat?: "markdown" | "json";
};

export type BrainProvider = "openai" | "openrouter";

const styleLock = [
  "OPAIJA 2.5D Caribbean anime hybrid.",
  "Rounded chins, full lips, distinct broad African/Caribbean nose structures, expressive warm eyes.",
  "Bright island energy with black ink linework, clean duplicable production shape, and gold/orange/red/teal/cream accents.",
  "Kalenda/Calinda, bois, lavway, drums, gayelle, Carnival resistance, and island-specific culture are core visual and story anchors.",
  "No generic fantasy armor, no washed-out palette, no V-shaped anime chins, no flattened cultural detail.",
].join(" ");

export async function runBrainTask(input: BrainTaskInput) {
  const provider = getBrainProvider();
  const model = getBrainModel(provider);
  const prompt = buildPrompt(input);

  if (provider === "openrouter") {
    if (!process.env.OPENROUTER_API_KEY) {
      return {
        provider,
        status: "dry_run",
        model,
        prompt,
      };
    }

    const openrouter = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? process.env.PUBLIC_SITE_URL ?? "https://opaija.com",
        "X-OpenRouter-Title": process.env.OPENROUTER_APP_NAME ?? "Opaija Command Center",
      },
    });

    const completion = await openrouter.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
    });

    return {
      provider,
      status: "completed",
      model,
      output: completion.choices[0]?.message?.content ?? "",
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      provider,
      status: "dry_run",
      model,
      prompt,
    };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.responses.create({
    model,
    input: prompt,
  });

  return {
    provider,
    status: "completed",
    model,
    output: response.output_text,
  };
}

export function getBrainProvider(): BrainProvider {
  return process.env.BRAIN_PROVIDER?.toLowerCase() === "openrouter" ? "openrouter" : "openai";
}

export function getBrainModel(provider = getBrainProvider()) {
  if (provider === "openrouter") return process.env.OPENROUTER_MODEL ?? "moonshotai/kimi-k2";
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}

function buildPrompt(input: BrainTaskInput) {
  return [
    "You are an OPAIJA production agent working inside the official command center.",
    `Style lock: ${styleLock}`,
    "Canon rule: use 'enslaved Africans' in historical backstory.",
    "Core power rule: a stick has memory, a fighter has spirit, a drum has rhythm, a lavway has command, and the gayelle binds them together.",
    input.characterName ? `Character: ${input.characterName}` : "",
    `Task type: ${input.task}`,
    `Output format: ${input.outputFormat ?? "markdown"}`,
    `Brief: ${input.brief}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
