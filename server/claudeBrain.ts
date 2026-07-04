import Anthropic from "@anthropic-ai/sdk";

export type ClaudeBrainProvider = "anthropic" | "openrouter" | "openai";

export type ScriptGenerationInput = {
  episodeId: string;
  title: string;
  hook: string;
  conflict: string;
  reveal: string;
  escalation: string;
  cliffhanger: string;
  doublesMoment: string;
  characters: string[];
  location: string;
  island: string;
  villainPresence: boolean | string;
  existingNarratorScript?: string;
};

export type BrainTaskInput = {
  task:
    | "episode-script"
    | "character-bible"
    | "seedance-prompt"
    | "marketing-hook"
    | "style-check"
    | "canon-check"
    | "narration";
  brief: string;
  characterName?: string;
  episodeContext?: ScriptGenerationInput;
  outputFormat?: "markdown" | "json";
};

const STYLE_LOCK = [
  "OPAIJA 2.5D Caribbean anime hybrid.",
  "Rounded chins, full lips, distinct broad African/Caribbean nose structures, expressive warm eyes.",
  "Bright island energy with black ink linework, clean duplicable production shape, and gold/orange/red/teal/cream accents.",
  "Kalenda/Calinda, bois, lavway, drums, gayelle, Carnival resistance, and island-specific culture are core visual and story anchors.",
  "No generic fantasy armor, no washed-out palette, no V-shaped anime chins, no flattened cultural detail.",
].join(" ");

const CANON_RULES = [
  "Use enslaved Africans (NEVER slaves) in all historical references.",
  "Kai MUST have a doubles moment in every episode (non-negotiable).",
  "Core power rule: a stick has memory, a fighter has spirit, a drum has rhythm, a lavway has command, the gayelle binds them.",
  "Jabari's drums are African-style wooden Kalinda drums with L-shaped curved sticks - NOT a modern kit.",
  "Marius Vale is back-only in EP007. Full face reveal is EP010 only.",
  "Selah Vale first appears in EP008.",
  "Characters cannot use powers they have not yet unlocked.",
  "Patois count: max 2-3 lines per episode - authentic but accessible.",
  "The Web-Teller narrator voice: wise, rhythmic, storytelling tone. Never rushed.",
  "Episode structure: hook / conflict / reveal / escalation / cliffhanger.",
].join("\n");

const SYSTEM_PROMPT = `You are a senior writer and production agent for OPAIJA Studios - a Caribbean Afrocentric martial anime production company based in Trinidad and Tobago.

STYLE LOCK: ${STYLE_LOCK}

CANON RULES (NON-NEGOTIABLE):
${CANON_RULES}

You write with cultural pride, cinematic weight, and rhythmic language. Every word earns its place.`;

export function getClaudeBrainProvider(): ClaudeBrainProvider {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return "openai";
}

const DEFAULT_SCRIPT_MODEL = "claude-sonnet-4-6";
const DEFAULT_CANON_MODEL = "claude-3-5-haiku-latest";

const MODEL_BY_TASK: Partial<Record<BrainTaskInput["task"], string>> = {
  "episode-script": DEFAULT_SCRIPT_MODEL,
  "canon-check": DEFAULT_CANON_MODEL,
};

const MAX_TOKENS_BY_TASK: Partial<Record<BrainTaskInput["task"], number>> = {
  "episode-script": 4000,
  "canon-check": 2000,
};

function resolveModelForTask(task: BrainTaskInput["task"]): string {
  if (task === "canon-check") {
    return process.env.CLAUDE_CANON_MODEL ?? MODEL_BY_TASK[task] ?? DEFAULT_CANON_MODEL;
  }
  if (task === "episode-script") {
    return process.env.CLAUDE_MODEL ?? MODEL_BY_TASK[task] ?? DEFAULT_SCRIPT_MODEL;
  }
  return process.env.CLAUDE_MODEL ?? MODEL_BY_TASK[task] ?? DEFAULT_SCRIPT_MODEL;
}

function resolveMaxTokensForTask(task: BrainTaskInput["task"]): number {
  return MAX_TOKENS_BY_TASK[task] ?? 8000;
}

export async function runClaudeBrainTask(input: BrainTaskInput) {
  const provider = getClaudeBrainProvider();
  const prompt = buildPrompt(input);

  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return { provider, status: "dry_run", model: resolveModelForTask(input.task), prompt };
    }

    const client = new Anthropic({ apiKey: key });
    const model = resolveModelForTask(input.task);
    const maxTokens = resolveMaxTokensForTask(input.task);

    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const output = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    return {
      provider,
      status: "completed",
      model,
      output,
      usage: message.usage,
    };
  }

  return { provider, status: "dry_run", model: "claude-sonnet-4-6", prompt };
}

function buildPrompt(input: BrainTaskInput): string {
  const parts: string[] = [];

  if (input.task === "episode-script" && input.episodeContext) {
    const ep = input.episodeContext;
    parts.push(`TASK: Write a complete production script for OPAIJA ${ep.episodeId}: "${ep.title}"`);
    parts.push(`ISLAND: ${ep.island} | LOCATION: ${ep.location}`);
    parts.push(`CHARACTERS: ${ep.characters.join(", ")}`);
    parts.push(`VILLAIN PRESENCE: ${ep.villainPresence === false ? "None" : ep.villainPresence}`);
    parts.push(`\nSTORY BEATS:`);
    parts.push(`HOOK: ${ep.hook}`);
    parts.push(`CONFLICT: ${ep.conflict}`);
    parts.push(`REVEAL: ${ep.reveal}`);
    parts.push(`ESCALATION: ${ep.escalation}`);
    parts.push(`CLIFFHANGER: ${ep.cliffhanger}`);
    parts.push(`DOUBLES MOMENT (MANDATORY for Kai): ${ep.doublesMoment}`);
    if (ep.existingNarratorScript) {
      parts.push(`\nEXISTING NARRATOR DRAFT (expand into full script):\n${ep.existingNarratorScript}`);
    }
    parts.push(
      `\nDeliver: Full production script with The Web-Teller narration, scene directions, dialogue beats, and social captions. Runtime target: 75 seconds. Format: 9:16 vertical micro-episode.`,
    );
  } else if (input.task === "narration") {
    parts.push(`TASK: Write The Web-Teller narration for the following scene.`);
    parts.push(`BRIEF: ${input.brief}`);
    parts.push(
      `Style: Wise, rhythmic, storytelling cadence. Caribbean weight. Sentences land like drum beats. 60-120 words.`,
    );
  } else if (input.task === "seedance-prompt") {
    parts.push(`TASK: Generate a Seedance 2.0 video generation prompt.`);
    if (input.characterName) parts.push(`CHARACTER: ${input.characterName}`);
    parts.push(`BRIEF: ${input.brief}`);
    parts.push(
      `Output a single optimized image-to-video or text-to-video prompt that specifies: character appearance locks (rounded chin, full lips, broad nose, Caribbean features), 2.5D anime style, action, camera angle, mood, lighting, and rhythm glyph effects if applicable. Under 300 words.`,
    );
  } else if (input.task === "marketing-hook") {
    parts.push(`TASK: Write 5 social media hooks for OPAIJA content.`);
    parts.push(`BRIEF: ${input.brief}`);
    parts.push(
      `Each hook: 1 line. High curiosity. Caribbean authentic. Ends with an emotional pull or question. Patois touch optional but max 1 line.`,
    );
  } else if (input.task === "character-bible") {
    parts.push(`TASK: Write a character production bible entry.`);
    if (input.characterName) parts.push(`CHARACTER: ${input.characterName}`);
    parts.push(`BRIEF: ${input.brief}`);
    parts.push(
      `Include: full name, age, island, role, physical description, power system, weapon, personality, strengths, weaknesses, arc, key relationships, signature lines, and merch hooks.`,
    );
  } else if (input.task === "style-check") {
    parts.push(`TASK: Review the following content for OPAIJA style and canon compliance.`);
    parts.push(`CONTENT TO REVIEW:\n${input.brief}`);
    parts.push(
      `Check against: style lock rules, canon rules, power system limits, cultural authenticity, language rules. Return PASS/FAIL for each check, specific issues, and correction suggestions.`,
    );
  } else if (input.task === "canon-check") {
    parts.push(`TASK: Validate the following content against the OPAIJA canon (data/shared-memory/OPAIJA_CANON.json).`);
    parts.push(`CANON RULES (NON-NEGOTIABLE):\n${CANON_RULES}`);
    parts.push(`CONTENT TO REVIEW:\n${input.brief}`);
    parts.push(
      `For each canon rule, check the content line-by-line for violations. Return ONLY valid JSON in this exact shape: {"passed": boolean, "violations": [{"rule": string, "line": string, "fix": string}]}. "passed" is true only when violations is empty. "rule" must quote the violated canon rule. "line" must quote the offending line/phrase from the content. "fix" must give a concrete, on-canon rewrite suggestion.`,
    );
  } else {
    parts.push(`TASK: ${input.task}`);
    if (input.characterName) parts.push(`CHARACTER: ${input.characterName}`);
    parts.push(`BRIEF: ${input.brief}`);
  }

  if (input.outputFormat === "json") {
    parts.push(`\nReturn response as valid JSON only.`);
  }

  return parts.join("\n\n");
}
