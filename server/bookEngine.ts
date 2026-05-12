export type BookPacketInput = {
  episodeId: string;
  title: string;
  format: "comic" | "manga" | "coloring" | "storybook" | "artbook";
  sourceAssets: string[];
  sceneBeats: string[];
  targetPages?: number;
  audience?: string;
  kdpTrim?: "6.625x10.25" | "8.5x11" | "8.5x8.5" | "6x9";
  bleed?: boolean;
};

export function createBookPacket(input: BookPacketInput) {
  if (!input.episodeId?.trim() || !input.title?.trim()) {
    throw new Error("episodeId and title are required.");
  }

  if (!input.sourceAssets?.length) {
    throw new Error("At least one source asset is required.");
  }

  if (!input.sceneBeats?.length) {
    throw new Error("At least one scene beat is required.");
  }

  const targetPages = input.targetPages ?? defaultPages(input.format);

  return {
    status: "dry_run",
    packetId: `book-${input.episodeId}-${input.format}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    title: input.title,
    format: input.format,
    targetPages,
    sourceAssets: input.sourceAssets,
    kdp: buildKdpSpec(input),
    styleMemory: "ops/memory/opaija-style-god-memory.json",
    requiredOutputs: buildOutputs(input.format),
    pagePlan: input.sceneBeats.slice(0, targetPages).map((beat, index) => ({
      page: index + 1,
      beat,
      artDirection: buildArtDirection(input.format, beat),
      reuseFirst: input.sourceAssets,
    })),
    guardrails: [
      "Reuse approved Opaija assets before generating new art.",
      "Do not change character face, hair, wardrobe, palette, symbols, or props without a new style approval.",
      "Validate print specs against the chosen publisher before final export.",
      "Amazon KDP is the default print/distribution target; validate trim, bleed, gutter, and cover calculator output before upload.",
    ],
  };
}

function defaultPages(format: BookPacketInput["format"]) {
  if (format === "coloring") return 24;
  if (format === "artbook") return 32;
  if (format === "storybook") return 16;
  return 4;
}

function buildOutputs(format: BookPacketInput["format"]) {
  const common = ["asset manifest", "style check", "page plan", "export checklist"];
  const byFormat: Record<BookPacketInput["format"], string[]> = {
    comic: ["panel script", "dialogue/caption pass", "full-color page prompts"],
    manga: ["manga page flow", "ink/tone prompts", "sound effect lettering notes"],
    coloring: ["clean line-art prompts", "activity text", "answer/key notes when needed"],
    storybook: ["spread prose", "read-aloud pacing", "illustration prompts"],
    artbook: ["character spread copy", "lore sidebars", "production notes"],
  };

  return [...common, ...byFormat[format]];
}

function buildArtDirection(format: BookPacketInput["format"], beat: string) {
  const base =
    "Use OPAIJA_STYLE_GOD_MEMORY: 2.5D Caribbean anime hybrid, rounded chins, full lips, broad African/Caribbean nose language, clean black ink, bright island energy.";

  if (format === "coloring") {
    return `${base} Convert this beat into clean black-and-white coloring-book line art with bold readable shapes and no gray shading: ${beat}`;
  }

  if (format === "manga") {
    return `${base} Convert this beat into black-and-white manga page art with strong ink, screen-tone notes, expressive motion, and readable action: ${beat}`;
  }

  return `${base} Convert this beat into book-ready Opaija page art while preserving approved episode assets: ${beat}`;
}

function buildKdpSpec(input: BookPacketInput) {
  const trim = input.kdpTrim ?? defaultTrim(input.format);
  const bleed = input.bleed ?? true;
  const sizes: Record<NonNullable<BookPacketInput["kdpTrim"]>, { trim: string; bleed: string }> = {
    "6.625x10.25": { trim: "6.625 x 10.25 in", bleed: "6.75 x 10.5 in" },
    "8.5x11": { trim: "8.5 x 11 in", bleed: "8.625 x 11.25 in" },
    "8.5x8.5": { trim: "8.5 x 8.5 in", bleed: "8.625 x 8.75 in" },
    "6x9": { trim: "6 x 9 in", bleed: "6.125 x 9.25 in" },
  };

  return {
    platform: "Amazon KDP",
    trimSize: sizes[trim].trim,
    interiorPageSize: bleed ? sizes[trim].bleed : sizes[trim].trim,
    bleed,
    interiorExport: "print-ready PDF",
    coverExport: "KDP cover-template-based print-ready PDF",
    notes: [
      "Cover size depends on binding, ink, paper, trim, and page count; use KDP Cover Calculator for final dimensions.",
      "Full-bleed interior art must extend 0.125 in past the trim on top, bottom, and outside edge.",
      "Keep important text, faces, balloons, and page numbers inside safe margins.",
    ],
  };
}

function defaultTrim(format: BookPacketInput["format"]): NonNullable<BookPacketInput["kdpTrim"]> {
  if (format === "coloring" || format === "artbook") return "8.5x11";
  if (format === "storybook") return "8.5x8.5";
  return "6.625x10.25";
}
