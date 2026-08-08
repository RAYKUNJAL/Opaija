import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export type FunnelProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  currency: "USD";
  description: string;
  type: "issue" | "membership" | "addon" | "merch";
  status: "ready" | "preorder" | "unavailable";
  assets: string[];
};

export type FunnelLead = {
  email: string;
  firstName: string;
  source: string;
  consent: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FunnelEvent = {
  id: string;
  event: string;
  ts: string;
  userId?: string;
  email?: string;
  metadata?: Record<string, unknown>;
};

export type FunnelOrder = {
  orderId: string;
  provider: "paypal";
  productId: string;
  amount: number;
  currency: "USD";
  status: "created" | "captured" | "failed" | "refunded" | "reversed" | "disputed" | "cancelled";
  email?: string;
  membershipToken?: string;
  createdAt: string;
  updatedAt: string;
  paypalOrderId?: string;
  captureId?: string;
  sourceRoute?: string;
};

export type FunnelMember = {
  token: string;
  email: string;
  plan: string;
  startedAt: string;
  lastActiveAt: string;
  source: string;
};

export type FunnelEntitlement = {
  entitlementId: string;
  productId: string;
  orderId: string;
  captureId: string;
  email?: string;
  status: "active" | "revoked";
  issuedAt: string;
  updatedAt: string;
  revokedAt?: string;
};

export type FunnelPayPalWebhookEvent = {
  eventId: string;
  eventType: string;
  orderId?: string;
  receivedAt: string;
};

export type FunnelPayPalWebhookEventResult = FunnelPayPalWebhookEvent & {
  duplicate: boolean;
};

export const funnelProducts: FunnelProduct[] = [
  {
    id: "issue-0-free",
    slug: "issue-0",
    name: "OPAIJA Founder Preview: The Tide Begins",
    price: 0,
    currency: "USD",
    description: "Free Founder Preview featuring the hero poster and a selection of character dossiers.",
    type: "issue",
    status: "ready",
    assets: [
      "/assets/video/opaija-hero-kai-strike-poster.jpg",
      "/assets/characters/kairo-kai-baptiste.png",
      "/assets/characters/mother-lall.png",
      "/assets/characters/asha-singh-baptiste.png",
    ],
  },
  {
    id: "tripwire-pass",
    slug: "tripwire",
    name: "OPAIJA Founder Digital Vault",
    price: 7,
    currency: "USD",
    description: "One-time Founder Digital Vault ZIP containing 10 character dossier PNGs, 2 OPAIJA motion-test MP4s, and the flipbook cover image, plus member voting. No full chapters are included.",
    type: "issue",
    status: "ready",
    assets: ["/api/funnel/download/tripwire"],
  },
  {
    id: "audio-bump",
    slug: "audio-bump",
    name: "Audio Soundtrack Bump",
    price: 2.99,
    currency: "USD",
    description: "Exclusive soundtrack + ambient drops + Kai drum pack.",
    type: "addon",
    status: "unavailable",
    assets: [],
  },
  {
    id: "founder-monthly",
    slug: "founder-monthly",
    name: "Founder Monthly",
    price: 9,
    currency: "USD",
    description: "Recurring founder pass for member rewards, monthly drops, and collector drops.",
    type: "membership",
    status: "preorder",
    assets: [],
  },
  {
    id: "founder-annual",
    slug: "founder-annual",
    name: "Founder Annual",
    price: 79,
    currency: "USD",
    description: "Founder annual pass, priority access, and one exclusive badge slot.",
    type: "membership",
    status: "preorder",
    assets: [],
  },
];

const BASE_DIR = path.join(process.cwd(), "data", "funnel");
const EVENTS_PATH = path.join(BASE_DIR, "events.json");
const LEADS_PATH = path.join(BASE_DIR, "leads.json");
const ORDERS_PATH = path.join(BASE_DIR, "orders.json");
const MEMBERS_PATH = path.join(BASE_DIR, "members.json");
const ENTITLEMENTS_PATH = path.join(BASE_DIR, "entitlements.json");
const PAYPAL_WEBHOOK_EVENTS_PATH = path.join(BASE_DIR, "paypal-webhook-events.json");

type JsonArrayFile<T> = T[];
const fileQueues = new Map<string, Promise<void>>();

function normalizeEmail(email?: string) {
  return (email ?? "").trim().toLowerCase();
}

function validateEmail(value: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error("A valid email is required.");
  }
}

async function withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = fileQueues.get(filePath) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  fileQueues.set(filePath, queued);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (fileQueues.get(filePath) === queued) fileQueues.delete(filePath);
  }
}

async function readListUnlocked<T>(filePath: string, fallback: T[]): Promise<T[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T[];
  } catch {
    // ignore
  }
  return fallback;
}

async function writeListUnlocked<T>(filePath: string, value: JsonArrayFile<T>): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf-8", flag: "wx" });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function readList<T>(filePath: string, fallback: T[]): Promise<T[]> {
  return withFileLock(filePath, () => readListUnlocked(filePath, fallback));
}

async function mutateList<T, R>(
  filePath: string,
  fallback: T[],
  mutation: (items: T[]) => { items: T[]; result: R },
): Promise<R> {
  return withFileLock(filePath, async () => {
    const current = await readListUnlocked(filePath, fallback);
    const { items, result } = mutation(current);
    await writeListUnlocked(filePath, items);
    return result;
  });
}

export function isProductPurchasable(product: FunnelProduct): boolean {
  return product.status === "ready" && (product.price === 0 || product.assets.length > 0);
}

export function getPurchasabilityError(product: FunnelProduct): string | null {
  if (product.status === "preorder") return "Product is not available for purchase while in preorder.";
  if (product.status !== "ready") return "Product is unavailable for purchase.";
  if (product.price > 0 && product.assets.length === 0) return "Paid product has no deliverable assets.";
  return null;
}

export async function listProducts() {
  return funnelProducts;
}

export async function upsertLead(payload: { email: string; firstName?: string; source?: string; consent?: boolean }) {
  const email = normalizeEmail(payload.email);
  validateEmail(email);

  return mutateList<FunnelLead, FunnelLead>(LEADS_PATH, [], (leads) => {
    const existing = leads.find((lead) => lead.email === email);
    const now = new Date().toISOString();
    const clean: FunnelLead = {
      email,
      firstName: (payload.firstName ?? "").trim(),
      source: payload.source ?? "site",
      consent: payload.consent ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return { items: [clean, ...leads.filter((lead) => lead.email !== email)], result: clean };
  });
}

export async function trackEvent(event: FunnelEvent | { event: string; userId?: string; email?: string; metadata?: Record<string, unknown> }) {
  const entry: FunnelEvent = {
    id: randomUUID(),
    event: event.event,
    ts: new Date().toISOString(),
    userId: event.userId,
    email: event.email ? normalizeEmail(event.email) : undefined,
    metadata: event.metadata,
  };
  return mutateList<FunnelEvent, FunnelEvent>(EVENTS_PATH, [], (events) => ({
    items: [entry, ...events],
    result: entry,
  }));
}

export async function getEvents() {
  return readList<FunnelEvent>(EVENTS_PATH, []);
}

export async function getKpiSnapshot() {
  const events = await getEvents();
  const leads = await readList<FunnelLead>(LEADS_PATH, []);
  const eventsByName = events.reduce<Record<string, number>>((acc, item) => {
    acc[item.event] = (acc[item.event] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalLeads: leads.length,
    eventsByName,
    tripwireRate:
      leads.length > 0
        ? Number(((eventsByName.tripwire_buy ?? 0) / ((eventsByName.lead_submit ?? leads.length) || 1)) * 100).toFixed(2)
        : 0,
    lastSeen: events[0]?.ts ?? null,
  };
}

export async function createOrder(payload: { productId: string; email?: string; route?: string; metadata?: Record<string, unknown> }) {
  const product = funnelProducts.find((item) => item.id === payload.productId || item.slug === payload.productId);
  if (!product) throw new Error("Unknown product.");
  const purchasabilityError = getPurchasabilityError(product);
  if (purchasabilityError) throw new Error(purchasabilityError);

  const orderId = `OPF-${randomUUID()}`;
  const entry: FunnelOrder = {
    orderId,
    provider: "paypal",
    productId: product.id,
    amount: product.price,
    currency: product.currency,
    status: "created",
    email: payload.email ? normalizeEmail(payload.email) : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceRoute: payload.route,
  };

  return mutateList<FunnelOrder, FunnelOrder>(ORDERS_PATH, [], (orders) => ({
    items: [entry, ...orders],
    result: entry,
  }));
}

export async function updateOrderCapture(orderId: string, result: { status: FunnelOrder["status"]; captureId?: string; paypalOrderId?: string }) {
  if (
    !(["created", "captured", "failed", "refunded", "reversed", "disputed", "cancelled"] as string[]).includes(
      result.status,
    )
  ) {
    throw new Error("Invalid order status.");
  }

  const order = await mutateList<FunnelOrder, FunnelOrder>(ORDERS_PATH, [], (orders) => {
    const orderIndex = orders.findIndex((item) => item.orderId === orderId);
    if (orderIndex < 0) throw new Error("Order not found.");
    const captureId = result.captureId ?? orders[orderIndex].captureId;
    if (result.status === "captured" && !captureId) throw new Error("A capture ID is required for captured orders.");

    const updated: FunnelOrder = {
      ...orders[orderIndex],
      ...result,
      updatedAt: new Date().toISOString(),
      captureId,
      paypalOrderId: result.paypalOrderId ?? orders[orderIndex].paypalOrderId,
    };
    const next = [...orders];
    next[orderIndex] = updated;
    return { items: next, result: updated };
  });

  if (order.status === "captured") await issueEntitlementForOrder(order.orderId);
  return order;
}

export async function findOrder(orderId: string) {
  const orders = await readList<FunnelOrder>(ORDERS_PATH, []);
  return orders.find((order) => order.orderId === orderId) ?? null;
}

export async function getOrderByProviderId(paypalOrderId: string) {
  const orders = await readList<FunnelOrder>(ORDERS_PATH, []);
  return orders.find((order) => order.paypalOrderId === paypalOrderId) ?? null;
}

export async function createMember(payload: { email: string; plan: string; source?: string }) {
  const email = normalizeEmail(payload.email);
  validateEmail(email);

  return mutateList<FunnelMember, FunnelMember>(MEMBERS_PATH, [], (members) => {
    const existing = members.find((member) => member.email === email);
    const now = new Date().toISOString();
    const member: FunnelMember = existing
      ? {
          ...existing,
          plan: payload.plan,
          lastActiveAt: now,
          source: payload.source ?? existing.source,
        }
      : {
          token: randomUUID(),
          email,
          plan: payload.plan,
          startedAt: now,
          lastActiveAt: now,
          source: payload.source ?? "site",
        };
    const next = existing ? members.map((item) => (item.email === email ? member : item)) : [member, ...members];
    return { items: next, result: member };
  });
}

export async function getMember(token: string) {
  return mutateList<FunnelMember, FunnelMember | null>(MEMBERS_PATH, [], (members) => {
    const existing = members.find((member) => member.token === token);
    if (!existing) return { items: members, result: null };
    const result = { ...existing, lastActiveAt: new Date().toISOString() };
    return {
      items: members.map((member) => (member.token === token ? result : member)),
      result,
    };
  });
}

export async function issueEntitlementForOrder(orderId: string): Promise<FunnelEntitlement> {
  const order = await findOrder(orderId);
  if (!order) throw new Error("Order not found.");
  if (order.status !== "captured") throw new Error("Entitlements require a captured order.");
  if (!order.captureId) throw new Error("Captured order has no capture ID.");
  const captureId = order.captureId;
  if (!funnelProducts.some((product) => product.id === order.productId)) throw new Error("Order product not found.");

  return mutateList<FunnelEntitlement, FunnelEntitlement>(ENTITLEMENTS_PATH, [], (entitlements) => {
    const existing = entitlements.find(
      (entitlement) => entitlement.orderId === order.orderId && entitlement.productId === order.productId,
    );
    if (existing) {
      if (existing.captureId !== order.captureId) throw new Error("Order entitlement is linked to a different capture.");
      return { items: entitlements, result: existing };
    }

    const now = new Date().toISOString();
    const entitlement: FunnelEntitlement = {
      entitlementId: `OPE-${randomUUID()}`,
      productId: order.productId,
      orderId: order.orderId,
      captureId,
      email: order.email,
      status: "active",
      issuedAt: now,
      updatedAt: now,
    };
    return { items: [entitlement, ...entitlements], result: entitlement };
  });
}

export async function getEntitlements() {
  return readList<FunnelEntitlement>(ENTITLEMENTS_PATH, []);
}

export async function findEntitlement(entitlementId: string) {
  const entitlements = await getEntitlements();
  return entitlements.find((entitlement) => entitlement.entitlementId === entitlementId) ?? null;
}

export async function findEntitlementsForOrder(orderId: string): Promise<FunnelEntitlement[]> {
  const entitlements = await getEntitlements();
  return entitlements.filter((entitlement) => entitlement.orderId === orderId);
}

export async function recordPayPalWebhookEvent(
  eventId: string,
  eventType: string,
  orderId?: string,
): Promise<FunnelPayPalWebhookEventResult> {
  const normalizedEventId = eventId.trim();
  const normalizedEventType = eventType.trim();
  if (!normalizedEventId) throw new Error("PayPal webhook event ID is required.");
  if (!normalizedEventType) throw new Error("PayPal webhook event type is required.");

  return mutateList<FunnelPayPalWebhookEvent, FunnelPayPalWebhookEventResult>(
    PAYPAL_WEBHOOK_EVENTS_PATH,
    [],
    (events) => {
      const existing = events.find((event) => event.eventId === normalizedEventId);
      if (existing) return { items: events, result: { ...existing, duplicate: true } };

      const event: FunnelPayPalWebhookEvent = {
        eventId: normalizedEventId,
        eventType: normalizedEventType,
        orderId,
        receivedAt: new Date().toISOString(),
      };
      return { items: [event, ...events], result: { ...event, duplicate: false } };
    },
  );
}

export async function getActiveEntitlementsForProduct(productId: string, email?: string) {
  const normalizedEmail = email ? normalizeEmail(email) : undefined;
  const entitlements = await getEntitlements();
  return entitlements.filter(
    (entitlement) =>
      entitlement.productId === productId &&
      entitlement.status === "active" &&
      (!normalizedEmail || entitlement.email === normalizedEmail),
  );
}

export async function revokeEntitlement(entitlementId: string) {
  return mutateList<FunnelEntitlement, FunnelEntitlement>(ENTITLEMENTS_PATH, [], (entitlements) => {
    const index = entitlements.findIndex((entitlement) => entitlement.entitlementId === entitlementId);
    if (index < 0) throw new Error("Entitlement not found.");
    if (entitlements[index].status === "revoked") return { items: entitlements, result: entitlements[index] };

    const now = new Date().toISOString();
    const revoked: FunnelEntitlement = {
      ...entitlements[index],
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    };
    const next = [...entitlements];
    next[index] = revoked;
    return { items: next, result: revoked };
  });
}

export async function getContentAsset(slug: string) {
  const product = funnelProducts.find((item) => item.slug === slug || item.id === slug);
  if (!product) return null;
  return {
    title: product.name,
    description: product.description,
    price: product.price,
    currency: product.currency,
    status: product.status,
    assets: product.assets,
  };
}
