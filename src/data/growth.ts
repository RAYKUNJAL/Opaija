import {
  BadgeCheck,
  BookOpenText,
  Gift,
  Mail,
  Megaphone,
  RadioTower,
  Send,
  Sparkles,
  Video,
} from "lucide-react";

export const growthAgents = [
  {
    name: "Tribe Growth Commander",
    channel: "Command",
    role: "Coordinates organic, paid, email, lead magnets, founder drops, and weekly growth reviews.",
    owns: ["growth memory", "weekly targets", "agent handoffs", "experiment board"],
    icon: RadioTower,
  },
  {
    name: "Meta Ads Agent",
    channel: "Facebook / Instagram",
    role: "Builds campaign structure, lead forms, retargeting, creative tests, and conversion feedback loops.",
    owns: ["Meta campaign brief", "audiences", "lead form plan", "creative variants"],
    icon: Megaphone,
  },
  {
    name: "TikTok Growth Agent",
    channel: "TikTok",
    role: "Runs organic hooks, Spark Ads candidates, lead-gen tests, creator-style edits, and trend response.",
    owns: ["hook bank", "daily posting queue", "paid lead tests", "comment mining"],
    icon: Send,
  },
  {
    name: "YouTube Growth Agent",
    channel: "YouTube",
    role: "Packages Shorts, long-form pilot, thumbnails, titles, descriptions, and subscriber calls to action.",
    owns: ["Shorts calendar", "pilot packaging", "thumbnail tests", "community posts"],
    icon: Video,
  },
  {
    name: "Email Tribe Agent",
    channel: "Email / CRM",
    role: "Captures fans, tags interests, sends welcome sequences, and keeps founders warm.",
    owns: ["lead forms", "welcome sequence", "fan tags", "weekly newsletter"],
    icon: Mail,
  },
  {
    name: "Story Blog Agent",
    channel: "Owned media",
    role: "Turns lore, episode drops, and the storyline book into SEO/blog/lead-generation assets.",
    owns: ["story blog", "lead magnet", "content pillars", "download pages"],
    icon: BookOpenText,
  },
  {
    name: "Founder Drop Agent",
    channel: "Digital collectible",
    role: "Plans early founder rewards, digital art gifts, optional NFT mint path, and access perks.",
    owns: ["founder pass rules", "art giveaway", "mint checklist", "community perks"],
    icon: Gift,
  },
];

export const growthLoops = [
  {
    name: "Organic Curiosity Loop",
    target: "Reach and follows",
    cadence: "Daily",
    steps: ["Post teaser", "Pin comment CTA", "Reply with lore", "Capture email from bio link", "Retarget engagers"],
  },
  {
    name: "Founder Email Loop",
    target: "Email list and superfans",
    cadence: "Always on",
    steps: ["Offer founder art drop", "Collect email", "Tag interest", "Send welcome story", "Invite to next reveal"],
  },
  {
    name: "Paid Signal Loop",
    target: "Low-cost lead and retarget pools",
    cadence: "Weekly test cycles",
    steps: ["Launch 3 hooks", "Measure hold/click/lead", "Kill weak ads", "Scale winners", "Feed learning back to creative"],
  },
  {
    name: "Story Asset Loop",
    target: "Lead magnet and blog traffic",
    cadence: "2x weekly",
    steps: ["Publish lore page", "Clip into shorts", "Offer download", "Email behind-the-scenes", "Build KDP/book demand"],
  },
];

export const leadMagnets = [
  {
    name: "Opaija Founder Art Drop",
    type: "Digital artwork giveaway",
    offer: "Get the first founder-only Kai/Mother Lall art pack and behind-the-scenes style notes.",
    capture: "email, favorite character, platform source",
  },
  {
    name: "The Gayelle Files",
    type: "Story bible excerpt",
    offer: "Download the illustrated intro to the Opaija world, powers, characters, and first conflict.",
    capture: "email, age range, content interest",
  },
  {
    name: "Season 1 Character Pack",
    type: "Wallpaper + printable mini poster",
    offer: "Get weekly character reveals before they drop publicly.",
    capture: "email, merch interest, book interest",
  },
  {
    name: "Founder Pass",
    type: "Optional digital collectible / NFT later",
    offer: "Early supporter badge, private reveals, whitelist for merch/book drops, and possible future mint.",
    capture: "email, wallet optional later, consent flags",
  },
];

export const contentPillars = [
  "Character reveals and signature lines",
  "Cinematic action/Fx test clips",
  "Doubles, humor, and Caribbean street culture moments",
  "Lore: sticks, lavway, drums, gayelle, memory",
  "Behind-the-scenes model sheets and style evolution",
  "Founder drops, polls, fan names, and community decisions",
  "Books, coloring pages, and printable art previews",
];

export const launchPlan = [
  { week: "Week 1", focus: "Foundation", output: "Landing page, email capture, founder art offer, first 10 character reveal posts" },
  { week: "Week 2", focus: "Organic volume", output: "Daily TikTok/Shorts/Reels, story blog launch, first downloadable lead magnet" },
  { week: "Week 3", focus: "Paid tests", output: "Meta lead ads, TikTok lead test, retargeting pools, 12 creative variants" },
  { week: "Week 4", focus: "Tribe conversion", output: "Founder pass waitlist, merch poll, book preview, community livestream/Q&A" },
  { week: "Week 5+", focus: "Scale winners", output: "Increase spend on winning hooks, launch merch drops, publish KDP teaser comic" },
];

export const growthMetrics = [
  { label: "Primary KPI", value: "emails", detail: "owned audience first" },
  { label: "Daily Posts", value: "3-5", detail: "TikTok, Shorts, Reels" },
  { label: "Paid Tests", value: "12", detail: "creative variants per cycle" },
  { label: "Lead Magnet", value: "3", detail: "art, lore, founder pass" },
];

export const complianceRules = [
  "Capture explicit email consent and source for every lead.",
  "Do not auto-publish ads or products without human approval.",
  "Do not promise NFT financial value; frame founder collectibles as access, art, and community.",
  "Keep youth/family-safe content and ad targeting rules in mind for animated entertainment.",
  "Every growth experiment must feed results back into shared memory for all agents.",
];

export const growthIcons = { Megaphone, Sparkles, BadgeCheck };
