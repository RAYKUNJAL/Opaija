import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type BlogPostStatus = "draft" | "scheduled" | "published" | "archived";

export type BlogPostMetadata = {
  locale: "en-TT";
  timezone: "America/Port_of_Spain";
  editorialKey: string;
  contentVersion: string;
  searchIntent: string;
  funnelStage: "discovery" | "consideration" | "conversion" | "retention";
  audience: string;
  geo: {
    primaryRegion: string;
    relevance: string;
  };
  seo: {
    primaryKeyword: string;
    secondaryKeywords: string[];
  };
  cro: {
    goal: string;
    cta: string;
  };
  schema: {
    type: "BlogPosting";
    inLanguage: "en-TT";
    contentLocation: string;
  };
  automation?: {
    slot: string;
    generatedAt: string;
  };
};

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  tags: string[];
  status: BlogPostStatus;
  imageUrl?: string;
  region?: string;
  seoTitle?: string;
  seoDescription?: string;
  metadata?: BlogPostMetadata;
  createdAt: string;
  updatedAt: string;
  publishAt?: string;
  publishedAt?: string;
  source?: string;
};

export type BlogSeedPayload = {
  title: string;
  excerpt: string;
  body: string;
  tags?: string[];
  region?: string;
  source?: string;
};

export type BlogAutomationResult = {
  heartbeatAt: string;
  attempts: number;
  published: number;
  caughtUp: number;
  queued: number;
  scheduledTotal: number;
  nextPublishAt: string | null;
};

type AuditEventType =
  | "scheduled"
  | "published"
  | "catch_up"
  | "heartbeat"
  | "retry"
  | "failure";

type PublicationAuditEvent = {
  id: string;
  at: string;
  type: AuditEventType;
  postId?: string;
  slug?: string;
  scheduledFor?: string;
  attempt?: number;
  detail?: string;
};

type AutomationState = {
  lastHeartbeatAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
};

type EditorialRecipe = {
  key: string;
  subject: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  audience: string;
  region: string;
  searchIntent: string;
  funnelStage: BlogPostMetadata["funnelStage"];
  outcome: string;
  checklist: string[];
  caution: string;
  cta: string;
};

const BASE_DIR = path.join(process.cwd(), "data", "blog");
const POSTS_PATH = path.join(BASE_DIR, "posts.json");
const AUDIT_PATH = path.join(BASE_DIR, "publication-audit.json");
const STATE_PATH = path.join(BASE_DIR, "automation-state.json");
const TIME_ZONE = "America/Port_of_Spain";
const LOCALE = "en-TT";
const DAILY_SLOT_HOURS = [8, 20] as const;
const QUEUE_DAYS = 14;
const QUEUE_SLOTS = QUEUE_DAYS * DAILY_SLOT_HOURS.length;
const MAX_HISTORY = 240;
const MAX_AUDIT_EVENTS = 2_000;
const CONTENT_VERSION = "opaija-editorial-v1";

const EDITORIAL_CALENDAR: EditorialRecipe[] = [
  {
    key: "caribbean-anime-reading-guide",
    subject: "a Caribbean anime reading guide",
    primaryKeyword: "Caribbean anime stories",
    secondaryKeywords: ["Tobago storytelling", "independent comics", "anime-inspired fiction"],
    audience: "Readers looking for Caribbean-rooted anime-inspired stories",
    region: "Caribbean",
    searchIntent: "Discover culturally grounded anime-inspired reading",
    funnelStage: "discovery",
    outcome: "compare stories by premise, format, and cultural point of view before choosing what to read",
    checklist: ["Read the premise before judging the art style", "Look for clear issue or chapter order", "Check whether a free preview is available", "Choose the format that suits your reading habits"],
    caution: "Anime-inspired describes an influence, not a promise that every title follows the same genre conventions.",
    cta: "Read the available preview and decide whether the story is for you.",
  },
  {
    key: "tobago-story-worldbuilding",
    subject: "Tobago-inspired story worldbuilding",
    primaryKeyword: "Tobago fantasy worldbuilding",
    secondaryKeywords: ["Caribbean folklore fiction", "island fantasy", "cultural storytelling"],
    audience: "Fantasy readers and creators interested in island-rooted settings",
    region: "Tobago",
    searchIntent: "Understand how place can shape a fictional world",
    funnelStage: "discovery",
    outcome: "notice how landscape, language, memory, and everyday choices can make a setting feel specific",
    checklist: ["Separate documented history from invented lore", "Use place details in service of character and plot", "Avoid treating the Caribbean as one uniform culture", "Label interpretation and fiction clearly"],
    caution: "A fictional setting can draw inspiration from Tobago without presenting invented details as historical fact.",
    cta: "Explore the story preview and note which details make the world feel grounded.",
  },
  {
    key: "independent-comic-start-here",
    subject: "an independent comic start-here path",
    primaryKeyword: "how to start an independent comic series",
    secondaryKeywords: ["comic reading order", "free comic preview", "indie story guide"],
    audience: "First-time visitors who want a clear reading order",
    region: "Trinidad and Tobago",
    searchIntent: "Find the simplest entry point into a new series",
    funnelStage: "consideration",
    outcome: "move from an unfamiliar title to the right preview, issue, or update without guessing",
    checklist: ["Start with the official premise", "Use the published reading order", "Sample a preview before committing", "Subscribe only if the update format is useful"],
    caution: "Availability, pricing, and release timing should always be confirmed on the current product page.",
    cta: "Start with the free reading path before choosing a paid option.",
  },
  {
    key: "creator-update-evaluation",
    subject: "evaluating creator updates",
    primaryKeyword: "independent creator updates",
    secondaryKeywords: ["comic development updates", "creator transparency", "story production notes"],
    audience: "Readers deciding whether to follow an independent project",
    region: "Caribbean",
    searchIntent: "Evaluate whether project updates are useful and credible",
    funnelStage: "consideration",
    outcome: "distinguish concrete progress notes from vague promotion",
    checklist: ["Look for dated, specific deliverables", "Treat plans as plans until completed", "Prefer examples over unsupported superlatives", "Check the official page for current status"],
    caution: "Behind-the-scenes notes show process; they do not guarantee a release date or commercial result.",
    cta: "Follow the update channel that gives you the level of detail you want.",
  },
  {
    key: "reader-membership-checklist",
    subject: "a reader membership decision checklist",
    primaryKeyword: "comic reader membership",
    secondaryKeywords: ["creator membership value", "founding reader", "independent comic support"],
    audience: "Readers comparing free access with membership",
    region: "Trinidad and Tobago",
    searchIntent: "Decide whether a story membership fits a reader's needs",
    funnelStage: "conversion",
    outcome: "compare access, cadence, cancellation terms, and personal value before joining",
    checklist: ["Confirm exactly what is included", "Check billing and cancellation terms", "Compare the offer with the free path", "Join for current value rather than assumed future benefits"],
    caution: "Membership value is personal, and future content should not be treated as guaranteed unless the terms say so.",
    cta: "Review the current membership details and choose the free or paid path that fits.",
  },
  {
    key: "mobile-reading-experience",
    subject: "a better mobile comic reading experience",
    primaryKeyword: "read comics on mobile",
    secondaryKeywords: ["mobile story reading", "accessible comics", "comic page navigation"],
    audience: "Readers using phones or limited-bandwidth connections",
    region: "Caribbean",
    searchIntent: "Improve comic reading on a mobile device",
    funnelStage: "retention",
    outcome: "reduce friction caused by small text, heavy pages, and unclear navigation",
    checklist: ["Use the intended page orientation", "Increase text size when the reader supports it", "Load one section at a time on slower connections", "Keep your place using the available account or browser tools"],
    caution: "Device and connection performance vary, so readers should use the format that works reliably for them.",
    cta: "Open the preview on your usual device and test the reading experience.",
  },
  {
    key: "caribbean-character-design",
    subject: "Caribbean-rooted character design",
    primaryKeyword: "Caribbean character design",
    secondaryKeywords: ["anime-inspired characters", "cultural character design", "visual storytelling"],
    audience: "Readers and creators curious about culturally specific character design",
    region: "Caribbean",
    searchIntent: "Learn how context improves character design",
    funnelStage: "discovery",
    outcome: "read clothing, environment, gesture, and motivation as connected design choices",
    checklist: ["Begin with the character's role in the story", "Research specific cultural references", "Avoid mixing symbols without context", "Use visual details consistently across scenes"],
    caution: "No single design can represent the full Caribbean, which contains many distinct communities and histories.",
    cta: "Meet the characters through the official story preview.",
  },
  {
    key: "free-preview-value",
    subject: "using a free story preview well",
    primaryKeyword: "free comic preview",
    secondaryKeywords: ["sample independent comic", "read before buying", "story preview guide"],
    audience: "Readers who want to evaluate a story before paying",
    region: "Trinidad and Tobago",
    searchIntent: "Assess story fit through a free preview",
    funnelStage: "consideration",
    outcome: "evaluate tone, readability, pacing, and premise without pressure",
    checklist: ["Check whether the opening establishes a clear question", "Notice whether the format is comfortable to read", "Decide if the characters invite curiosity", "Use current product details for any purchase decision"],
    caution: "A preview is a sample, not a guarantee that every later chapter will have the same pace or emphasis.",
    cta: "Read the free preview, then continue only if it earns your interest.",
  },
  {
    key: "comic-gift-guide",
    subject: "choosing an independent comic as a gift",
    primaryKeyword: "Caribbean comic gift guide",
    secondaryKeywords: ["gift for anime reader", "independent comic gift", "Trinidad and Tobago creators"],
    audience: "Gift buyers shopping for anime and fantasy readers",
    region: "Trinidad and Tobago",
    searchIntent: "Choose an appropriate story gift",
    funnelStage: "conversion",
    outcome: "match the recipient's genre, format, and reading preferences before purchasing",
    checklist: ["Confirm the recipient likes the genre", "Choose digital or physical format deliberately", "Check current delivery and access terms", "Avoid assuming all anime fans want the same kind of story"],
    caution: "Stock, delivery areas, prices, and access methods can change and should be checked before payment.",
    cta: "Review the current format and delivery details before choosing the gift.",
  },
  {
    key: "reading-club-prompts",
    subject: "Caribbean fantasy reading-club prompts",
    primaryKeyword: "Caribbean fantasy book club questions",
    secondaryKeywords: ["comic discussion prompts", "anime story club", "island fantasy discussion"],
    audience: "Friends, classrooms, and reading groups discussing visual stories",
    region: "Caribbean",
    searchIntent: "Find thoughtful prompts for a group discussion",
    funnelStage: "retention",
    outcome: "move discussion beyond plot summary into character, setting, and point of view",
    checklist: ["Ask what each character wants", "Discuss how place changes the conflict", "Separate evidence in the story from personal interpretation", "Invite disagreement without requiring consensus"],
    caution: "Facilitators should adapt prompts for the group's age, context, and access needs.",
    cta: "Choose two prompts and use them after the group reads the preview.",
  },
  {
    key: "support-local-creators",
    subject: "practical ways to support Caribbean creators",
    primaryKeyword: "support Caribbean creators",
    secondaryKeywords: ["support independent comics", "Caribbean creative business", "share local stories"],
    audience: "Readers who want to support creative work responsibly",
    region: "Caribbean",
    searchIntent: "Find useful free and paid ways to support creators",
    funnelStage: "conversion",
    outcome: "choose support actions that match your budget and the creator's stated needs",
    checklist: ["Use official links", "Share a specific reason you recommend the work", "Leave an honest review where appropriate", "Pay only through a current, trusted checkout"],
    caution: "Support should be voluntary and proportionate; engagement is not a promise of financial return or project success.",
    cta: "Choose one useful action, free or paid, from the creator's current official page.",
  },
  {
    key: "safe-online-purchase",
    subject: "a safer independent-story checkout",
    primaryKeyword: "buy independent comics online safely",
    secondaryKeywords: ["secure creator checkout", "digital comic purchase", "online purchase checklist"],
    audience: "Readers preparing to buy directly from an independent creator",
    region: "Trinidad and Tobago",
    searchIntent: "Check the basics before an online purchase",
    funnelStage: "conversion",
    outcome: "confirm the seller, item, access method, and support route before paying",
    checklist: ["Use the official website", "Read the item and refund terms", "Confirm how digital or physical access is delivered", "Keep the transaction confirmation"],
    caution: "This checklist is general consumer guidance, not a guarantee against every payment or delivery problem.",
    cta: "Review the live checkout details and proceed only when they are clear.",
  },
  {
    key: "story-newsletter-choice",
    subject: "choosing a useful story newsletter",
    primaryKeyword: "independent comic newsletter",
    secondaryKeywords: ["creator email updates", "comic release alerts", "reader newsletter"],
    audience: "Readers deciding whether to subscribe for updates",
    region: "Caribbean",
    searchIntent: "Decide if an email update is worth subscribing to",
    funnelStage: "retention",
    outcome: "set expectations for frequency, usefulness, and control over your inbox",
    checklist: ["Check what kind of updates are promised", "Use an address you monitor", "Adjust preferences when available", "Unsubscribe if the updates stop being useful"],
    caution: "A newsletter can announce plans and releases, but plans may change and should be confirmed on the official site.",
    cta: "Subscribe only if the stated update format helps you follow the story.",
  },
  {
    key: "visual-story-accessibility",
    subject: "accessible visual-story publishing",
    primaryKeyword: "accessible digital comics",
    secondaryKeywords: ["comic alt text", "readable visual stories", "inclusive comic design"],
    audience: "Readers and creators interested in more usable visual stories",
    region: "Trinidad and Tobago",
    searchIntent: "Understand practical visual-story accessibility basics",
    funnelStage: "retention",
    outcome: "identify improvements in text clarity, navigation, alternatives, and device support",
    checklist: ["Use readable text contrast and size", "Provide meaningful alternatives where the platform allows", "Keep navigation predictable", "Test with keyboards, touch, and varied screen sizes"],
    caution: "Accessibility is an ongoing practice, and a short checklist does not replace testing with people who have diverse access needs.",
    cta: "Try the current reader and share specific accessibility feedback through the official contact route.",
  },
];

const ANGLES = [
  "A Practical Guide",
  "A Reader Checklist",
  "Questions to Ask First",
  "A Clear Start-to-Finish Path",
] as const;

const DEFAULT_STATE: AutomationState = {
  lastHeartbeatAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  consecutiveFailures: 0,
  lastError: null,
};

let storeTail: Promise<void> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = storeTail.then(operation, operation);
  storeTail = result.then(() => undefined, () => undefined);
  return result;
}

function toSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicWriteJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), { encoding: "utf-8", flag: "wx" });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function readPosts(): Promise<BlogPost[]> {
  const posts = await readJson<BlogPost[]>(POSTS_PATH, []);
  if (!Array.isArray(posts)) throw new Error("Blog posts store must contain an array.");
  return posts;
}

async function readAudit(): Promise<PublicationAuditEvent[]> {
  const audit = await readJson<PublicationAuditEvent[]>(AUDIT_PATH, []);
  if (!Array.isArray(audit)) throw new Error("Blog publication audit store must contain an array.");
  return audit;
}

function retainHistory(posts: BlogPost[]) {
  const scheduled = posts.filter((post) => post.status === "scheduled");
  const remaining = posts
    .filter((post) => post.status !== "scheduled")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, Math.max(0, MAX_HISTORY - scheduled.length));
  return [...scheduled, ...remaining];
}

async function writePosts(posts: BlogPost[]) {
  await atomicWriteJson(POSTS_PATH, retainHistory(posts));
}

async function writeAudit(audit: PublicationAuditEvent[]) {
  await atomicWriteJson(AUDIT_PATH, audit.slice(-MAX_AUDIT_EVENTS));
}

function auditEvent(type: AuditEventType, at: string, details: Omit<PublicationAuditEvent, "id" | "at" | "type"> = {}): PublicationAuditEvent {
  return { id: randomUUID(), at, type, ...details };
}

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function localDateKey(date: Date) {
  const { year, month, day } = zonedParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addLocalDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function zonedLocalTimeToUtc(dateKey: string, hour: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, 0, 0);
  let guess = desired;
  for (let index = 0; index < 4; index += 1) {
    const actual = zonedParts(new Date(guess));
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess -= represented - desired;
  }
  return new Date(guess);
}

function upcomingSlots(now: Date, count = QUEUE_SLOTS) {
  const slots: Array<{ at: string; localDate: string; localHour: number; key: string }> = [];
  const today = localDateKey(now);
  for (let dayOffset = 0; slots.length < count && dayOffset <= QUEUE_DAYS + 2; dayOffset += 1) {
    const localDate = addLocalDays(today, dayOffset);
    for (const localHour of DAILY_SLOT_HOURS) {
      const at = zonedLocalTimeToUtc(localDate, localHour);
      if (at.getTime() <= now.getTime()) continue;
      slots.push({ at: at.toISOString(), localDate, localHour, key: `${localDate}T${String(localHour).padStart(2, "0")}:00[${TIME_ZONE}]` });
      if (slots.length === count) break;
    }
  }
  return slots;
}

function findUniqueSlug(posts: BlogPost[], baseSlug: string, deterministicSuffix?: string) {
  const clean = toSlug(baseSlug);
  if (!posts.some((post) => post.slug === clean)) return clean;
  const suffix = deterministicSuffix ? toSlug(deterministicSuffix) : randomUUID().slice(0, 6);
  const candidate = `${clean}-${suffix}`.slice(0, 100);
  if (!posts.some((post) => post.slug === candidate)) return candidate;
  return `${candidate}-${randomUUID().slice(0, 6)}`.slice(0, 110);
}

function editorialIndex(slot: { localDate: string; localHour: number }) {
  const [year, month, day] = slot.localDate.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return dayNumber * DAILY_SLOT_HOURS.length + DAILY_SLOT_HOURS.indexOf(slot.localHour as (typeof DAILY_SLOT_HOURS)[number]);
}

function buildEditorialPost(posts: BlogPost[], slot: { at: string; localDate: string; localHour: number; key: string }, generatedAt: string): BlogPost {
  const index = editorialIndex(slot);
  const recipe = EDITORIAL_CALENDAR[((index % EDITORIAL_CALENDAR.length) + EDITORIAL_CALENDAR.length) % EDITORIAL_CALENDAR.length];
  const angle = ANGLES[Math.floor(index / EDITORIAL_CALENDAR.length) % ANGLES.length];
  const title = `${recipe.subject.replace(/^./, (character) => character.toUpperCase())}: ${angle}`;
  const excerpt = `A practical ${LOCALE} guide to help ${recipe.audience.toLowerCase()} ${recipe.outcome}.`;
  const body = [
    `Readers searching for **${recipe.primaryKeyword}** usually need a useful next step, not inflated promises. This guide helps you ${recipe.outcome}.`,
    `## Why this matters in ${recipe.region}`,
    `Local context improves relevance when it is specific and accurate. It should help a reader understand the setting, access path, or decision in front of them. It should never invent popularity, availability, cultural authority, customer results, or release claims.`,
    `## Practical checklist`,
    ...recipe.checklist.map((item) => `- ${item}.`),
    `## A careful decision rule`,
    recipe.caution,
    `When details can change, use the current official page as the source of truth. Compare the stated offer with your needs, and do not treat promotional language as independent evidence.`,
    `## Next step`,
    recipe.cta,
    `### Quick questions`,
    `**Who is this for?** ${recipe.audience}.`,
    `**What should I verify?** Current access, pricing, timing, and terms on the official page whenever they affect your decision.`,
    `**Does this article promise a result?** No. It offers a practical framework and clearly separates guidance from claims that would require evidence.`,
  ].join("\n\n");
  const metadata: BlogPostMetadata = {
    locale: LOCALE,
    timezone: TIME_ZONE,
    editorialKey: recipe.key,
    contentVersion: CONTENT_VERSION,
    searchIntent: recipe.searchIntent,
    funnelStage: recipe.funnelStage,
    audience: recipe.audience,
    geo: { primaryRegion: recipe.region, relevance: `Written for ${LOCALE} readers with specific ${recipe.region} context.` },
    seo: { primaryKeyword: recipe.primaryKeyword, secondaryKeywords: recipe.secondaryKeywords },
    cro: { goal: recipe.outcome, cta: recipe.cta },
    schema: { type: "BlogPosting", inLanguage: LOCALE, contentLocation: recipe.region },
    automation: { slot: slot.key, generatedAt },
  };
  return {
    id: randomUUID(),
    title,
    slug: findUniqueSlug(posts, title, `${slot.localDate}-${slot.localHour}`),
    excerpt,
    body,
    tags: ["opaija", "caribbean", "seo", "geo", "reader-guide", recipe.funnelStage, ...recipe.secondaryKeywords.map(toSlug)],
    status: "scheduled",
    imageUrl: "",
    region: recipe.region,
    seoTitle: `${title} | OPAIJA`.slice(0, 70),
    seoDescription: excerpt.slice(0, 160),
    metadata,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    publishAt: slot.at,
    source: "opaija-editorial-automation",
  };
}

function replenishQueue(posts: BlogPost[], now: Date, audit: PublicationAuditEvent[]) {
  const generatedAt = now.toISOString();
  const occupied = new Set(posts.filter((post) => post.status !== "archived" && post.publishAt).map((post) => post.publishAt as string));
  let queued = 0;
  for (const slot of upcomingSlots(now)) {
    if (occupied.has(slot.at)) continue;
    const post = buildEditorialPost(posts, slot, generatedAt);
    posts.push(post);
    occupied.add(slot.at);
    queued += 1;
    audit.push(auditEvent("scheduled", generatedAt, { postId: post.id, slug: post.slug, scheduledFor: post.publishAt, detail: slot.key }));
  }
  return queued;
}

function publishDue(posts: BlogPost[], now: Date, audit: PublicationAuditEvent[]) {
  const nowIso = now.toISOString();
  let published = 0;
  let caughtUp = 0;
  for (const post of posts) {
    if (post.status !== "scheduled" || !post.publishAt || new Date(post.publishAt).getTime() > now.getTime()) continue;
    const wasCatchUp = now.getTime() - new Date(post.publishAt).getTime() > 5 * 60_000;
    post.status = "published";
    post.publishedAt = nowIso;
    post.updatedAt = nowIso;
    published += 1;
    if (wasCatchUp) caughtUp += 1;
    audit.push(auditEvent(wasCatchUp ? "catch_up" : "published", nowIso, { postId: post.id, slug: post.slug, scheduledFor: post.publishAt, detail: wasCatchUp ? "Published after its slot during automation recovery." : "Published in its scheduled automation window." }));
  }
  return { published, caughtUp };
}

async function ensureQueueLocked(now: Date) {
  const posts = await readPosts();
  if (posts.length > 0) return posts;
  const audit = await readAudit();
  replenishQueue(posts, now, audit);
  await writePosts(posts);
  await writeAudit(audit);
  return posts;
}

function nextAvailableSlot(posts: BlogPost[], now: Date) {
  const occupied = new Set(posts.filter((post) => post.status !== "archived" && post.publishAt).map((post) => post.publishAt));
  const slot = upcomingSlots(now, QUEUE_SLOTS + 30).find((candidate) => !occupied.has(candidate.at));
  if (!slot) throw new Error("No collision-free blog publication slot is available.");
  return slot.at;
}

export async function listPosts(filter?: { status?: BlogPostStatus; limit?: number }) {
  return serialize(async () => {
    const posts = await ensureQueueLocked(new Date());
    const filtered = filter?.status ? posts.filter((post) => post.status === filter.status) : posts;
    const ordered = [...filtered].sort((a, b) => new Date(b.publishedAt ?? b.publishAt ?? b.updatedAt).getTime() - new Date(a.publishedAt ?? a.publishAt ?? a.updatedAt).getTime());
    return filter?.limit ? ordered.slice(0, filter.limit) : ordered;
  });
}

export async function getPostBySlug(slug: string) {
  return serialize(async () => (await ensureQueueLocked(new Date())).find((post) => post.slug === slug) ?? null);
}

export async function createPost(payload: BlogSeedPayload) {
  return serialize(async () => {
    const posts = await ensureQueueLocked(new Date());
    const now = new Date().toISOString();
    const post: BlogPost = {
      id: randomUUID(),
      title: payload.title,
      slug: findUniqueSlug(posts, payload.title),
      excerpt: payload.excerpt ?? "",
      body: payload.body ?? "",
      tags: (payload.tags ?? []).filter(Boolean),
      status: "draft",
      region: payload.region,
      seoTitle: `${payload.title} | OPAIJA`,
      seoDescription: payload.excerpt,
      createdAt: now,
      updatedAt: now,
      source: payload.source,
    };
    posts.push(post);
    await writePosts(posts);
    return post;
  });
}

export async function schedulePost(slug: string, publishAt?: string) {
  return serialize(async () => {
    const now = new Date();
    const posts = await ensureQueueLocked(now);
    const target = posts.find((post) => post.slug === slug);
    if (!target) throw new Error("Blog post not found.");
    const requestedAt = publishAt ? new Date(publishAt) : null;
    if (requestedAt && Number.isNaN(requestedAt.getTime())) throw new Error("Invalid blog publication date.");
    const scheduledAt = requestedAt?.toISOString() ?? nextAvailableSlot(posts.filter((post) => post.id !== target.id), now);
    const collision = posts.find((post) => post.id !== target.id && post.status !== "archived" && post.publishAt === scheduledAt);
    if (collision) throw new Error(`Blog publication slot is already occupied by ${collision.slug}.`);
    target.status = "scheduled";
    target.publishAt = scheduledAt;
    target.publishedAt = undefined;
    target.updatedAt = now.toISOString();
    await writePosts(posts);
    const audit = await readAudit();
    audit.push(auditEvent("scheduled", target.updatedAt, { postId: target.id, slug: target.slug, scheduledFor: scheduledAt, detail: "Scheduled manually." }));
    await writeAudit(audit);
    return target;
  });
}

export async function publishPost(slug: string) {
  return serialize(async () => {
    const posts = await ensureQueueLocked(new Date());
    const target = posts.find((post) => post.slug === slug);
    if (!target) throw new Error("Blog post not found.");
    const now = new Date().toISOString();
    target.status = "published";
    target.publishedAt = now;
    target.updatedAt = now;
    target.publishAt = target.publishAt ?? now;
    await writePosts(posts);
    const audit = await readAudit();
    audit.push(auditEvent("published", now, { postId: target.id, slug: target.slug, scheduledFor: target.publishAt, detail: "Published manually." }));
    await writeAudit(audit);
    return target;
  });
}

export async function publishDuePosts() {
  return serialize(async () => {
    const now = new Date();
    const posts = await ensureQueueLocked(now);
    const audit = await readAudit();
    const result = publishDue(posts, now, audit);
    if (result.published > 0) {
      await writePosts(posts);
      await writeAudit(audit);
    }
    return posts;
  });
}

async function automationAttempt(now: Date, attempt: number): Promise<BlogAutomationResult> {
  return serialize(async () => {
    const nowIso = now.toISOString();
    const posts = await readPosts();
    const audit = await readAudit();
    const state = await readJson<AutomationState>(STATE_PATH, DEFAULT_STATE);
    const publication = publishDue(posts, now, audit);
    const queued = replenishQueue(posts, now, audit);
    const scheduled = posts.filter((post) => post.status === "scheduled" && post.publishAt && new Date(post.publishAt).getTime() > now.getTime()).sort((a, b) => String(a.publishAt).localeCompare(String(b.publishAt)));
    const nextState: AutomationState = { ...state, lastHeartbeatAt: nowIso, lastSuccessAt: nowIso, consecutiveFailures: 0, lastError: null };
    audit.push(auditEvent("heartbeat", nowIso, { attempt, detail: `published=${publication.published}; caughtUp=${publication.caughtUp}; queued=${queued}; scheduled=${scheduled.length}` }));
    await writePosts(posts);
    await writeAudit(audit);
    await atomicWriteJson(STATE_PATH, nextState);
    return { heartbeatAt: nowIso, attempts: attempt, published: publication.published, caughtUp: publication.caughtUp, queued, scheduledTotal: scheduled.length, nextPublishAt: scheduled[0]?.publishAt ?? null };
  });
}

async function recordAutomationFailure(error: unknown, attempt: number) {
  return serialize(async () => {
    const at = new Date().toISOString();
    const detail = error instanceof Error ? error.message : String(error);
    const state = await readJson<AutomationState>(STATE_PATH, DEFAULT_STATE);
    const audit = await readAudit();
    const finalFailure = attempt >= 3;
    audit.push(auditEvent(finalFailure ? "failure" : "retry", at, { attempt, detail }));
    await writeAudit(audit);
    await atomicWriteJson(STATE_PATH, { ...state, lastHeartbeatAt: at, lastFailureAt: at, consecutiveFailures: state.consecutiveFailures + 1, lastError: detail });
  });
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function runBlogAutomation(options: { now?: Date | string; maxAttempts?: number; retryDelayMs?: number } = {}): Promise<BlogAutomationResult> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 5));
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? Number(process.env.BLOG_AUTOMATION_RETRY_MS ?? 750));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const now = options.now ? new Date(options.now) : new Date();
      if (Number.isNaN(now.getTime())) throw new Error("Invalid automation clock value.");
      return await automationAttempt(now, attempt);
    } catch (error) {
      lastError = error;
      await recordAutomationFailure(error, attempt).catch(() => undefined);
      if (attempt < maxAttempts && retryDelayMs > 0) await delay(retryDelayMs * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function getBlogScheduleSummary() {
  return serialize(async () => {
    const posts = await ensureQueueLocked(new Date());
    const upcoming = posts
      .filter((post) => post.status === "scheduled")
      .sort((a, b) => String(a.publishAt).localeCompare(String(b.publishAt)))
      .slice(0, 6)
      .map((post) => ({ title: post.title, slug: post.slug, publishAt: post.publishAt, status: post.status }));
    const publishedThisWeek = posts.filter((post) => post.status === "published" && new Date(post.publishedAt ?? post.updatedAt).getTime() >= Date.now() - 7 * 86_400_000).length;
    return {
      cadence: DAILY_SLOT_HOURS.map((hour) => `${String(hour).padStart(2, "0")}:00 ${TIME_ZONE}`),
      timezone: TIME_ZONE,
      queueDays: QUEUE_DAYS,
      postsPerWeek: DAILY_SLOT_HOURS.length * 7,
      nextPublishAt: upcoming[0]?.publishAt ?? null,
      upcoming,
      publishedThisWeek,
      totalPublished: posts.filter((post) => post.status === "published").length,
    };
  });
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function buildBlogSitemap(baseUrl: string) {
  const posts = await listPosts({ status: "published" });
  const lastmod = new Date().toISOString().slice(0, 10);
  const cleanBaseUrl = escapeXml(baseUrl.replace(/\/$/, ""));
  const staticRoutes = ["", "/launch", "/read-free", "/checkout", "/member", "/blog"];
  const postUrls = posts.map((post) => `<url><loc>${cleanBaseUrl}/blog/${escapeXml(post.slug)}</loc><lastmod>${escapeXml(post.publishedAt ?? lastmod)}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`);
  const staticXml = staticRoutes.map((route) => `<url><loc>${cleanBaseUrl}${route}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticXml}${postUrls.join("")}</urlset>`;
}
