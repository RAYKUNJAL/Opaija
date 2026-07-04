/**
 * scripts/generate-canon-memory.ts — CANON_MEMORY.json generator
 *
 * Reads data/shared-memory/OPAIJA_CANON.json (human-authored source of truth)
 * and produces memory/CANON_MEMORY.json — a flattened, topic-keyed version
 * optimized for fast agent lookup.
 *
 * Agents read the generated file. You edit the human one.
 *
 * Usage: npx tsx scripts/generate-canon-memory.ts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const CANON_SOURCE = path.join(ROOT, "data", "shared-memory", "OPAIJA_CANON.json");
const CANON_MEMORY_OUT = path.join(ROOT, "memory", "CANON_MEMORY.json");

// ---------- types ----------
type CanonRaw = {
  _meta: { version: string; last_updated: string; description: string };
  project: Record<string, unknown>;
  universe: {
    summary: string;
    opaija_seeds: string;
    core_lore: Record<string, string>;
    main_themes: string[];
  };
  power_system: {
    name: string;
    core_rule: string;
    five_parts: Record<string, string>;
    awakening_rule: string;
    villain_opposite: { name: string; description: string; visual: string };
    combat_visual_language: string[];
  };
  characters: Record<string, Record<string, unknown>>;
  visual_style: {
    official_name: string;
    description: string;
    character_face_rules: { DO_NOT: string[] } & Record<string, string | string[]>;
    hair_rules: string;
    background_design: string[];
    animation_elements: string[];
  };
  episode_structure: {
    format: string;
    beat_map: Record<string, string>;
    narration_style: string;
    doubles_rule: string;
  };
  patois_phrase_bank: {
    common_expressions: Record<string, string>;
    usage_rule: string;
  };
  doubles_lore: Record<string, string>;
  canon_rules: {
    power_system_limits: string[];
    villain_reveal_schedule: Record<string, string>;
    selah_reveal: string;
    doubles_rule: string;
    style_locks: string[];
  };
  future_islands: {
    confirmed_arcs: string[];
    each_island_requires: string[];
  };
  merch_ecosystem: {
    launch_merch: string[];
    future_merch: string[];
  };
};

// ---------- main ----------
async function main() {
  console.log("[generate-canon-memory] Reading", CANON_SOURCE);
  const raw = await readFile(CANON_SOURCE, "utf-8");
  const canon: CanonRaw = JSON.parse(raw);

  // Flatten characters into a quick-lookup map
  const characters: Record<string, {
    full_name: string;
    age: number | string;
    island: string;
    role: string;
    power?: string;
    weapon?: string;
    signature_line?: string;
    palette?: string[];
    quirk?: string;
    key_traits?: string[];
  }> = {};

  for (const [key, char] of Object.entries(canon.characters)) {
    characters[key] = {
      full_name: (char.full_name as string) ?? key,
      age: (char.age as number | string) ?? "unknown",
      island: (char.island as string) ?? "unknown",
      role: (char.role as string) ?? "unknown",
      power: char.power as string | undefined,
      weapon: char.weapon as string | undefined,
      signature_line: char.signature_line as string | undefined,
      palette: char.palette as string[] | undefined,
      quirk: char.quirk as string | undefined,
    };
  }

  // Build the flattened canon memory
  const canonMemory = {
    _meta: {
      version: canon._meta.version,
      source_file: "data/shared-memory/OPAIJA_CANON.json",
      source_updated: canon._meta.last_updated,
      generated: new Date().toISOString(),
      description: "Flattened canon for fast agent lookup. DO NOT edit directly — edit OPAIJA_CANON.json and run: npx tsx scripts/generate-canon-memory.ts",
    },

    titles: {
      launch: canon.project.launch_title,
      season_1: canon.project.season_1_title,
      tagline: canon.project.tagline,
    },

    format: {
      animation_style: canon.project.animation_style,
      narrator: canon.project.narrator_name,
      runtime_seconds: canon.project.episode_runtime_seconds,
      platforms: canon.project.platforms,
      aspect_ratio: canon.episode_structure.format,
    },

    universe: {
      summary: canon.universe.summary,
      opaija_seeds: canon.universe.opaija_seeds,
      core_lore: canon.universe.core_lore,
      main_themes: canon.universe.main_themes,
    },

    power_system: {
      name: canon.power_system.name,
      core_rule: canon.power_system.core_rule,
      five_parts: canon.power_system.five_parts,
      awakening_rule: canon.power_system.awakening_rule,
      villain_opposite: canon.power_system.villain_opposite,
      combat_visual_language: canon.power_system.combat_visual_language,
    },

    language_rules: {
      never_use: ["slaves"],
      always_use: ["enslaved Africans"],
      patois_rule: canon.patois_phrase_bank.usage_rule,
      patois_max_per_episode: "2-3 lines, character dialogue/captions only, never in narration",
      patois_expressions: canon.patois_phrase_bank.common_expressions,
    },

    villain_reveal_schedule: canon.canon_rules.villain_reveal_schedule,
    selah_reveal: canon.canon_rules.selah_reveal,

    recurring_beats: [
      "kai_eats_doubles_pre_and_post_fight",
      "full_belly_steady_spirit_catchphrase",
      "mother_lall_doubles_stall_as_meeting_point",
    ],

    doubles_rule: canon.episode_structure.doubles_rule,
    doubles_lore: canon.doubles_lore,

    episode_beat_map: canon.episode_structure.beat_map,
    narration_style: canon.episode_structure.narration_style,

    characters,

    visual_style: {
      official_name: canon.visual_style.official_name,
      description: canon.visual_style.description,
      face_rules: canon.visual_style.character_face_rules,
      hair_rules: canon.visual_style.hair_rules,
      background_design: canon.visual_style.background_design,
      animation_elements: canon.visual_style.animation_elements,
    },

    style_locks: canon.canon_rules.style_locks,
    power_system_limits: canon.canon_rules.power_system_limits,

    future_islands: canon.future_islands,
    merch_ecosystem: canon.merch_ecosystem,
  };

  // Write
  await mkdir(path.dirname(CANON_MEMORY_OUT), { recursive: true });
  await writeFile(CANON_MEMORY_OUT, JSON.stringify(canonMemory, null, 2) + "\n", "utf-8");
  console.log("[generate-canon-memory] Wrote", CANON_MEMORY_OUT);
  console.log("[generate-canon-memory] Characters:", Object.keys(characters).length);
  console.log("[generate-canon-memory] Done.");
}

main().catch((err) => {
  console.error("[generate-canon-memory] FATAL:", err);
  process.exit(1);
});
