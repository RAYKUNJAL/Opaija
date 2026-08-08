import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Resend } from "resend";

export type EmailQueueStatus = "queued" | "processing" | "sent" | "failed";
export type EmailQueueKind = "lead-welcome" | "lead-nurture" | "purchase-access";

export type EmailQueueRecord = {
  id: string;
  idempotencyKey: string;
  kind: EmailQueueKind;
  marketing: boolean;
  to: string;
  subject: string;
  html: string;
  status: EmailQueueStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leaseExpiresAt?: string;
  providerMessageId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
};

export type LeadNurtureEmailInput = {
  email: string;
  firstName?: string;
  referralCode: string;
};

export type PurchaseAccessEmailInput = {
  email: string;
  purchaseId?: string;
  orderId?: string;
  receiptNumber?: string;
  productName: string;
  accessUrl: string;
  amount?: string | number;
  currency?: string;
  customerName?: string;
};

type QueueState = {
  version: 1;
  emails: EmailQueueRecord[];
};

const queueDirectory = path.join(process.cwd(), "data", "email-lifecycle");
const queuePath = path.join(queueDirectory, "queue.json");
const lockPath = path.join(queueDirectory, "queue.lock");
const lockTimeoutMs = 10_000;
const staleLockMs = 30_000;
const processingLeaseMs = 5 * 60_000;
const defaultMaxAttempts = 6;

export async function queueLeadNurtureEmails(input: LeadNurtureEmailInput) {
  const email = normalizeEmail(input.email);
  const firstName = input.firstName?.trim() || "Opaija founder";
  const baseUrl = getBaseUrl();
  const referralLink = `${baseUrl}/?ref=${encodeURIComponent(input.referralCode)}#founders`;
  const links = preferenceLinks(email);
  const welcome = await enqueueEmail({
    idempotencyKey: stableKey("lead-welcome", email),
    kind: "lead-welcome",
    marketing: true,
    to: email,
    subject: "Welcome to the Opaija founder list",
    html: emailShell(`
      <h1 style="color:#f3a712">Welcome to Opaija</h1>
      <p>${escapeHtml(firstName)}, you are on the founder list. Every island has a warrior. Every rhythm has a weapon.</p>
      <p>Your referral link for the founder giveaway:</p>
      <p><a style="color:#67e8f9" href="${escapeHtml(referralLink)}">${escapeHtml(referralLink)}</a></p>
      <p>The top verified referrer wins a two-shirt character pack and a hand-signed original artwork.</p>
      ${marketingFooter(links)}
    `),
  });
  const nurture = await enqueueEmail({
    idempotencyKey: stableKey("lead-nurture-characters", email),
    kind: "lead-nurture",
    marketing: true,
    to: email,
    subject: "Meet the warriors shaping Opaija",
    html: emailShell(`
      <h1 style="color:#f3a712">The Opaija world is growing</h1>
      <p>${escapeHtml(firstName)}, founder-list members get the first character reveals, story drops, and community votes.</p>
      <p><a style="color:#67e8f9" href="${escapeHtml(baseUrl)}">Explore Opaija</a></p>
      ${marketingFooter(links)}
    `),
    nextAttemptAt: new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString(),
  });

  return { status: "queued" as const, emails: [welcome, nurture] };
}

export async function queuePurchaseAccessEmail(input: PurchaseAccessEmailInput) {
  const email = normalizeEmail(input.email);
  const transactionId = input.purchaseId?.trim() || input.orderId?.trim();
  if (!transactionId) throw new Error("purchaseId or orderId is required.");
  if (!input.productName?.trim()) throw new Error("productName is required.");
  const accessUrl = requireHttpUrl(input.accessUrl, "accessUrl");
  const receiptNumber = input.receiptNumber?.trim() || transactionId;
  const amount = input.amount === undefined
    ? ""
    : `${escapeHtml(input.currency?.trim() || "USD")} ${escapeHtml(String(input.amount))}`;
  const greeting = input.customerName?.trim() ? `Hi ${escapeHtml(input.customerName.trim())},` : "Hi,";

  return enqueueEmail({
    idempotencyKey: stableKey("purchase-access", transactionId, email),
    kind: "purchase-access",
    marketing: false,
    to: email,
    subject: `Your Opaija receipt and access: ${input.productName.trim()}`,
    html: emailShell(`
      <h1 style="color:#f3a712">Your purchase is ready</h1>
      <p>${greeting}</p>
      <p>Thank you for purchasing <strong>${escapeHtml(input.productName.trim())}</strong>.</p>
      <p>Receipt: <strong>${escapeHtml(receiptNumber)}</strong>${amount ? `<br>Amount: <strong>${amount}</strong>` : ""}</p>
      <p><a style="display:inline-block;background:#f3a712;color:#070707;padding:12px 18px;text-decoration:none;font-weight:bold" href="${escapeHtml(accessUrl)}">Access your purchase</a></p>
      <p>This transactional message provides your receipt and purchase access. It does not subscribe you to marketing.</p>
    `),
  });
}

export async function processDueEmails(options: { limit?: number; now?: Date } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return { status: "skipped" as const, reason: "RESEND_API_KEY and RESEND_FROM_EMAIL are required.", processed: 0, sent: 0, retried: 0, failed: 0 };
  }

  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 20)));
  const claimed = await claimDueEmails(now, limit);
  const resend = new Resend(apiKey);
  let sent = 0;
  let retried = 0;
  let failed = 0;

  for (const email of claimed) {
    try {
      const result = await resend.emails.send(
        { from, to: [email.to], subject: email.subject, html: email.html },
        { idempotencyKey: email.idempotencyKey },
      );
      if (result.error) throw new Error(result.error.message);
      await completeAttempt(email.id, { sent: true, providerMessageId: result.data?.id });
      sent += 1;
    } catch (error) {
      const outcome = await completeAttempt(email.id, { sent: false, error: errorMessage(error) });
      if (outcome === "failed") failed += 1;
      else retried += 1;
    }
  }

  return { status: "processed" as const, processed: claimed.length, sent, retried, failed };
}

async function enqueueEmail(input: Pick<EmailQueueRecord, "idempotencyKey" | "kind" | "marketing" | "to" | "subject" | "html"> & { nextAttemptAt?: string }) {
  return withQueueLock(async () => {
    const state = await readQueue();
    const existing = state.emails.find((email) => email.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
    const now = new Date().toISOString();
    const record: EmailQueueRecord = {
      ...input,
      id: randomUUID(),
      status: "queued",
      attempts: 0,
      maxAttempts: defaultMaxAttempts,
      nextAttemptAt: input.nextAttemptAt ?? now,
      createdAt: now,
      updatedAt: now,
    };
    state.emails.push(record);
    await writeQueueAtomic(state);
    return record;
  });
}

async function claimDueEmails(now: Date, limit: number) {
  return withQueueLock(async () => {
    const state = await readQueue();
    const nowMs = now.getTime();
    const due = state.emails
      .filter((email) => {
        const leaseExpired = email.status === "processing" && Date.parse(email.leaseExpiresAt ?? "") <= nowMs;
        return (email.status === "queued" || leaseExpired) && Date.parse(email.nextAttemptAt) <= nowMs;
      })
      .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt))
      .slice(0, limit);
    const ids = new Set(due.map((email) => email.id));
    const updatedAt = now.toISOString();
    state.emails = state.emails.map((email) => ids.has(email.id)
      ? { ...email, status: "processing", attempts: email.attempts + 1, leaseExpiresAt: new Date(nowMs + processingLeaseMs).toISOString(), updatedAt } as EmailQueueRecord
      : email);
    if (due.length) await writeQueueAtomic(state);
    return state.emails.filter((email) => ids.has(email.id));
  });
}

async function completeAttempt(id: string, result: { sent: true; providerMessageId?: string } | { sent: false; error: string }) {
  return withQueueLock(async () => {
    const state = await readQueue();
    const index = state.emails.findIndex((email) => email.id === id);
    if (index < 0) return "failed" as const;
    const current = state.emails[index];
    const now = new Date();
    if (result.sent) {
      state.emails[index] = { ...current, status: "sent", providerMessageId: result.providerMessageId, sentAt: now.toISOString(), updatedAt: now.toISOString(), leaseExpiresAt: undefined, lastError: undefined };
      await writeQueueAtomic(state);
      return "sent" as const;
    }
    const exhausted = current.attempts >= current.maxAttempts;
    state.emails[index] = {
      ...current,
      status: exhausted ? "failed" : "queued",
      nextAttemptAt: exhausted ? current.nextAttemptAt : new Date(now.getTime() + retryDelayMs(current.attempts)).toISOString(),
      updatedAt: now.toISOString(),
      leaseExpiresAt: undefined,
      lastError: result.error.slice(0, 1_000),
    };
    await writeQueueAtomic(state);
    return exhausted ? "failed" as const : "retried" as const;
  });
}

async function readQueue(): Promise<QueueState> {
  try {
    const raw = await readFile(queuePath, "utf8");
    const parsed = JSON.parse(raw) as QueueState;
    if (parsed.version !== 1 || !Array.isArray(parsed.emails)) throw new Error("Email queue data is invalid.");
    return parsed;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return { version: 1, emails: [] };
    throw error;
  }
}

async function writeQueueAtomic(state: QueueState) {
  await mkdir(queueDirectory, { recursive: true });
  const temporaryPath = `${queuePath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(JSON.stringify(state, null, 2), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, queuePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  await mkdir(queueDirectory, { recursive: true });
  const startedAt = Date.now();
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  while (!lock) {
    try {
      lock = await open(lockPath, "wx");
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error;
      const lockStat = await stat(lockPath).catch(() => undefined);
      if (lockStat && Date.now() - lockStat.mtimeMs > staleLockMs) {
        await unlink(lockPath).catch(() => undefined);
        continue;
      }
      if (Date.now() - startedAt >= lockTimeoutMs) throw new Error("Timed out waiting for the email queue lock.");
      await sleep(50);
    }
  }
  try {
    return await operation();
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => undefined);
  }
}

function preferenceLinks(email: string) {
  const subscriber = encodeURIComponent(email);
  const preferencesBase = process.env.EMAIL_PREFERENCES_URL ?? `${getBaseUrl()}/email/preferences`;
  const unsubscribeBase = process.env.EMAIL_UNSUBSCRIBE_URL ?? `${getBaseUrl()}/email/unsubscribe`;
  return {
    preferences: appendQuery(preferencesBase, `subscriber=${subscriber}`),
    unsubscribe: appendQuery(unsubscribeBase, `subscriber=${subscriber}`),
  };
}

function marketingFooter(links: { preferences: string; unsubscribe: string }) {
  return `<p style="margin-top:28px;font-size:12px;color:#c8c0b5">Manage <a style="color:#67e8f9" href="${escapeHtml(links.preferences)}">email preferences</a> or <a style="color:#67e8f9" href="${escapeHtml(links.unsubscribe)}">unsubscribe</a>.</p>`;
}

function emailShell(content: string) {
  return `<div style="font-family:Arial,sans-serif;background:#070707;color:#fff7e9;padding:28px">${content}</div>`;
}

function stableKey(...parts: string[]) {
  return `opaija-${createHash("sha256").update(parts.join("\u0000")).digest("hex")}`;
}

function normalizeEmail(email: string) {
  const normalized = email?.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized ?? "")) throw new Error("A valid email is required.");
  return normalized;
}

function requireHttpUrl(value: string, field: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(`${field} must be a valid HTTP URL.`);
  }
}

function getBaseUrl() {
  return (process.env.PUBLIC_SITE_URL ?? "https://opaija.com").replace(/\/$/, "");
}

function appendQuery(url: string, query: string) {
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

function retryDelayMs(attempt: number) {
  return Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
