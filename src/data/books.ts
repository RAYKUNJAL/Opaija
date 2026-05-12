import {
  BookOpen,
  Brush,
  FileArchive,
  PanelTop,
  ScrollText,
} from "lucide-react";

export type BookFormat = {
  id: string;
  name: string;
  audience: string;
  format: string;
  reuseSource: string;
  outputs: string[];
  status: "ready" | "build-next" | "needs-template";
  icon: typeof BookOpen;
};

export const bookFormats: BookFormat[] = [
  {
    id: "comic",
    name: "Episode Comic",
    audience: "Teens and animation fans",
    format: "32-48 page full-color digital comic and KDP print edition",
    reuseSource: "Seedance keyframes, character sheets, episode shot lists",
    outputs: ["chapter script", "panel prompts", "speech balloons", "digital reader manifest", "print PDF manifest"],
    status: "ready",
    icon: PanelTop,
  },
  {
    id: "manga",
    name: "Manga Edition",
    audience: "Anime and manga readers",
    format: "48-64 page black-and-white manga-style chapter flow",
    reuseSource: "Episode beats, action poses, expression sheets",
    outputs: ["chapter breakdown", "right-to-left page plan", "tone/ink prompts", "chapter cover", "dialogue pass"],
    status: "build-next",
    icon: BookOpen,
  },
  {
    id: "coloring",
    name: "Coloring Book",
    audience: "Kids, families, schools, merch table",
    format: "48-72 page KDP coloring interior with clean line art",
    reuseSource: "Approved model sheets, props, symbols, island backgrounds",
    outputs: ["line-art prompts", "activity pages", "character fact boxes", "print PDF manifest"],
    status: "ready",
    icon: Brush,
  },
  {
    id: "storybook",
    name: "Narrated Storybook",
    audience: "Younger viewers and parents",
    format: "24-40 page illustrated prose with optional narrated digital reader",
    reuseSource: "Pilot narration, key scenes, character poses",
    outputs: ["spread text", "illustration prompts", "read-aloud pacing", "ebook manifest"],
    status: "needs-template",
    icon: ScrollText,
  },
  {
    id: "artbook",
    name: "World Artbook",
    audience: "Collectors and pitch partners",
    format: "64-96 page character, lore, environment, and production-art collection",
    reuseSource: "Canon memory, model sheets, environment packs",
    outputs: ["character pages", "world bible spreads", "merch-ready details", "pitch extract"],
    status: "build-next",
    icon: FileArchive,
  },
];

export const bookEngineStages = [
  {
    id: "story-writer",
    name: "Story Format Writer",
    owner: "Goose Showrunner + Story Format Writer",
    task: "Creates one canon-safe story packet, then adapts it into screenplay, short-form, comic, manga, storybook, and coloring-book formats.",
  },
  {
    id: "episode",
    name: "Episode Packet",
    owner: "Goose Showrunner",
    task: "Locks script, scene beats, narrator lines, shot list, and character appearances.",
  },
  {
    id: "asset-bank",
    name: "Reusable Asset Bank",
    owner: "Archive Clerk",
    task: "Stores approved model sheets, keyframes, props, backgrounds, symbols, and captions by episode.",
  },
  {
    id: "adapt",
    name: "Book Adaptation",
    owner: "Book Engine Agent",
    task: "Converts episode scenes into page beats, panel counts, dialogue, captions, and art prompts.",
  },
  {
    id: "style",
    name: "Style Conversion",
    owner: "OpenAI Style Brain",
    task: "Applies Opaija style memory for color comics, manga ink, coloring-line art, or storybook spreads.",
  },
  {
    id: "layout",
    name: "Layout Assembly",
    owner: "Paperclip Publisher",
    task: "Builds page manifests, trim-safe layout instructions, cover assets, and export checklists.",
  },
  {
    id: "reader-pass",
    name: "Digital Reader Pass",
    owner: "Digital Comics Pass Manager",
    task: "Packages approved digital books into free samples, paid pass drops, member library entries, and future checkout-gated releases.",
  },
  {
    id: "publish",
    name: "Commercial Export",
    owner: "Franchise Ops",
    task: "Prepares print, ebook, social previews, merch samplers, and pitch excerpts.",
  },
];

export const reuseRules = [
  "Every video episode must create a book-ready asset packet before final archive.",
  "Character poses, expressions, props, and backgrounds should be tagged by episode and scene.",
  "Comic/manga panels should reuse approved keyframes first, then generate missing in-between panels only when needed.",
  "Free previews should be a sample, not the product. Paid or founder books should target full chapters, usually 24-64 pages.",
  "Coloring pages need simplified line-art conversions, not new character designs.",
  "Book outputs must use OPAIJA_STYLE_GOD_MEMORY and cannot drift from approved facial, wardrobe, prop, or palette rules.",
  "Amazon KDP is the default print/distribution target: interior PDF, cover PDF, trim-safe layout, bleed settings, and page-count checks.",
];

export const kdpPresets = [
  {
    name: "Comic / Manga Default",
    trim: "6.625 x 10.25 in",
    interior: "Premium color for comics, black-and-white for manga",
    bleedPage: "6.75 x 10.5 in when full bleed is used",
    use: "Episode comics, manga chapters, collector mini-books",
  },
  {
    name: "Coloring Book Default",
    trim: "8.5 x 11 in",
    interior: "Black-and-white white paper",
    bleedPage: "8.625 x 11.25 in when full bleed is used",
    use: "Kids coloring books, activity books, classroom packs",
  },
  {
    name: "Storybook Default",
    trim: "8.5 x 8.5 in",
    interior: "Premium color white paper",
    bleedPage: "8.625 x 8.75 in when full bleed is used",
    use: "Read-aloud books and younger audience editions",
  },
  {
    name: "Artbook Default",
    trim: "8.5 x 11 in",
    interior: "Premium color white paper",
    bleedPage: "8.625 x 11.25 in when full bleed is used",
    use: "Collectors, pitch partners, production bible excerpts",
  },
];

export const kdpRules = [
  "Use print-ready PDF for interiors and covers.",
  "Covers always require bleed; download KDP cover templates/calculator per trim, paper, binding, and page count.",
  "Full-bleed interiors add 0.125 in to width and 0.25 in to height.",
  "Keep live text and important faces inside the safe area; never place key art on the trim line.",
  "Use mirror margins and page-count-based gutter rules for bound interiors.",
  "Minimum print book page counts vary by binding, ink, and paper; validate each product before export.",
];

export const episodeBookProducts = [
  {
    episode: "Pilot Cold Open",
    products: ["32-page digital comic chapter", "48-page coloring preview pack", "character art spread", "paid reader sample"],
    sourceAssets: ["Kai sheet", "gayelle sunset shot", "doubles vendor setup"],
  },
  {
    episode: "Mother Lall Message",
    products: ["24-page storybook episode", "doubles activity pack", "guardian sigil lore pages", "email-gated reader preview"],
    sourceAssets: ["Mother Lall sheet", "paper sigils", "doubles tray", "market cart"],
  },
  {
    episode: "Tidewatch Arrival",
    products: ["48-page manga chapter", "Tobago coast coloring section", "tide mark sticker sheet", "reader-pass bonus spread"],
    sourceAssets: ["Tariq sheet", "sea cloth strips", "coastal staff", "tide action pose"],
  },
];

export const bookMetrics = [
  { label: "Formats", value: "5", detail: "comic, manga, coloring, storybook, artbook" },
  { label: "Reuse Rule", value: "1x art", detail: "episode assets feed every book product" },
  { label: "Loaded Sheets", value: "10", detail: "full P1 cast ready for adaptation" },
  { label: "First Target", value: "32 pages", detail: "pilot digital comic chapter" },
];

export const digitalPassTiers = [
  {
    name: "Free Founder Preview",
    price: "$0",
    access: "Cover, sample pages, character previews, giveaway entry, and early art drops.",
  },
  {
    name: "Digital Comic Pass",
    price: "Coming next",
    access: "Full digital comic chapters, manga drops, bonus lore pages, and member-only previews.",
  },
  {
    name: "Collector Library",
    price: "Future",
    access: "Digital artbooks, behind-the-scenes pages, special covers, and print-drop priority.",
  },
];

export const paidReaderFeatures = [
  "Longer chapter drops instead of tiny previews.",
  "A protected reader with logged downloads and member access.",
  "Free sample pages stay public; full books sit behind the pass.",
  "KDP print versions reuse the same approved page packets after layout QA.",
  "Stripe or another checkout provider plugs in after the reader library is ready.",
];
