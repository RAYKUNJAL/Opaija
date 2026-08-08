import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { queueLeadNurtureEmails } from "./emailLifecycle.js";

export type LeadSource = "website" | "meta" | "tiktok" | "youtube" | "blog" | "founder-drop" | "manual";

export type FanLeadInput = {
  email: string;
  firstName?: string;
  source?: LeadSource;
  favoriteCharacter?: string;
  interests?: string[];
  consent?: boolean;
  tags?: string[];
  shirtSize?: string;
  prizeCharacters?: string[];
  referredBy?: string;
  contestOptIn?: boolean;
  instagramHandle?: string;
  socialActions?: string[];
};

export type GrowthCampaignInput = {
  objective: "email-list" | "founder-drop" | "pilot-awareness" | "merch-drop" | "book-leads";
  channel: "meta" | "tiktok" | "youtube" | "organic" | "email" | "all";
  budget?: number;
  offer: string;
  landingPage?: string;
};

const leadPath = path.join(process.cwd(), "data", "growth", "fan-leads.json");
const referralPath = path.join(process.cwd(), "data", "growth", "referral-clicks.json");

export async function captureLead(input: FanLeadInput) {
  const lead = normalizeLead(input);
  const existing = await readLeads();
  const existingLead = existing.find((item) => item.email.toLowerCase() === lead.email.toLowerCase());
  const merged = existingLead
    ? {
        ...existingLead,
        ...lead,
        referralCode: existingLead.referralCode,
        createdAt: existingLead.createdAt,
        updatedAt: new Date().toISOString(),
      }
    : lead;
  const withoutDuplicate = existing.filter((item) => item.email.toLowerCase() !== lead.email.toLowerCase());
  const next = [...withoutDuplicate, merged];

  await mkdir(path.dirname(leadPath), { recursive: true });
  await writeFile(leadPath, JSON.stringify(next, null, 2), "utf8");
  const resend = await syncLeadToResend(merged);
  const lifecycle = merged.consent
    ? await queueLeadNurtureEmails({
        email: merged.email,
        firstName: merged.firstName,
        referralCode: merged.referralCode,
      })
    : { status: "skipped" as const, reason: "Explicit marketing consent is required." };

  return {
    status: "captured",
    leadCount: next.length,
    lead: {
      email: merged.email,
      source: merged.source,
      tags: merged.tags,
      consent: merged.consent,
      referralCode: merged.referralCode,
      referralLink: `/founders?ref=${merged.referralCode}`,
    },
    resend,
    lifecycle,
    nextActions: [
      "Process the durable email queue.",
      "Tag by source and interest.",
      "Add to founder/lead magnet segment.",
      "Feed source result into growth memory.",
    ],
  };
}

export async function listLeads() {
  const leads = await readLeads();
  return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getGrowthSummary() {
  const leads = await readLeads();
  const leaderboard = await getLeaderboard();
  const bySource = leads.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.source] = (acc[lead.source] ?? 0) + 1;
    return acc;
  }, {});

  return {
    leadCount: leads.length,
    contestOptIns: leads.filter((lead) => lead.contestOptIn).length,
    bySource,
    topReferrers: leaderboard.slice(0, 5),
  };
}

export async function trackReferralClick(code: string) {
  const cleanCode = normalizeCode(code);
  if (!cleanCode) throw new Error("A valid referral code is required.");
  const clicks = await readReferralClicks();
  clicks[cleanCode] = (clicks[cleanCode] ?? 0) + 1;
  await mkdir(path.dirname(referralPath), { recursive: true });
  await writeFile(referralPath, JSON.stringify(clicks, null, 2), "utf8");
  return { status: "tracked", code: cleanCode, clicks: clicks[cleanCode] };
}

export async function getLeaderboard() {
  const leads = await readLeads();
  const clicks = await readReferralClicks();
  const referrals = leads.reduce<Record<string, number>>((acc, lead) => {
    if (lead.referredBy) acc[lead.referredBy] = (acc[lead.referredBy] ?? 0) + 1;
    return acc;
  }, {});

  return leads
    .filter((lead) => lead.contestOptIn)
    .map((lead) => ({
      name: lead.firstName || lead.email.split("@")[0],
      email: maskEmail(lead.email),
      favoriteCharacter: lead.favoriteCharacter,
      referralCode: lead.referralCode,
      referralLink: `/founders?ref=${lead.referralCode}`,
      referrals: referrals[lead.referralCode] ?? 0,
      clicks: clicks[lead.referralCode] ?? 0,
      shirtSize: lead.shirtSize,
      prizeCharacters: lead.prizeCharacters,
      instagramHandle: lead.instagramHandle,
      socialActions: lead.socialActions,
    }))
    .sort((a, b) => b.referrals - a.referrals || b.clicks - a.clicks || a.name.localeCompare(b.name));
}

export function createGrowthCampaign(input: GrowthCampaignInput) {
  if (!input.offer?.trim()) throw new Error("offer is required.");

  return {
    status: "dry_run",
    objective: input.objective,
    channel: input.channel,
    offer: input.offer,
    budget: input.budget ?? 0,
    landingPage: input.landingPage ?? "/founders",
    campaignStructure: buildCampaignStructure(input),
    creativeAngles: [
      "First Caribbean anime world built with the community",
      "Get the founder-only character art drop",
      "Every island has a warrior. Every rhythm has a weapon.",
      "Meet the first Opaija Seed wielder before the pilot drops",
      "Vote on the next reveal and join the founder list",
    ],
    tracking: [
      "UTM source/channel/campaign on every link.",
      "Capture email consent and source.",
      "Create retargeting audiences from site visitors, video viewers, and form openers.",
      "Send qualified-lead feedback back into paid channels when provider integrations are active.",
    ],
  };
}

async function readLeads(): Promise<Array<ReturnType<typeof normalizeLead>>> {
  try {
    const raw = await readFile(leadPath, "utf8");
    return JSON.parse(raw) as Array<ReturnType<typeof normalizeLead>>;
  } catch {
    return [];
  }
}

async function readReferralClicks(): Promise<Record<string, number>> {
  try {
    const raw = await readFile(referralPath, "utf8");
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

function normalizeLead(input: FanLeadInput) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email ?? "")) {
    throw new Error("A valid email is required.");
  }

  const email = input.email.trim().toLowerCase();
  const referralCode = makeReferralCode(email);
  const referredBy = normalizeCode(input.referredBy ?? "");

  return {
    email,
    firstName: input.firstName?.trim() ?? "",
    source: input.source ?? "website",
    favoriteCharacter: input.favoriteCharacter ?? "",
    interests: input.interests ?? [],
    consent: input.consent === true,
    tags: Array.from(new Set(["opaija", input.source ?? "website", input.contestOptIn ? "viral-contest" : "", ...(input.tags ?? [])].filter(Boolean))),
    shirtSize: input.shirtSize ?? "",
    prizeCharacters: input.prizeCharacters ?? [],
    referredBy: referredBy === referralCode ? "" : referredBy,
    referralCode,
    contestOptIn: input.contestOptIn === true,
    instagramHandle: input.instagramHandle?.trim().replace(/^@/, "") ?? "",
    socialActions: input.socialActions ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function syncLeadToResend(lead: ReturnType<typeof normalizeLead>) {
  if (!lead.consent) {
    return { status: "skipped", reason: "Explicit marketing consent is required." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const segmentId = process.env.RESEND_SEGMENT_ID;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || (!segmentId && !audienceId)) {
    return { status: "skipped", reason: "RESEND_API_KEY and RESEND_SEGMENT_ID or RESEND_AUDIENCE_ID are required." };
  }

  const resend = new Resend(apiKey);
  const contactPayload = {
    email: lead.email,
    firstName: lead.firstName || undefined,
    unsubscribed: false,
    ...(segmentId ? { segments: [{ id: segmentId }] } : { audienceId: audienceId as string }),
  };
  const contact = await resend.contacts.create(contactPayload);

  if (contact.error) {
    return { status: "error", message: contact.error.message };
  }

  return { status: "synced", contactId: contact.data?.id };
}

function makeReferralCode(email: string) {
  const handle = email.split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "fan";
  const hash = createHash("sha1").update(email).digest("hex").slice(0, 6);
  return `${handle}-${hash}`;
}

function normalizeCode(code: string) {
  return code.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

function buildCampaignStructure(input: GrowthCampaignInput) {
  if (input.channel === "meta") {
    return [
      "Campaign: Opaija Founder List - Lead Generation",
      "Ad Set 1: Broad Caribbean/anime/animation interests",
      "Ad Set 2: Engaged video viewers retargeting",
      "Ad Set 3: Website visitors and email lookalike when available",
      "Ads: 3 hooks x 3 creatives x 2 CTAs",
    ];
  }

  if (input.channel === "tiktok") {
    return [
      "Organic daily test queue",
      "Spark Ads candidates from top organic posts",
      "Lead generation objective test",
      "Retarget viewers and profile visitors",
    ];
  }

  if (input.channel === "youtube") {
    return [
      "Shorts daily publishing queue",
      "Pilot trailer packaging",
      "Community posts after subscriber threshold",
      "Pinned comment and description email CTA",
    ];
  }

  return [
    "Owned landing page with email capture",
    "Daily short-form posting loop",
    "Lead magnet download",
    "Founder welcome sequence",
    "Retargeting and weekly creative optimization",
  ];
}
