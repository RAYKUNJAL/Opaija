export type EpisodeStatus =
  | "PLANNED"
  | "SCRIPTED"
  | "STORYBOARDED"
  | "VIDEO_GENERATED"
  | "AUDIO_COMPLETE"
  | "QA_PASSED"
  | "SCHEDULED"
  | "PUBLISHED";

export const episodeStatusOrder: EpisodeStatus[] = [
  "PLANNED",
  "SCRIPTED",
  "STORYBOARDED",
  "VIDEO_GENERATED",
  "AUDIO_COMPLETE",
  "QA_PASSED",
  "SCHEDULED",
  "PUBLISHED",
];

export const episodeStatusLabels: Record<EpisodeStatus, string> = {
  PLANNED: "Planned",
  SCRIPTED: "Scripted",
  STORYBOARDED: "Storyboarded",
  VIDEO_GENERATED: "Video Generated",
  AUDIO_COMPLETE: "Audio Complete",
  QA_PASSED: "QA Passed",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
};

export type Episode = {
  id: string;
  title: string;
  status: EpisodeStatus;
  priority: number;
  doubles_moment: string;
  hook: string;
  conflict: string;
  reveal: string;
  escalation: string;
  cliffhanger: string;
  narrator_script?: string;
  characters: string[];
  location: string;
  island: string;
  villain_presence: boolean | string;
  assets_needed?: string[];
  scheduled_publish: string | null;
  platforms?: string[];
  caption_patois?: string;
  status_notes?: string;
  CANON_NOTE?: string;
  SEASON_1_TITLE_EPISODE?: boolean;
  SEASON_FINALE?: boolean;
  LORE_HEAVY?: boolean;
  generated_script?: string;
  qa_passed?: boolean;
};

export const qaChecklist = {
  characterFace: [
    "Chin is ROUNDED — not pointed, not V-shaped",
    "Nose is broad African-Caribbean structure — not narrow",
    "Lips are FULL — not thin anime defaults",
    "Skin tone is rich melanin — warm browns, deep ebony, golden undertones",
    "Eyes are expressive but grounded in Caribbean features",
    "Hair is textured — locs, braids, twists, coils — NOT straight anime defaults",
  ],
  jabari: [
    "Drums are AFRICAN STYLE WOODEN KALINDA DRUMS — not modern kit",
    "Drumsticks are L-SHAPED / CURVED — not straight Western sticks",
    "Hair: high-top locs with orange beads",
    "Palette: orange, black, gold, warm brown",
  ],
  villainSchedule: [
    "Episodes 1–6: Marius Vale NOT visible at all",
    "Episode 7: Marius Vale — BACK ONLY, no face",
    "Episodes 8–9: Marius Vale — NOT present",
    "Episode 10: Marius Vale — FIRST FULL FACE REVEAL",
    "Episodes 1–7: Selah Vale NOT visible",
    "Episode 8 onwards: Selah Vale — present",
  ],
  episodeScript: [
    "Doubles moment present (Kai — non-negotiable)",
    "Episode structure followed: hook/conflict/reveal/escalation/cliffhanger",
    "Narrator voice is The Web-Teller (not broken)",
    "Patois count: max 2–3 lines (not more)",
    "'Enslaved Africans' — not 'slaves' — in any lore text",
    "Power system correctly depicted",
    "Characters only use powers they've unlocked",
    "Island geography/architecture correct",
  ],
  videoExport: [
    "Aspect ratio: 9:16 vertical",
    "Resolution: 1080x1920",
    "Runtime: 60–90 seconds (ideal 75s)",
    "Intro card present: OPAIJA logo (2 seconds)",
    "Subtitles: white text, black outline, bottom third",
    "Audio: narration clear, music mixed under (25%)",
    "No copyrighted music",
    "No copyrighted logos/brands visible",
    "Exported in 3 platform versions (Shorts / TikTok / Reels)",
  ],
  socialCaption: [
    "Episode hook line (from script)",
    "Platform-appropriate length",
    "Patois sign-off line (1 line, authentic)",
    "Hashtags: #OPAIJA #CaribbeanAnime #TrinidadAndTobago #[island] #[character]",
    "No offensive language",
    "No spoilers beyond current episode arc",
  ],
  visualStyle: [
    "2.5D style — not flat 2D, not full 3D",
    "Cel shading clean",
    "Painterly Caribbean backgrounds",
    "Rhythm glyphs visible during power use",
    "Combat moves tied to beat timing",
    "Caribbean architecture/environment accurate",
    "Carnival colors used correctly",
    "No generic anime aesthetic",
    "No copyright concerns in any visual element",
  ],
};

export const canonRules = [
  { rule: "Kai gets doubles in every episode", critical: true },
  { rule: "Rounded chins — always, no exceptions", critical: true },
  { rule: "Full lips and broad noses — always, Caribbean features", critical: true },
  { rule: "Jabari's drums = African wooden Kalinda, L-shaped sticks — always", critical: true },
  { rule: "Marius Vale face — back only EP007, full face EP010 only", critical: true },
  { rule: '"Enslaved Africans" — never "slaves" in any lore text', critical: true },
  { rule: "Power system limits — no fighter uses powers they haven't unlocked", critical: true },
  { rule: "Episode runtime: 60-90 seconds, ideal 75s", critical: false },
  { rule: "Aspect ratio: 9:16 vertical", critical: false },
  { rule: "Narrator: The Web-Teller voice — wise, rhythmic, not rushed", critical: false },
  { rule: "Patois: max 2-3 lines per episode for authenticity without blocking international viewers", critical: false },
  { rule: "Selah Vale first appears in EP008 — not before", critical: true },
];
