import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import crypto from "node:crypto";
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAssetInventory } from "./assets.js";
import { createBookPacket, type BookPacketInput } from "./bookEngine.js";
import { runClaudeBrainTask, getClaudeBrainProvider, type BrainTaskInput as ClaudeBrainTaskInput } from "./claudeBrain.js";
import {
  readQueue,
  updateEpisodeStatus,
  saveEpisodeScript,
  readContentLog,
  logPublishedContent,
  readCanon,
  getEpisodeStoryFramework,
  getVideoPromptStoryLock,
  type EpisodeStatus,
} from "./episodes.js";
import {
  captureLead,
  createGrowthCampaign,
  getGrowthSummary,
  getLeaderboard,
  listLeads,
  trackReferralClick,
  type FanLeadInput,
  type GrowthCampaignInput,
} from "./growth.js";
import { addJob, listJobs, updateJob, getJob } from "./jobStore.js";
import { createMerchDraft, type MerchProductInput } from "./merch.js";
import { getBrainModel, getBrainProvider, runBrainTask, type BrainTaskInput } from "./openaiBrain.js";
import {
  createVideoJob,
  getFalJobResult,
  getFalJobStatus,
  getProvider,
  type VideoJobInput,
} from "./seedance.js";
import { createVoiceover, getVoiceProvider, type VoiceJobInput } from "./voice.js";
import {
  createMember,
  createOrder,
  findOrder,
  findEntitlementsForOrder,
  getContentAsset,
  getActiveEntitlementsForProduct,
  getEvents,
  getKpiSnapshot,
  getMember,
  getOrderByProviderId,
  listProducts,
  recordPayPalWebhookEvent,
  revokeEntitlement,
  trackEvent,
  type FunnelProduct,
  upsertLead,
  updateOrderCapture,
} from "./funnel.js";
import { queuePurchaseAccessEmail } from "./emailLifecycle.js";
import {
  buildBlogSitemap,
  createPost,
  getBlogScheduleSummary,
  getPostBySlug,
  listPosts,
  publishPost,
  schedulePost,
  type BlogPostStatus,
} from "./blog.js";
import { bookBuilderRouter } from "./bookBuilderRouter.js";
import { characterUniverseRouter } from "./characterUniverseRouter.js";
import {
  buildReplicateVideoInput,
  DEFAULT_VIDEO_MODEL_ID,
  getVideoModelDefinition,
  LTX_VIDEO_MODEL_ID,
  quoteVideoGeneration,
  reserveVideoSpend,
  settleVideoSpend,
  validateVideoSelection,
  videoStudioRouter,
  type VideoAspectRatio,
  type VideoResolution,
} from "./videoStudio.js";

dotenv.config();

// Ensure required data directories exist at startup
await mkdir(path.join(process.cwd(), "data", "shared-memory"), { recursive: true }).catch(() => {});
await mkdir(path.join(process.cwd(), "data"), { recursive: true }).catch(() => {});

const app = express();
const port = Number(process.env.PORT ?? 8787);

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? "https://opaija.com,https://www.opaija.com,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed."));
  },
  credentials: true,
}));
app.use(express.json({ limit: "30mb" }));
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// Keep the Book Builder API address stable when the dashboard is mounted at /command.
app.use((request, _response, next) => {
  if (request.url.startsWith("/command/api")) {
    request.url = request.url.replace(/^\/command\/api(?=\/|$)/, "/api");
  }
  next();
});

// ── AUTH ────────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const SESSION_SECRET = process.env.SESSION_SECRET ?? crypto.randomBytes(32).toString("hex");
if (process.env.NODE_ENV === "production" && (!ADMIN_PASSWORD || !process.env.SESSION_SECRET)) {
  throw new Error("Production requires ADMIN_PASSWORD and SESSION_SECRET.");
}
const SESSIONS_FILE = path.join(process.cwd(), "data", "shared-memory", "SESSIONS.json");

const SESSION_TTL_MS = Math.max(15 * 60_000, Number(process.env.ADMIN_SESSION_TTL_MS ?? 8 * 60 * 60_000));
const activeSessions = new Map<string, number>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
try {
  if (existsSync(SESSIONS_FILE)) {
    const data = JSON.parse(readFileSync(SESSIONS_FILE, "utf-8")) as { sessions?: Array<{ token: string; expiresAt: number }> };
    for (const session of data.sessions ?? []) {
      if (session.expiresAt > Date.now()) activeSessions.set(session.token, session.expiresAt);
    }
    console.log(`Restored ${activeSessions.size} admin sessions from disk`);
  }
} catch { /* ignore */ }

async function persistSessions(): Promise<void> {
  try {
    await mkdir(path.dirname(SESSIONS_FILE), { recursive: true });
    const sessions = Array.from(activeSessions, ([token, expiresAt]) => ({ token, expiresAt }))
      .filter((session) => session.expiresAt > Date.now());
    await writeFile(SESSIONS_FILE, JSON.stringify({ sessions }, null, 2), "utf-8");
  } catch { /* ignore */ }
}

function makeSessionToken(): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(crypto.randomBytes(32).toString("hex")).digest("hex");
}

function isAuthenticated(request: express.Request): boolean {
  if (!ADMIN_PASSWORD) return true;
  const token = request.headers["x-admin-session"] as string | undefined;
  if (!token) return false;
  const expiresAt = activeSessions.get(token) ?? 0;
  if (expiresAt <= Date.now()) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

const PUBLIC_BLOG_READ_ROUTES: string[] = [
  "/api/blog/posts",
];

function isPublicApiRoute(pathname: string, method: string): boolean {
  if (method === "GET" && ["/api/health", "/api/funnel/catalog", "/api/paypal/client-id", "/api/growth/leaderboard", "/api/blog/cadence", "/api/book-builder/health"].includes(pathname)) return true;
  if (method === "POST" && ["/api/growth/leads", "/api/funnel/lead", "/api/funnel/event", "/api/paypal/create-order", "/api/paypal/capture-order", "/api/paypal/webhook"].includes(pathname)) return true;
  if (method === "POST" && /^\/api\/growth\/referrals\/[a-z0-9-]+\/click$/.test(pathname)) return true;
  if (method === "GET" && /^\/api\/funnel\/member\/[a-f0-9-]+$/i.test(pathname)) return true;
  if (method === "GET" && /^\/api\/funnel\/content\/[a-z0-9-]+$/i.test(pathname)) return true;
  if (method === "GET" && /^\/api\/funnel\/download\/[a-z0-9-]+$/i.test(pathname)) return true;
  return false;
}

function isPublicBlogReadRoute(pathname: string, method: string): boolean {
  if (method !== "GET") return false;
  if (PUBLIC_BLOG_READ_ROUTES.some((route) => pathname === route)) return true;
  if (pathname.startsWith("/api/blog/posts/")) return true;
  return false;
}

function sanitizeRequestedBlogStatus(value: unknown): BlogPostStatus | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "draft" || normalized === "scheduled" || normalized === "published" || normalized === "archived") {
    return normalized;
  }
  return undefined;
}

app.use((request, response, next) => {
  if (!ADMIN_PASSWORD) return next(); // No password = open
  if (request.path.startsWith("/api/auth/")) return next();
  if (isPublicApiRoute(request.path, request.method)) return next();
  if (isPublicBlogReadRoute(request.path, request.method)) return next();
  if (request.method === "GET" && /^\/api\/character-universe\/characters\/[^/]+\/artwork\/[^/]+$/.test(request.path)) return next();
  if (request.path.startsWith("/api/") && !isAuthenticated(request)) {
    response.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
});

app.post("/api/auth/login", (request, response) => {
  const { password } = request.body as { password?: string };
  const attemptKey = request.ip || "unknown";
  const attempt = loginAttempts.get(attemptKey);
  if (attempt && attempt.resetAt > Date.now() && attempt.count >= 5) {
    response.status(429).json({ error: "Too many login attempts. Try again later." });
    return;
  }
  if (!ADMIN_PASSWORD) {
    response.json({ status: "open", message: "No ADMIN_PASSWORD set — auth disabled" });
    return;
  }
  if (!password || password !== ADMIN_PASSWORD) {
    const current = attempt && attempt.resetAt > Date.now() ? attempt : { count: 0, resetAt: Date.now() + 15 * 60_000 };
    loginAttempts.set(attemptKey, { ...current, count: current.count + 1 });
    response.status(401).json({ error: "Wrong password" });
    return;
  }
  const token = makeSessionToken();
  loginAttempts.delete(attemptKey);
  activeSessions.set(token, Date.now() + SESSION_TTL_MS);
  void persistSessions();
  response.json({ status: "ok", token });
});

app.post("/api/auth/logout", (request, response) => {
  const token = request.headers["x-admin-session"] as string | undefined;
  if (token) activeSessions.delete(token);
  void persistSessions();
  response.json({ status: "ok" });
});

app.get("/api/auth/check", (request, response) => {
  if (!ADMIN_PASSWORD) {
    response.json({ authenticated: true, authRequired: false });
    return;
  }
  response.json({ authenticated: isAuthenticated(request), authRequired: true });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "..", "dist");
const PAYPAL_ENVIRONMENT = (process.env.PAYPAL_ENVIRONMENT ?? "sandbox").toLowerCase();
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID ?? "";
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET ?? "";
const PAYPAL_BASE_URL =
  PAYPAL_ENVIRONMENT === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function getPayPalAccessToken(): Promise<string> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error("PayPal credentials are missing.");
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description ?? "Unable to get PayPal access token.");
  }
  return payload.access_token as string;
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    brainProvider: getBrainProvider(),
    brainModel: getBrainModel(),
    claudeProvider: getClaudeBrainProvider(),
    provider: getProvider(),
    voiceProvider: getVoiceProvider(),
    keys: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      fal: Boolean(process.env.FAL_KEY),
      replicate: Boolean(process.env.REPLICATE_API_TOKEN),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
      resend: Boolean(process.env.RESEND_API_KEY),
      printful: Boolean(process.env.PRINTFUL_API_KEY),
      printify: Boolean(process.env.PRINTIFY_API_KEY),
      paypal: Boolean(PAYPAL_CLIENT_ID),
    },
    publicSiteUrl: process.env.PUBLIC_SITE_URL ?? "",
    email: {
      provider: "resend",
      configured: Boolean(process.env.RESEND_API_KEY),
      configuredAudience: Boolean(process.env.RESEND_SEGMENT_ID || process.env.RESEND_AUDIENCE_ID),
      from: process.env.RESEND_FROM_EMAIL ?? "",
    },
    seedance: process.env.REPLICATE_API_TOKEN ? "configured" : "dry_run",
  });
});

app.use("/api/book-builder", bookBuilderRouter);
app.use("/api/character-universe", characterUniverseRouter);
app.use("/api/video-studio", videoStudioRouter);

app.post("/api/brain/tasks", async (request, response) => {
  try {
    const result = await runBrainTask(request.body as BrainTaskInput);
    response.json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to run OpenAI brain task.",
    });
  }
});

app.post("/api/voice/jobs", async (request, response) => {
  try {
    const result = await createVoiceover(request.body as VoiceJobInput);
    response.status(result.status === "dry_run" ? 200 : 201).json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to create voiceover.",
    });
  }
});

app.get("/api/jobs", async (request, response) => {
  try {
    const rawLimit = Number(request.query.limit ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    response.json(await listJobs(limit));
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Could not list jobs.",
    });
  }
});

app.post("/api/books/packets", (request, response) => {
  try {
    const packet = createBookPacket(request.body as BookPacketInput);
    response.json(packet);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to create book packet.",
    });
  }
});

app.post("/api/merch/drafts", (request, response) => {
  try {
    const draft = createMerchDraft(request.body as MerchProductInput);
    response.json(draft);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to create merch draft.",
    });
  }
});

app.post("/api/growth/leads", async (request, response) => {
  try {
    const lead = await captureLead(request.body as FanLeadInput);
    response.status(201).json(lead);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to capture lead.",
    });
  }
});

app.get("/api/growth/leads", async (_request, response) => {
  try {
    response.json(await listLeads());
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to list leads.",
    });
  }
});

app.get("/api/growth/summary", async (_request, response) => {
  try {
    response.json(await getGrowthSummary());
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to load growth summary.",
    });
  }
});

app.get("/api/growth/leaderboard", async (_request, response) => {
  try {
    response.json(await getLeaderboard());
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to load leaderboard.",
    });
  }
});

app.post("/api/growth/referrals/:code/click", async (request, response) => {
  try {
    response.json(await trackReferralClick(request.params.code));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to track referral click.",
    });
  }
});

app.post("/api/growth/campaigns", (request, response) => {
  try {
    const campaign = createGrowthCampaign(request.body as GrowthCampaignInput);
    response.json(campaign);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to create growth campaign.",
    });
  }
});

// ── FOUNDER FUNNEL ROUTES ────────────────────────────────────────────────
app.get("/api/funnel/catalog", async (_request, response) => {
  try {
    const products = await listProducts();
    response.json(products);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to load funnel catalog.",
    });
  }
});

app.post("/api/funnel/lead", async (request, response) => {
  try {
    const lead = await upsertLead(request.body as { email: string; firstName?: string; source?: string; consent?: boolean });
    await trackEvent({
      event: "lead_submit",
      email: lead.email,
      metadata: { source: lead.source, firstName: lead.firstName },
    });
    response.status(201).json(lead);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to capture funnel lead." });
  }
});

app.post("/api/funnel/event", async (request, response) => {
  try {
    const payload = request.body as {
      event: string;
      userId?: string;
      email?: string;
      metadata?: Record<string, unknown>;
    };
    if (!payload.event) throw new Error("event is required.");
    const entry = await trackEvent(payload);
    response.status(201).json(entry);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to track event." });
  }
});

app.get("/api/funnel/kpi", async (_request, response) => {
  try {
    const events = await getEvents();
    const members = await getKpiSnapshot();
    response.json({ ...members, recentEvents: events.slice(0, 30) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unable to load funnel KPIs." });
  }
});

app.get("/api/funnel/member/:token", async (request, response) => {
  try {
    const member = await getMember(request.params.token);
    if (!member) {
      response.status(404).json({ error: "Member not found." });
      return;
    }
    response.json(member);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unable to load member." });
  }
});

app.get("/api/funnel/content/:slug", async (request, response) => {
  try {
    const slug = request.params.slug;
    const content = await getContentAsset(slug);
    if (!content) {
      response.status(404).json({ error: "Content not found." });
      return;
    }

    const token = typeof request.query.token === "string" ? request.query.token : "";
    const member = token ? await getMember(token) : null;
    const needsMember = content.price > 0;
    const product = (await listProducts()).find((item) => item.slug === slug || item.id === slug);
    const entitlements = member && product
      ? await getActiveEntitlementsForProduct(product.id, member.email)
      : [];
    const hasAccess = !needsMember || entitlements.length > 0;
    response.json({ ...content, needsMember, hasAccess, memberPlan: member?.plan ?? null });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unable to load content." });
  }
}
);

// ── BLOG & SEO ROUTES (2x/day launch system) ─────────────────────────────
app.get("/api/blog/posts", async (request, response) => {
  try {
    const isAuthed = isAuthenticated(request);
    const requestedStatus = sanitizeRequestedBlogStatus(request.query.status);
    const status = isAuthed ? requestedStatus : "published";
    const limit = Number(request.query.limit ?? 18);
    const posts = await listPosts({
      status,
      limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 50)) : undefined,
    });
    response.json(posts);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to load blog posts.",
    });
  }
});

app.get("/api/funnel/download/:slug", async (request, response) => {
  try {
    const token = typeof request.headers["x-member-token"] === "string" ? request.headers["x-member-token"] : "";
    const member = token ? await getMember(token) : null;
    const product = (await listProducts()).find((item) => item.slug === request.params.slug || item.id === request.params.slug);
    if (!member || !product) {
      response.status(401).json({ error: "Member access is required." });
      return;
    }
    const entitlements = await getActiveEntitlementsForProduct(product.id, member.email);
    if (entitlements.length === 0) {
      response.status(403).json({ error: "This purchase is not active for the member." });
      return;
    }
    if (product.slug !== "tripwire") {
      response.status(404).json({ error: "Download not found." });
      return;
    }
    const archivePath = path.join(process.cwd(), "data", "funnel", "opaija-founder-digital-vault.zip");
    if (!existsSync(archivePath)) {
      response.status(503).json({ error: "The vault archive is unavailable." });
      return;
    }
    response.download(archivePath, "opaija-founder-digital-vault.zip");
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to deliver the vault." });
  }
});

app.get("/api/blog/posts/:slug", async (request, response) => {
  try {
    const post = await getPostBySlug(request.params.slug);
    if (!post || (!isAuthenticated(request) && post.status !== "published")) {
      response.status(404).json({ error: "Blog post not found." });
      return;
    }
    response.json(post);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to load blog post.",
    });
  }
});

app.post("/api/blog/posts", async (request, response) => {
  try {
    const payload = request.body as {
      title: string;
      excerpt: string;
      body: string;
      tags?: string[];
      region?: string;
    };
    if (!payload.title?.trim() || !payload.excerpt?.trim() || !payload.body?.trim()) {
      response.status(400).json({ error: "title, excerpt, and body are required." });
      return;
    }
    const post = await createPost(payload);
    response.status(201).json(post);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to create blog post.",
    });
  }
});

app.get("/api/blog/schedule", async (_request, response) => {
  try {
    const summary = await getBlogScheduleSummary();
    response.json(summary);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to load schedule data.",
    });
  }
});

app.get("/api/blog/cadence", async (_request, response) => {
  try {
    const summary = await getBlogScheduleSummary();
    response.json({
      cadence: summary.cadence,
      postsPerWeek: summary.postsPerWeek,
      nextPublishAt: summary.nextPublishAt,
      publishedThisWeek: summary.publishedThisWeek,
      totalPublished: summary.totalPublished,
    });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to load cadence." });
  }
});

app.post("/api/blog/posts/:slug/schedule", async (request, response) => {
  try {
    const slug = request.params.slug;
    const publishAt = (request.body as { publishAt?: string }).publishAt;
    if (publishAt) {
      const parsed = new Date(publishAt);
      if (Number.isNaN(parsed.getTime())) {
        response.status(400).json({ error: "publishAt must be a valid ISO date." });
        return;
      }
    }
    const payload = await schedulePost(slug, publishAt);
    response.json(payload);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to schedule post.",
    });
  }
});

app.post("/api/blog/posts/:slug/publish", async (request, response) => {
  try {
    const slug = request.params.slug;
    const published = await publishPost(slug);
    response.json(published);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to publish post.",
    });
  }
});

app.get("/api/content-log", async (_request, response) => {
  try {
    response.json(await readContentLog());
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unable to load content log.",
    });
  }
});

app.post("/api/content-log", async (request, response) => {
  try {
    const { episodeId, platform, url, publishedAt } = request.body as {
      episodeId?: string;
      platform?: string;
      url?: string;
      publishedAt?: string;
    };
    if (!episodeId?.trim()) {
      response.status(400).json({ error: "episodeId is required." });
      return;
    }
    if (!platform?.trim()) {
      response.status(400).json({ error: "platform is required." });
      return;
    }
    if (publishedAt && Number.isNaN(new Date(publishedAt).getTime())) {
      response.status(400).json({ error: "publishedAt must be a valid ISO date." });
      return;
    }
    const payload = await logPublishedContent({
      episodeId: episodeId.trim(),
      platform: platform.trim(),
      url: url?.trim(),
      publishedAt,
    });
    response.status(201).json(payload);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to log content publication.",
    });
  }
});

app.get("/api/paypal/client-id", (_request, response) => {
  if (!PAYPAL_CLIENT_ID) {
    response.status(503).json({ error: "PayPal is not configured. Set PAYPAL_CLIENT_ID." });
    return;
  }
  response.json({ clientId: PAYPAL_CLIENT_ID, environment: PAYPAL_ENVIRONMENT });
});

app.post("/api/paypal/create-order", async (request, response) => {
  try {
    const { productId, email, route, metadata } = request.body as {
      productId?: string;
      email?: string;
      route?: string;
      metadata?: Record<string, unknown>;
    };
    if (!productId) throw new Error("productId is required.");
    const catalog = await listProducts();
    const product: FunnelProduct | null = catalog.find((item) => item.id === productId || item.slug === productId) ?? null;
    if (!product) {
      response.status(400).json({ error: "Unknown product." });
      return;
    }

    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      response.status(503).json({ error: "PayPal checkout is temporarily unavailable." });
      return;
    }
    const order = await createOrder({ productId, email, route, metadata });

    const accessToken = await getPayPalAccessToken();
    const siteRoot = process.env.PUBLIC_SITE_URL ?? `${request.protocol}://${request.get("host") ?? "localhost"}`;
    const returnUrl = new URL(`${siteRoot}/checkout`);
    returnUrl.searchParams.set("orderId", order.orderId);
    if (typeof email === "string") returnUrl.searchParams.set("email", email);
    if (typeof route === "string") returnUrl.searchParams.set("route", route);
    const cancelUrl = new URL(`${returnUrl.origin}/launch`);

    const createResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "PayPal-Request-Id": order.orderId,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: product.currency,
              value: product.price.toFixed(2),
            },
            description: product.name,
            custom_id: order.orderId,
            invoice_id: order.orderId,
          },
        ],
        application_context: {
          brand_name: "OPAIJA",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: returnUrl.toString(),
          cancel_url: cancelUrl.toString(),
        },
      }),
    });
    const payload = await createResponse.json();
    if (!createResponse.ok) {
      throw new Error(payload.message ?? "Unable to create PayPal order.");
    }

    await updateOrderCapture(order.orderId, {
      status: "created",
      paypalOrderId: payload.id,
    });

    const approveLink = Array.isArray(payload.links)
      ? payload.links.find((link: { rel: string; href: string }) => link.rel === "approve")?.href
      : null;

    await trackEvent({
      event: "paypal_order_created",
      email: order.email,
      metadata: { productId, paypalOrderId: payload.id, orderId: order.orderId },
    });
    response.json({
      status: "created",
      orderId: order.orderId,
      paypalOrderId: payload.id,
      amount: product.price,
      currency: product.currency,
      approveUrl: approveLink ?? null,
    });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to create PayPal order." });
  }
});

app.post("/api/paypal/capture-order", async (request, response) => {
  try {
    const { orderId, paypalOrderId, email } = request.body as {
      orderId?: string;
      paypalOrderId?: string;
      email?: string;
    };

    if (!orderId && !paypalOrderId) throw new Error("orderId or paypalOrderId is required.");

    let order = orderId ? await findOrder(orderId) : null;
    if (!order && paypalOrderId) order = await getOrderByProviderId(paypalOrderId);
    if (!order) {
      response.status(404).json({ error: "Order not found." });
      return;
    }
    if (order.status === "captured") {
      const existingProduct = (await listProducts()).find((item) => item.id === order.productId);
      const member = order.email && existingProduct?.price
        ? await createMember({ email: order.email, plan: existingProduct.slug, source: `paypal-capture-${order.paypalOrderId ?? order.orderId}` })
        : null;
      response.json({ status: "captured", order, member });
      return;
    }

    const catalog = await listProducts();
    const product = catalog.find((item) => item.id === order.productId) ?? null;
    if (!product) throw new Error("Product no longer available.");

    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      response.status(503).json({ error: "PayPal checkout is temporarily unavailable." });
      return;
    }

    const providerOrderId = order.paypalOrderId ?? "";
    if (!providerOrderId) throw new Error("No PayPal order id on record.");
    if (paypalOrderId && paypalOrderId !== providerOrderId) throw new Error("PayPal order does not match this checkout.");
    const accessToken = await getPayPalAccessToken();
    const captureResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${providerOrderId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "PayPal-Request-Id": `capture-${order.orderId}`,
      },
    });
    const payload = await captureResponse.json();
    if (!captureResponse.ok) {
      throw new Error(payload.message ?? "Unable to capture PayPal order.");
    }

    const purchaseUnit = payload.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];
    const captureId = capture?.id;
    const capturedValue = capture?.amount?.value;
    const capturedCurrency = capture?.amount?.currency_code;
    if (
      payload.id !== providerOrderId ||
      payload.status !== "COMPLETED" ||
      purchaseUnit?.custom_id !== order.orderId ||
      capture?.status !== "COMPLETED" ||
      !captureId ||
      capturedCurrency !== order.currency ||
      Number(capturedValue) !== Number(order.amount.toFixed(2))
    ) {
      await updateOrderCapture(order.orderId, { status: "failed", paypalOrderId: providerOrderId });
      throw new Error("PayPal settlement could not be verified.");
    }
    const payerEmail =
      order.email ??
      payload.payer?.email_address ??
      (payload.payment_source?.paypal?.email_address ?? null) ??
      email ??
      null;
    if (!payerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payerEmail))) {
      throw new Error("A valid buyer email is required to deliver access.");
    }

    const updated = await updateOrderCapture(order.orderId, {
      status: "captured",
      captureId,
      paypalOrderId: providerOrderId,
    });

    const member = product.price > 0
      ? await createMember({
          email: String(payerEmail),
          plan: product.slug,
          source: `paypal-capture-${providerOrderId}`,
        })
      : null;

    const siteRoot = process.env.PUBLIC_SITE_URL ?? `${request.protocol}://${request.get("host") ?? "localhost"}`;
    const accessUrl = member
      ? `${siteRoot}/member?token=${encodeURIComponent(member.token)}`
      : `${siteRoot}/checkout?orderId=${encodeURIComponent(order.orderId)}`;
    const emailDelivery = await queuePurchaseAccessEmail({
      email: String(payerEmail),
      orderId: order.orderId,
      receiptNumber: captureId,
      productName: product.name,
      accessUrl,
      amount: order.amount,
      currency: order.currency,
    });

    await trackEvent({ event: "tripwire_capture", email: order.email ?? String(payerEmail ?? ""), metadata: { productId: product.id, orderId: order.orderId, captureId } });
    response.json({ status: "captured", order: updated, member, emailDelivery: { status: emailDelivery.status } });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to capture PayPal order." });
  }
});

app.post("/api/paypal/webhook", async (request, response) => {
  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId || !PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      response.status(503).json({ error: "PayPal webhook verification is not configured." });
      return;
    }
    const requiredHeaders = {
      auth_algo: request.headers["paypal-auth-algo"],
      cert_url: request.headers["paypal-cert-url"],
      transmission_id: request.headers["paypal-transmission-id"],
      transmission_sig: request.headers["paypal-transmission-sig"],
      transmission_time: request.headers["paypal-transmission-time"],
    };
    if (Object.values(requiredHeaders).some((value) => typeof value !== "string" || !value)) {
      response.status(400).json({ error: "PayPal verification headers are missing." });
      return;
    }
    const accessToken = await getPayPalAccessToken();
    const verificationResponse = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        ...requiredHeaders,
        webhook_id: webhookId,
        webhook_event: request.body,
      }),
    });
    const verification = await verificationResponse.json();
    if (!verificationResponse.ok || verification.verification_status !== "SUCCESS") {
      response.status(400).json({ error: "PayPal webhook signature is invalid." });
      return;
    }

    const event = request.body as {
      id?: string;
      event_type?: string;
      resource?: {
        id?: string;
        supplementary_data?: { related_ids?: { order_id?: string } };
      };
    };
    if (!event.id || !event.event_type) {
      response.status(400).json({ error: "PayPal event id and type are required." });
      return;
    }
    const providerOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
    const order = providerOrderId ? await getOrderByProviderId(providerOrderId) : null;
    const recorded = await recordPayPalWebhookEvent(event.id, event.event_type, order?.orderId);
    if (recorded.duplicate) {
      response.json({ status: "duplicate" });
      return;
    }

    const lifecycleStatus: Record<string, "refunded" | "reversed" | "disputed" | "cancelled"> = {
      "PAYMENT.CAPTURE.REFUNDED": "refunded",
      "PAYMENT.CAPTURE.REVERSED": "reversed",
      "CUSTOMER.DISPUTE.CREATED": "disputed",
      "CHECKOUT.ORDER.CANCELLED": "cancelled",
    };
    const nextStatus = lifecycleStatus[event.event_type];
    if (order && nextStatus) {
      await updateOrderCapture(order.orderId, {
        status: nextStatus,
        paypalOrderId: order.paypalOrderId,
        captureId: order.captureId,
      });
      const entitlements = await findEntitlementsForOrder(order.orderId);
      await Promise.all(
        entitlements
          .filter((entitlement) => entitlement.status === "active")
          .map((entitlement) => revokeEntitlement(entitlement.entitlementId)),
      );
      await trackEvent({
        event: `paypal_${nextStatus}`,
        email: order.email,
        metadata: { orderId: order.orderId, paypalEventId: event.id },
      });
    }
    response.json({ status: "accepted" });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to process PayPal webhook." });
  }
});

// ── CLAUDE BRAIN ROUTES ──────────────────────────────────────────────────────
app.post("/api/claude/tasks", async (request, response) => {
  try {
    const input = request.body as ClaudeBrainTaskInput & { episodeId?: string };
    const result = await runClaudeBrainTask(input);
    await addJob({
      type: result.status === "dry_run" ? "brain" : "script",
      label: `${input.task}: ${input.brief?.slice(0, 60) ?? ""}`,
      status: result.status === "completed" ? "completed" : result.status === "dry_run" ? "dry_run" : "failed",
      provider: result.provider ?? "anthropic",
      episodeId: input.episodeId,
      outputText: result.output?.slice(0, 500),
    });
    response.json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to run Claude brain task.",
    });
  }
});

// ── EPISODE PRODUCTION ROUTES ─────────────────────────────────────────────────
app.get("/api/episodes", async (_request, response) => {
  try {
    response.json(await readQueue());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not read episode queue." });
  }
});

app.patch("/api/episodes/:id/status", async (request, response) => {
  try {
    const { status } = request.body as { status: EpisodeStatus };
    if (!status) throw new Error("status is required.");
    response.json(await updateEpisodeStatus(request.params.id, status));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not update episode status." });
  }
});

app.post("/api/episodes/:id/generate-script", async (request, response) => {
  try {
    const queue = await readQueue();
    const episode = queue.episodes.find((ep) => ep.id === request.params.id);
    if (!episode) {
      response.status(404).json({ error: `Episode ${request.params.id} not found.` });
      return;
    }

    const result = await runClaudeBrainTask({
      task: "episode-script",
      brief: `Generate full production script for ${episode.id}: ${episode.title}`,
      episodeContext: {
        episodeId: episode.id,
        title: episode.title,
        hook: episode.hook,
        conflict: episode.conflict,
        reveal: episode.reveal,
        escalation: episode.escalation,
        cliffhanger: episode.cliffhanger,
        doublesMoment: episode.doubles_moment,
        characters: episode.characters,
        location: episode.location,
        island: episode.island,
        villainPresence: episode.villain_presence,
        existingNarratorScript: episode.narrator_script,
        storyFramework: await getEpisodeStoryFramework(episode.id),
      },
    });

    // Normalize response shape: always { status, output, episodeId }
    let normalizedStatus: "completed" | "dry_run" | "failed" = "dry_run";
    let normalizedOutput = "";

    if (result.status === "completed" && result.output) {
      normalizedStatus = "completed";
      normalizedOutput = result.output;
      await saveEpisodeScript(episode.id, result.output);
    } else if (result.status === "dry_run") {
      normalizedStatus = "dry_run";
      normalizedOutput = `[DRY RUN] No ANTHROPIC_API_KEY set. Script for ${episode.id}: ${episode.title} would be generated here.`;
    } else {
      normalizedStatus = "failed";
      normalizedOutput = (result as { output?: string }).output ?? "Script generation returned no output.";
    }

    response.json({ status: normalizedStatus, output: normalizedOutput, episodeId: episode.id });
  } catch (error) {
    response.status(400).json({
      status: "failed",
      output: error instanceof Error ? error.message : "Script generation failed.",
      episodeId: request.params.id,
    });
  }
});

app.post("/api/episodes/:id/script", async (request, response) => {
  try {
    const { script, qaPass } = request.body as { script: string; qaPass?: boolean };
    if (!script?.trim()) throw new Error("script is required.");
    response.json(await saveEpisodeScript(request.params.id, script, qaPass));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not save script." });
  }
});

app.get("/api/episodes/:id/jobs", async (request, response) => {
  try {
    const allJobs = await listJobs(200);
    const episodeJobs = allJobs.filter((j) => j.episodeId === request.params.id);
    response.json(episodeJobs);
  } catch (error) {
    response.status(500).json({ error: "Could not get episode jobs." });
  }
});

// ── EPISODE CRUD: Create / Update / Delete ──────────────────────────────────

app.post("/api/episodes", async (request, response) => {
  try {
    const input = request.body as {
      id?: string;
      title: string;
      hook?: string;
      conflict?: string;
      reveal?: string;
      escalation?: string;
      cliffhanger?: string;
      characters?: string[];
      location?: string;
      island?: string;
      narrator_script?: string;
    };
    if (!input.title?.trim()) throw new Error("title is required.");

    const queue = await readQueue();
    const existingNums = queue.episodes.map((e: Record<string, unknown>) => (e.episode_num as number) ?? 0);
    const nextNum = (Math.max(...existingNums, 0) || 0) + 1;
    const epId = input.id?.trim() || `EP${String(nextNum).padStart(3, "0")}`;
    if (queue.episodes.some(e => e.id === epId)) {
      throw new Error(`Episode ${epId} already exists.`);
    }

    const newEp = {
      id: epId,
      episode_num: nextNum,
      title: input.title.trim(),
      status: "PLANNED" as const,
      priority: nextNum,
      hook: input.hook ?? "",
      conflict: input.conflict ?? "",
      reveal: input.reveal ?? "",
      escalation: input.escalation ?? "",
      cliffhanger: input.cliffhanger ?? "",
      characters: input.characters ?? [],
      location: input.location ?? "",
      island: input.island ?? "Trinidad",
      villain_presence: false,
      narrator_script: input.narrator_script ?? "",
      doubles_moment: "",
      major_beats: [] as string[],
      character_focus: input.characters ?? [],
    };
    queue.episodes.push(newEp as any);
    queue._meta["updated"] = new Date().toISOString().split("T")[0];
    const queuePath = path.join(process.cwd(), "data", "shared-memory", "QUEUE.json");
    await writeFile(queuePath, JSON.stringify(queue, null, 2), "utf8");
    response.status(201).json(newEp);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not create episode." });
  }
});

app.put("/api/episodes/:id", async (request, response) => {
  try {
    const updates = request.body as Record<string, unknown>;
    const queue = await readQueue();
    const ep = queue.episodes.find(e => e.id === request.params.id);
    if (!ep) throw new Error(`Episode ${request.params.id} not found.`);

    const allowed = [
      "title", "hook", "conflict", "reveal", "escalation", "cliffhanger",
      "characters", "location", "island", "narrator_script", "status",
      "doubles_moment", "major_beats", "character_focus", "villain_presence",
      "power_reveal", "story_arc_phase", "canonical_hook", "runtime_minutes",
      "villain_hint", "cliffhanger_type", "lavway_moment",
    ];
    for (const key of allowed) {
      if (key in updates) {
        (ep as Record<string, unknown>)[key] = updates[key];
      }
    }
    queue._meta["updated"] = new Date().toISOString().split("T")[0];
    const queuePath = path.join(process.cwd(), "data", "shared-memory", "QUEUE.json");
    await writeFile(queuePath, JSON.stringify(queue, null, 2), "utf8");
    response.json(ep);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not update episode." });
  }
});

app.delete("/api/episodes/:id", async (request, response) => {
  try {
    const queue = await readQueue();
    const idx = queue.episodes.findIndex(e => e.id === request.params.id);
    if (idx === -1) throw new Error(`Episode ${request.params.id} not found.`);
    const removed = queue.episodes.splice(idx, 1)[0];
    queue._meta["updated"] = new Date().toISOString().split("T")[0];
    const queuePath = path.join(process.cwd(), "data", "shared-memory", "QUEUE.json");
    await writeFile(queuePath, JSON.stringify(queue, null, 2), "utf8");
    response.json({ deleted: removed.id });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not delete episode." });
  }
});

// ── SCRIPT PARSER: split narration into beats ───────────────────────────────

app.post("/api/episodes/:id/parse-script", async (request, response) => {
  try {
    const queue = await readQueue();
    const ep = queue.episodes.find(e => e.id === request.params.id);
    if (!ep) throw new Error(`Episode ${request.params.id} not found.`);

    const script = (request.body as { script?: string })?.script ?? ep.narrator_script ?? "";
    if (!script.trim()) throw new Error("No script to parse. Write or generate a narrator script first.");
    const storyFramework = await getEpisodeStoryFramework(request.params.id);
    const videoStoryLock = getVideoPromptStoryLock();

    // Split into beats by double-newlines (paragraphs) or single sentences
    const paragraphs = script.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const beats = paragraphs.map((text, idx) => ({
      idx: idx + 1,
      text,
      durSec: Math.max(3, Math.min(10, text.length / 15)),
      startSec: 0,
      endSec: 0,
      characters: ep.characters ?? [],
      narrationStartWordIdx: 0,
      narrationEndWordIdx: 0,
    }));

    // Fix cumulative timings
    let cumTime = 0;
    for (const beat of beats) {
      beat.startSec = cumTime;
      beat.endSec = cumTime + beat.durSec;
      cumTime = beat.endSec;
    }

    // Save parsed.json
    const epDir = path.resolve(__dirname, "..", "public", "episodes", request.params.id);
    await mkdir(epDir, { recursive: true });
    const parsedPath = path.join(epDir, "parsed.json");
    await writeFile(parsedPath, JSON.stringify({
      episodeId: request.params.id,
      title: ep.title,
      runtimeSeconds: cumTime,
      location: ep.location ?? "",
      island: ep.island ?? "Trinidad",
      characters: ep.characters ?? [],
      villainPresence: false,
      narrationText: script,
      source: "dashboard",
      humanApproved: false,
      beats,
    }, null, 2), "utf8");

    // Also save prompts.json with auto-generated prompts
    const prompts = beats.map(beat => ({
      ...beat,
      prompt: `CANON ALIGNMENT: ${videoStoryLock} EPISODE: ${ep.id} - ${ep.title}. HOOK: ${ep.hook}. CONFLICT: ${ep.conflict}. REVEAL: ${ep.reveal}. ESCALATION: ${ep.escalation}. CLIFFHANGER: ${ep.cliffhanger}. STYLE: OPAIJA 2.5D Caribbean anime, clean hand-drawn ink, bright island palette, anime cinematography, rounded Afro-Caribbean faces, no generic fantasy armor. CAMERA: cinematic framing. CHARACTER: ${ep.characters?.join(", ") ?? "cast"} in scene. SETTING: ${ep.location ?? "Caribbean"}. TECHNICAL: vertical 9:16, no text overlay, ${beat.durSec.toFixed(0)}s clip. Scene: ${beat.text}`,
      negativePrompt: "3d render, photorealistic, realistic skin, sweat, uncanny valley, blurry, low quality, watermark, text overlay",
      referenceImageUrls: [],
      referenceImage: "",
      primaryCharacter: (ep.characters ?? [])[0] ?? "",
      mode: "text-to-video",
      storyFrameworkVersion: "opaija-cross-media-v1",
      storyFrameworkDigest: storyFramework.slice(0, 500),
    }));
    const promptsPath = path.join(epDir, "prompts.json");
    await writeFile(promptsPath, JSON.stringify(prompts, null, 2), "utf8");

    response.json({ episodeId: request.params.id, beatCount: beats.length, runtimeSeconds: cumTime, beats });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not parse script." });
  }
});

// ── BEAT EDITOR: update individual beat prompt ──────────────────────────────

app.put("/api/episodes/:id/beats/:beatIdx", async (request, response) => {
  try {
    const epId = request.params.id;
    const beatIdx = parseInt(request.params.beatIdx, 10);
    const { prompt, text, negativePrompt } = request.body as {
      prompt?: string; text?: string; negativePrompt?: string;
    };
    const promptsPath = path.resolve(__dirname, "..", "public", "episodes", epId, "prompts.json");
    if (!existsSync(promptsPath)) {
      response.status(404).json({ error: "No prompts.json found. Parse script first." });
      return;
    }
    const prompts = JSON.parse(await readFile(promptsPath, "utf8")) as Array<Record<string, unknown>>;
    const beat = prompts.find(b => (b as { idx: number }).idx === beatIdx);
    if (!beat) throw new Error(`Beat ${beatIdx} not found.`);
    if (prompt !== undefined) beat.prompt = prompt;
    if (text !== undefined) beat.text = text;
    if (negativePrompt !== undefined) beat.negativePrompt = negativePrompt;
    await writeFile(promptsPath, JSON.stringify(prompts, null, 2), "utf8");
    response.json(beat);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not update beat." });
  }
});

// ── TRAILER BUILDER ─────────────────────────────────────────────────────────

const trailerPath = path.join(process.cwd(), "data", "shared-memory", "TRAILER.json");

app.get("/api/trailer", async (_request, response) => {
  try {
    if (!existsSync(trailerPath)) {
      response.json({ title: "OPAIJA Season 1 Trailer", beats: [], status: "draft" });
      return;
    }
    response.json(JSON.parse(await readFile(trailerPath, "utf8")));
  } catch {
    response.json({ title: "OPAIJA Season 1 Trailer", beats: [], status: "draft" });
  }
});

app.post("/api/trailer", async (request, response) => {
  try {
    const input = request.body as {
      title?: string;
      beats?: Array<{
        episodeId: string;
        beatIdx: number;
        text: string;
        prompt?: string;
        durSec?: number;
      }>;
    };
    const trailer = {
      title: input.title ?? "OPAIJA Season 1 Trailer",
      beats: input.beats ?? [],
      status: "draft" as const,
      updatedAt: new Date().toISOString(),
    };
    await mkdir(path.dirname(trailerPath), { recursive: true });
    await writeFile(trailerPath, JSON.stringify(trailer, null, 2), "utf8");
    response.json(trailer);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not save trailer." });
  }
});

app.post("/api/trailer/render", async (request, response) => {
  try {
    const trailer = JSON.parse(await readFile(trailerPath, "utf8"));
    if (!trailer.beats?.length) throw new Error("No beats in trailer. Add beats first.");

    // Submit each beat as a video job
    const jobs: Array<{ beatIdx: number; jobId?: string; error?: string }> = [];
    for (const beat of trailer.beats) {
      try {
        const res = await fetch("http://localhost:8787/api/video/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: beat.prompt ?? beat.text,
            mode: "text-to-video",
            episodeId: `TRAILER`,
            label: `Trailer: ${beat.episodeId} Beat ${beat.beatIdx}`,
          }),
        });
        const data = await res.json();
        if (data.jobId) jobs.push({ beatIdx: beat.beatIdx, jobId: data.jobId });
        else jobs.push({ beatIdx: beat.beatIdx, error: data.error ?? "Unknown error" });
      } catch (e) {
        jobs.push({ beatIdx: beat.beatIdx, error: e instanceof Error ? e.message : "Failed" });
      }
    }
    response.json({ submitted: jobs.length, jobs });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not render trailer." });
  }
});

// ── SHOT LAB + REPLICATE INTEGRATION ─────────────────────────────────────────
// Replaces fal.ai with Replicate for both still-frame and video generation.
// LTX-Video: ~$0.05/clip (vs $1.22/clip on fal Seedance)
// Flux on Replicate: ~$0.003/image (vs $0.03 on fal)

const SHOTLAB_PUBLIC_ROOT = path.resolve(__dirname, "..", "public", "shotlab");
const SHOTLAB_STYLE_SUFFIX =
  "2D anime cel-shade, flat painterly Caribbean colors, hand-drawn line art, cinematic moody lighting. NOT 3D, NOT photorealistic.";

type ShotLabApproval = Record<string, string>;

async function shotlabDir(...parts: string[]): Promise<string> {
  const dir = path.join(SHOTLAB_PUBLIC_ROOT, ...parts);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function readApprovals(epId: string): Promise<ShotLabApproval> {
  const file = path.join(SHOTLAB_PUBLIC_ROOT, epId, "approvals.json");
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(await readFile(file, "utf-8")) as ShotLabApproval;
  } catch {
    return {};
  }
}

async function writeApprovals(epId: string, approvals: ShotLabApproval): Promise<void> {
  const dir = await shotlabDir(epId);
  await writeFile(path.join(dir, "approvals.json"), JSON.stringify(approvals, null, 2));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

async function downloadImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image (${res.status}) from ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

import Replicate from "replicate";
let _replicateClient: Replicate | null = null;
function getReplicateClient(): Replicate {
  const token = process.env.REPLICATE_API_TOKEN ?? "";
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN not configured. Get one at replicate.com/account/api-tokens");
  }
  if (!_replicateClient) _replicateClient = new Replicate({ auth: token });
  return _replicateClient;
}

// GET /api/shotlab/:epId/prompts — read prompts.json
app.get("/api/shotlab/:epId/prompts", async (request, response) => {
  const epId = request.params.epId;
  try {
    const promptsPath = path.resolve(__dirname, "..", "public", "episodes", epId, "prompts.json");
    if (existsSync(promptsPath)) {
      const beats = JSON.parse(await readFile(promptsPath, "utf-8")) as Array<{
        idx: number;
        prompt?: string;
        text?: string;
        referenceImage?: string;
        mode?: string;
        characters?: string[];
      }>;
      response.json({
        source: "prompts.json",
        beats: beats.map((b) => ({
          idx: b.idx,
          prompt: b.prompt ?? b.text ?? "",
          referenceImage: b.referenceImage,
          mode: b.mode,
          characters: b.characters,
        })),
      });
      return;
    }
    response.json({ source: "manual", beats: [] });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not read prompts." });
  }
});

// GET /api/shotlab/:epId — per-beat candidates + approvals
app.get("/api/shotlab/:epId", async (request, response) => {
  const epId = request.params.epId;
  try {
    const epRoot = path.join(SHOTLAB_PUBLIC_ROOT, epId);
    const approvals = await readApprovals(epId);
    const beats: Record<string, Array<{ file: string; url: string }>> = {};
    if (existsSync(epRoot)) {
      const { readdir: rd, stat } = await import("node:fs/promises");
      const beatDirs = await rd(epRoot);
      for (const entry of beatDirs) {
        const m = entry.match(/^beat-(\d+)$/);
        if (!m) continue;
        const beatIdx = m[1];
        const beatDir = path.join(epRoot, entry);
        const beatStat = await stat(beatDir);
        if (!beatStat.isDirectory()) continue;
        const files = (await rd(beatDir)).filter((f) => f.endsWith(".png")).sort();
        beats[beatIdx] = files.map((f) => ({
          file: f,
          url: `/shotlab/${epId}/${entry}/${f}`,
        }));
      }
    }
    response.json({ epId, beats, approvals });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not read shot lab." });
  }
});

// POST /api/shotlab/:epId/generate — generate Flux still-frames via Replicate
app.post("/api/shotlab/:epId/generate", async (request, response) => {
  const epId = request.params.epId;
  const { beatIdx, prompt, count: rawCount } = request.body as {
    beatIdx: number;
    prompt: string;
    count?: number;
  };
  if (typeof beatIdx !== "number" || !prompt?.trim()) {
    response.status(400).json({ error: "beatIdx (number) and prompt (string) are required." });
    return;
  }
  const count = Math.min(Math.max(rawCount ?? 2, 1), 4);

  const replicateToken = process.env.REPLICATE_API_TOKEN ?? "";
  if (!replicateToken) {
    response.status(400).json({ error: "REPLICATE_API_TOKEN not configured. Get one at replicate.com/account/api-tokens" });
    return;
  }

  try {
    const client = getReplicateClient();
    const fullPrompt = `${prompt.trim()} ${SHOTLAB_STYLE_SUFFIX}`;
    const beatDirName = `beat-${pad2(beatIdx)}`;
    const beatDir = await shotlabDir(epId, beatDirName);

    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      const output = await client.run("black-forest-labs/flux-dev", {
        input: {
          prompt: fullPrompt,
          aspect_ratio: "16:9",
          output_format: "png",
          output_quality: 90,
          num_outputs: 1,
        },
      });

      const imgUrl = Array.isArray(output) ? output[0] : String(output);
      if (!imgUrl) throw new Error(`Flux returned no image for candidate ${i + 1}`);
      const buf = await downloadImageBuffer(imgUrl);
      const fileName = `candidate-${i + 1}.png`;
      await writeFile(path.join(beatDir, fileName), buf);
      urls.push(`/shotlab/${epId}/${beatDirName}/${fileName}`);
    }

    response.json({ epId, beatIdx, count, urls, cost: count * 0.003 });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Shot lab generation failed.",
    });
  }
});

// POST /api/shotlab/:epId/approve — approve a candidate
app.post("/api/shotlab/:epId/approve", async (request, response) => {
  const epId = request.params.epId;
  const { beatIdx, file } = request.body as { beatIdx: number; file: string };
  if (typeof beatIdx !== "number" || !file?.trim()) {
    response.status(400).json({ error: "beatIdx (number) and file (string) are required." });
    return;
  }
  try {
    const beatDirName = `beat-${pad2(beatIdx)}`;
    const filePath = path.join(SHOTLAB_PUBLIC_ROOT, epId, beatDirName, file);
    if (!existsSync(filePath)) {
      response.status(404).json({ error: `Candidate file not found: ${file}` });
      return;
    }
    const approvals = await readApprovals(epId);
    approvals[String(beatIdx)] = file;
    await writeApprovals(epId, approvals);
    response.json({ epId, beatIdx, file, approvals });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not save approval." });
  }
});

// ── VIDEO JOBS (Replicate LTX-Video) ────────────────────────────────────────
// Replaces fal Seedance with Replicate LTX-Video (~$0.05/clip vs $1.22)

app.post("/api/video/jobs", async (request, response) => {
  try {
    const input = request.body as {
      prompt: string;
      negativePrompt?: string;
      mode?: string;
      referenceImage?: string;
      referenceImageUrl?: string;
      imageUrl?: string;
      durationSec?: number;
      duration?: number | string;
      resolution?: VideoResolution;
      aspectRatio?: VideoAspectRatio;
      generateAudio?: boolean;
      episodeId?: string;
      label?: string;
      modelId?: string;
      model?: "ltx-video" | "ltx-2.3-pro" | "seedance-2.0";
    };

    const prompt = input.prompt?.trim();
    if (!prompt) {
      response.status(400).json({ error: "prompt is required." });
      return;
    }

    const legacyModelId = input.model === "ltx-video" || input.model === "ltx-2.3-pro" ? LTX_VIDEO_MODEL_ID : DEFAULT_VIDEO_MODEL_ID;
    const modelId = input.modelId ?? legacyModelId;
    const model = getVideoModelDefinition(modelId);
    const duration = input.durationSec ?? Number(input.duration ?? (model.durations.values?.[0] ?? 6));
    const resolution = input.resolution ?? model.defaultResolution;
    const aspectRatio = input.aspectRatio ?? model.defaultAspectRatio;
    const generateAudio = input.generateAudio ?? model.defaultAudio;
    const selectionErrors = validateVideoSelection({ modelId, durationSec: duration, resolution, aspectRatio, generateAudio }).errors;
    if (selectionErrors.length) throw new Error(selectionErrors.join(" "));
    const referenceImage = input.referenceImage ?? input.referenceImageUrl ?? input.imageUrl;
    const label = input.label ?? `Video: ${prompt.slice(0, 60)}`;
    const replicateInput = buildReplicateVideoInput({ modelId, prompt, durationSec: duration, resolution, aspectRatio, generateAudio, image: referenceImage });
    const cost = quoteVideoGeneration({ modelId, durationSec: duration, resolution }).amount;

    const replicateToken = process.env.REPLICATE_API_TOKEN ?? "";
    if (!replicateToken) {
      const requestId = `mock-video-${Date.now()}`;
      const storedJob = await addJob({
        type: "video",
        label,
        status: "dry_run",
        provider: "mock",
        modelId,
        requestId,
        episodeId: input.episodeId,
        outputText: JSON.stringify({ prompt, input: replicateInput }),
        error: "REPLICATE_API_TOKEN not configured; saved as a dry-run video job for local testing.",
      });
      response.status(200).json({
        requestId,
        status: "dry_run",
        provider: "mock",
        modelId,
        jobId: storedJob.id,
        cost,
        quotedCost: cost,
        message: "Dry run saved. Add REPLICATE_API_TOKEN to submit live video renders.",
      });
      return;
    }

    const client = getReplicateClient();
    const prediction = await client.predictions.create({
      model: modelId,
      input: replicateInput,
    });

    const storedJob = await addJob({
      type: "video",
      label,
      status: "queued",
      provider: "replicate",
      modelId,
      requestId: prediction.id,
      episodeId: input.episodeId,
      outputText: prompt,
    });

    await reserveVideoSpend(input.episodeId, label, prediction.id, cost);

    response.status(202).json({
      requestId: prediction.id,
      status: "queued",
      provider: "replicate",
      modelId,
      jobId: storedJob.id,
      cost,
    });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to create video job.",
    });
  }
});
// GET /api/video/jobs/:requestId/status — poll Replicate prediction
app.get("/api/video/jobs/:requestId/status", async (request, response) => {
  try {
    if (request.params.requestId.startsWith("dryrun-video-") || request.params.requestId.startsWith("mock-video-")) {
      response.json({ status: "dry_run", videoUrl: null });
      return;
    }
    const client = getReplicateClient();
    const prediction = await client.predictions.get(request.params.requestId);

    const status = prediction.status;
    let mapped = "processing";
    if (status === "succeeded") mapped = "completed";
    else if (status === "failed" || status === "canceled") mapped = "failed";
    else if (status === "starting") mapped = "queued";

    const result: { status: string; videoUrl?: string; error?: string } = { status: mapped };
    if (status === "succeeded") {
      const output = prediction.output;
      result.videoUrl = Array.isArray(output) ? output[0] : (output as string);
    }
    if (status === "failed") {
      result.error = prediction.error?.toString() ?? "Generation failed";
    }

    const jobs = await listJobs(200);
    const storedJob = jobs.find((job) => job.requestId === request.params.requestId);
    if (storedJob) {
      await updateJob(storedJob.id, {
        status: mapped as "completed" | "failed" | "processing" | "queued",
        outputUrl: result.videoUrl,
        error: result.error,
        completedAt: mapped === "completed" || mapped === "failed" ? new Date().toISOString() : undefined,
      });
      if (mapped === "completed" || mapped === "failed") {
        await settleVideoSpend(storedJob.episodeId, storedJob.label, request.params.requestId, mapped);
      }
    }

    response.json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to fetch video status.",
    });
  }
});

// GET /api/video/jobs/:requestId/result — get completed video URL
app.get("/api/video/jobs/:requestId/result", async (request, response) => {
  try {
    if (request.params.requestId.startsWith("dryrun-video-") || request.params.requestId.startsWith("mock-video-")) {
      response.json({ status: "dry_run", videoUrl: null });
      return;
    }
    const client = getReplicateClient();
    const prediction = await client.predictions.get(request.params.requestId);

    if (prediction.status !== "succeeded") {
      response.status(202).json({ status: prediction.status, error: "Not completed yet" });
      return;
    }

    const output = prediction.output;
    const videoUrl = Array.isArray(output) ? output[0] : (output as string);
    response.json({ status: "completed", videoUrl });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to fetch video result.",
    });
  }
});

// POST /api/jobs/:id/poll — poll Replicate job and update status
app.post("/api/jobs/:id/poll", async (request, response) => {
  try {
    const job = await getJob(request.params.id);
    if (!job || !job.requestId) {
      response.status(404).json({ error: "Job not found or not pollable." });
      return;
    }

    if (job.provider === "mock" || job.status === "dry_run" || job.requestId.startsWith("mock-")) {
      response.json({ status: job.status, job });
      return;
    }

    const client = getReplicateClient();
    const prediction = await client.predictions.get(job.requestId);
    const repStatus = prediction.status;

    let mapped = "processing";
    if (repStatus === "succeeded") mapped = "completed";
    else if (repStatus === "failed" || repStatus === "canceled") mapped = "failed";
    else if (repStatus === "starting") mapped = "queued";

    const updated = await updateJob(job.id, {
      status: mapped as "completed" | "failed" | "processing" | "queued",
      completedAt: mapped === "completed" || mapped === "failed" ? new Date().toISOString() : undefined,
      outputUrl: repStatus === "succeeded"
        ? Array.isArray(prediction.output) ? prediction.output[0] : (prediction.output as string)
        : job.outputUrl,
      error: repStatus === "failed" ? prediction.error?.toString() ?? "Generation failed" : job.error,
    });

    const result: { status: string; job: typeof updated; videoUrl?: string } = {
      status: repStatus,
      job: updated,
    };
    if (repStatus === "succeeded") {
      const output = prediction.output;
      result.videoUrl = Array.isArray(output) ? output[0] : (output as string);
    }

    response.json(result);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not poll job." });
  }
});

app.get("/api/seo/sitemap.xml", async (_request, response) => {
  const base = process.env.PUBLIC_SITE_URL || "https://opaija.com";
  response.type("application/xml");
  response.send(await buildBlogSitemap(base));
});

app.get("/sitemap.xml", async (_request, response) => {
  const base = process.env.PUBLIC_SITE_URL || "https://opaija.com";
  response.type("application/xml");
  response.send(await buildBlogSitemap(base));
});

// Serve produced episodes + character assets (video files live outside dist)
app.use("/episodes", express.static(path.resolve(__dirname, "..", "public", "episodes")));
app.use("/assets/characters", express.static(path.resolve(__dirname, "..", "public", "assets", "characters")));
app.use("/assets/reader", express.static(path.resolve(__dirname, "..", "public", "assets", "reader")));
// Serve Shot Lab still-frame candidates (must be before the catch-all)
app.use("/shotlab", express.static(path.resolve(__dirname, "..", "public", "shotlab")));

// Vite builds the admin UI with /command/ as its base, so its assets must be
// served from the same subpath before the SPA catch-all handles navigation.
app.use("/command", express.static(distPath));
app.get("/command", (_request, response) => {
  response.redirect(301, "/command/");
});
app.get("/command/*", (_request, response) => {
  response.sendFile(path.join(distPath, "index.html"));
});

app.use(express.static(distPath));

app.get("*", (_request, response) => {
  response.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Opaija API listening on http://localhost:${port}`);
});

function requireModelId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("modelId query parameter is required.");
  }
  return value;
}
