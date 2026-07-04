#!/usr/bin/env tsx
/**
 * OPAIJA Studios — Character Reference Image Generator
 *
 * Generates locked character reference images via Flux Pro on fal.ai.
 * These refs feed into Seedance image-to-video for visual consistency
 * across all episodes.
 *
 * Usage:
 *   tsx scripts/generate-character-refs.ts                 # all chars, all angles
 *   tsx scripts/generate-character-refs.ts --character kai_baptiste
 *   tsx scripts/generate-character-refs.ts --angle portrait
 *   tsx scripts/generate-character-refs.ts --dry-run       # print prompts only
 *   tsx scripts/generate-character-refs.ts --force         # skip 3s confirm
 */

import { fal } from "@fal-ai/client";
import { config as loadEnv } from "dotenv";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");
const CANON_PATH = join(PROJECT_ROOT, "data", "shared-memory", "OPAIJA_CANON.json");
const OUTPUT_ROOT = join(PROJECT_ROOT, "public", "assets", "characters", "refs");

const FLUX_MODEL = process.env.FLUX_REF_MODEL ?? "fal-ai/flux-pro/v1.1";
const COST_PER_IMAGE_USD = 0.05;

type Angle = "front" | "portrait" | "action" | "silhouette" | "back-only";

type CharacterCanon = {
  full_name?: string;
  age?: number | string;
  island?: string;
  role?: string;
  height?: string;
  build?: string;
  skin_tone?: string;
  hair?: string;
  appearance?: string;
  palette?: string[];
  power?: string;
  weapon?: string;
  signature_line?: string;
  key_accessories?: Record<string, string>;
};

type Canon = {
  characters: Record<string, CharacterCanon>;
  visual_style: {
    character_face_rules: Record<string, unknown>;
    official_name?: string;
  };
};

type CliFlags = {
  character?: string;
  angle?: Angle;
  dryRun: boolean;
  force: boolean;
};

const STYLE_BLOCK =
  "Caribbean Glyph-Cel 2.5D anime style, hand-drawn 2D character illustration on a cinematic 3D background, painterly tropical Caribbean lighting, warm golden hour palette, gingerbread architecture or carnival cloth backdrop, high detail, character sheet quality, full body visible, neutral background fade so character reads cleanly";

const FACE_RULES =
  "MUST follow these face rules: ROUNDED chin (NEVER pointed, NEVER V-shaped), broad African-Caribbean nose structure (NOT narrow anime nose), full lips (NOT thin anime defaults), expressive Caribbean anime eyes grounded in African-Caribbean features, rich melanin skin tone with warm golden undertones";

const NEGATIVE_RULES =
  "AVOID: generic anime face, pointed V-shaped chin, thin lips, pale skin, narrow nose, untextured straight hair, generic cosplay look";

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--character") flags.character = argv[++i];
    else if (arg === "--angle") flags.angle = argv[++i] as Angle;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return flags;
}

function printHelp() {
  console.log(`
OPAIJA Character Reference Generator

Flags:
  --character <key>   Only regenerate one character (e.g. kai_baptiste)
  --angle <name>      Only one angle: front | portrait | action | silhouette | back-only
  --dry-run           Print prompts to console, do not call API or save files
  --force             Skip the 3-second cancel window
  --help, -h          Show this message
`);
}

function anglesFor(characterKey: string): Angle[] {
  // Marius Vale is locked — no full face until EP010 reveal
  if (characterKey === "marius_vale") return ["silhouette", "back-only"];
  return ["front", "portrait", "action"];
}

function buildIdentityBlock(key: string, c: CharacterCanon): string {
  const parts: string[] = [];
  if (c.full_name) parts.push(c.full_name);
  if (c.age !== undefined) parts.push(`age ${c.age}`);
  if (c.island) parts.push(`from ${c.island}`);
  if (c.role) parts.push(c.role);
  if (c.height) parts.push(`height ${c.height}`);
  if (c.build) parts.push(c.build);
  if (c.skin_tone) parts.push(`skin tone ${c.skin_tone}`);
  if (c.hair) parts.push(`hair: ${c.hair}`);
  if (!c.hair && c.appearance) parts.push(c.appearance);
  return parts.join(", ");
}

function buildPaletteBlock(c: CharacterCanon): string {
  if (!c.palette || c.palette.length === 0) return "";
  const top = c.palette.slice(0, 4).join(", ");
  return `costume palette: ${top}`;
}

function buildAccessoriesBlock(c: CharacterCanon): string {
  const items: string[] = [];
  if (c.key_accessories) {
    for (const [name, desc] of Object.entries(c.key_accessories)) {
      items.push(`${name.replace(/_/g, " ")}: ${desc}`);
    }
  }
  if (c.weapon) items.push(`weapon: ${c.weapon}`);
  return items.length ? `signature accessories — ${items.join("; ")}` : "";
}

function buildAnglePrompt(
  key: string,
  c: CharacterCanon,
  angle: Angle,
): string {
  const identity = buildIdentityBlock(key, c);
  const palette = buildPaletteBlock(c);
  const accessories = buildAccessoriesBlock(c);

  let pose = "";
  switch (angle) {
    case "front":
      pose =
        "FRONT view, full body, standing in neutral confident pose, arms relaxed, facing camera, even Caribbean afternoon lighting";
      break;
    case "portrait":
      pose =
        "PORTRAIT, chest-up framing, expressive face, three-quarter angle, looking slightly off camera, soft warm rim light, character emotion clear";
      break;
    case "action":
      pose =
        "ACTION pose, mid-fight stance with weapon engaged, dynamic body language, motion lines and rhythm glyphs visible, dust and flambeaux sparks, gayelle arena background";
      break;
    case "silhouette":
      pose =
        "SILHOUETTE only — pure black backlit shape against deep purple and silver mist, NO facial features visible, NO skin detail, only outline and posture. Elegant tall figure holding a corrupted drum staff. The stillness is the threat.";
      break;
    case "back-only":
      pose =
        "BACK VIEW only — character turned fully away from camera, NO face visible, NO profile visible. Tailored dark coat, near-black with deep purple and silver accents, holding the One Drum staff. Cold white edge light from the side.";
      break;
  }

  // Jabari drum-stick lock
  const jabariNote =
    key === "jabari_henry"
      ? "CRITICAL: traditional African Kalinda WOODEN drums (NOT a modern drum kit), L-SHAPED curved traditional drumsticks (NOT modern Western straight sticks)."
      : "";

  // Villain face suppression for Marius
  const mariusNote =
    key === "marius_vale"
      ? "ABSOLUTE LOCK: face must NOT be visible in any form. No eyes, no mouth, no nose, no jawline. Identity is hidden."
      : "";

  const segments = [
    STYLE_BLOCK,
    FACE_RULES,
    `Character: ${identity}`,
    palette,
    accessories,
    `Pose: ${pose}`,
    jabariNote,
    mariusNote,
    `Signature line vibe: "${c.signature_line ?? ""}"`,
    NEGATIVE_RULES,
    "Vertical 9:16 character sheet, isolated character on softly lit Caribbean backdrop, sharp focus, no text overlays, no watermarks.",
  ].filter(Boolean);

  return segments.join(". ");
}

async function loadCanon(): Promise<Canon> {
  const raw = await readFile(CANON_PATH, "utf-8");
  return JSON.parse(raw) as Canon;
}

async function ensureDir(path: string) {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true });
  }
}

async function downloadImage(url: string, destPath: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status} ${res.statusText}) from ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
}

type FluxResult = {
  data?: { images?: Array<{ url?: string }> };
};

async function generateOne(
  characterKey: string,
  angle: Angle,
  prompt: string,
): Promise<string> {
  const result = (await fal.subscribe(FLUX_MODEL, {
    input: {
      prompt,
      image_size: "portrait_16_9",
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: true,
      output_format: "png",
    },
    logs: false,
  })) as FluxResult;

  const url = result?.data?.images?.[0]?.url;
  if (!url) {
    throw new Error(`No image URL returned for ${characterKey}/${angle}`);
  }

  const dir = join(OUTPUT_ROOT, characterKey);
  await ensureDir(dir);
  const destPath = join(dir, `${angle}.png`);
  await downloadImage(url, destPath);
  return destPath;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const canon = await loadCanon();

  if (!canon.characters) {
    console.error("OPAIJA_CANON.json missing 'characters' section.");
    process.exit(1);
  }

  // Build job list
  const jobs: Array<{ key: string; angle: Angle; prompt: string; character: CharacterCanon }> = [];
  for (const [key, character] of Object.entries(canon.characters)) {
    if (flags.character && key !== flags.character) continue;

    const allowed = anglesFor(key);
    for (const angle of allowed) {
      if (flags.angle && angle !== flags.angle) continue;
      const prompt = buildAnglePrompt(key, character, angle);
      jobs.push({ key, angle, prompt, character });
    }
  }

  if (jobs.length === 0) {
    console.log("No matching jobs to run. Check --character / --angle flags.");
    process.exit(0);
  }

  const totalCost = (jobs.length * COST_PER_IMAGE_USD).toFixed(2);
  console.log(`\nOPAIJA Character Reference Generator`);
  console.log(`Model:       ${FLUX_MODEL}`);
  console.log(`Output dir:  ${OUTPUT_ROOT}`);
  console.log(`Jobs queued: ${jobs.length}`);
  console.log(`Est. cost:   ~$${totalCost} USD (at $${COST_PER_IMAGE_USD}/image)`);
  console.log(`Dry run:     ${flags.dryRun ? "YES" : "no"}\n`);

  if (flags.dryRun) {
    for (const j of jobs) {
      console.log(`\n--- ${j.key} / ${j.angle} ---`);
      console.log(j.prompt);
    }
    console.log("\n[dry-run] No API calls made, no files written.");
    return;
  }

  // Live mode — require key
  if (!process.env.FAL_KEY) {
    console.error(
      "ERROR: FAL_KEY is missing. Add it to .env (see scripts/setup.js) before running live.",
    );
    process.exit(1);
  }
  fal.config({ credentials: process.env.FAL_KEY });

  if (!flags.force) {
    console.log("Starting in 3 seconds — press Ctrl+C to cancel.");
    await delay(3000);
  }

  let success = 0;
  let failed = 0;
  for (const j of jobs) {
    const label = `${j.key}/${j.angle}`;
    process.stdout.write(`Generating ${label} ... `);
    try {
      const out = await generateOne(j.key, j.angle, j.prompt);
      console.log(`saved -> ${out}`);
      success++;
    } catch (err) {
      console.log(`FAILED`);
      console.error(`  ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${success} succeeded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
