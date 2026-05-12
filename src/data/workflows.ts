export type PipelineStage = {
  id: string;
  name: string;
  owner: string;
  status: "live" | "next" | "blocked";
  metric: string;
  tasks: string[];
};

export const pipeline: PipelineStage[] = [
  {
    id: "canon",
    name: "Canon Lock",
    owner: "Codex Brain + Lore Guardian",
    status: "live",
    metric: "10/10 core cast sheets loaded",
    tasks: ["Finalize Season 1 character bibles", "Lock island-by-island canon", "Name canon terms"],
  },
  {
    id: "reference",
    name: "Reference Packs",
    owner: "Goose Art Director",
    status: "live",
    metric: "10 sheets imported",
    tasks: ["Model sheet inventory", "Seedance image reference packs", "Action-pose extraction queue"],
  },
  {
    id: "story",
    name: "Story Format Engine",
    owner: "Goose Showrunner + Story Format Writer",
    status: "live",
    metric: "Multi-format writing",
    tasks: ["Short scripts", "movie scene beats", "comic chapters", "manga chapters", "storybook prose"],
  },
  {
    id: "video",
    name: "Video Assembly",
    owner: "Paperclip Video Ops",
    status: "live",
    metric: "fal.ai + ElevenLabs connected",
    tasks: ["Seedance workflow", "image-to-video prompts", "caption style", "Remotion render naming"],
  },
  {
    id: "reader",
    name: "Digital Reader Pass",
    owner: "Paperclip Publisher + Revenue",
    status: "next",
    metric: "Paid library planned",
    tasks: ["Free sample pages", "member library", "checkout gate", "download tracking"],
  },
  {
    id: "launch",
    name: "Launch Engine",
    owner: "Launch Marketer",
    status: "next",
    metric: "30-day warm audience plan",
    tasks: ["Character reveal posts", "micro lore clips", "community questions", "upload cadence"],
  },
  {
    id: "revenue",
    name: "Revenue Layer",
    owner: "Franchise Ops",
    status: "next",
    metric: "Merch hooks on every P1 character",
    tasks: ["Poster line", "stick/drum props", "street-food humor drops", "pitch deck later"],
  },
];

export const memoryRules = [
  "Use 'enslaved Africans' instead of dehumanizing shorthand in backstory.",
  "Core power rule: stick has memory, fighter has spirit, drum has rhythm, lavway has command, gayelle binds them.",
  "Visual style: 2.5D Caribbean anime hybrid with rounded chins, fuller lips, broader African/Caribbean nose language, bright island energy, and clean duplicable production shape.",
  "Initial voice plan: narrator-led pilot for speed; voice cast can be layered later.",
  "Short-form strategy: build a buffer before public launch; do not post day-of-production.",
  "Every major character needs bible, model sheet, face sheet, expression sheet, pose sheet, turnaround, and Seedance reference pack.",
  "Story outputs must be format-aware: shorts, episodes, movie scenes, comics, manga, storybooks, coloring books, and artbooks are different adaptations of the same canon.",
  "Action references must be owned, licensed, public-domain, or original choreography notes; no unlicensed movie scraping goes into training memory.",
];

export const releaseTargets = [
  { label: "Warm Audience Teasers", count: 21, format: "9:16 shorts", timing: "Daily prelaunch" },
  { label: "Character Reveal Posts", count: 10, format: "Image + caption", timing: "3 per week" },
  { label: "Vertical Micro Episodes", count: 12, format: "45-75 seconds", timing: "Bank before launch" },
  { label: "Digital Comic Chapter", count: 1, format: "32 pages", timing: "First paid-pass proof" },
  { label: "Coloring Book Packet", count: 1, format: "48 pages", timing: "KDP pipeline test" },
  { label: "Pilot Episode", count: 1, format: "Narrated 6-9 min", timing: "After teaser runway" },
];
