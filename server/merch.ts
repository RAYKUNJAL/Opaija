export type MerchProvider = "mock" | "printful" | "printify";

export type MerchProductInput = {
  provider?: MerchProvider;
  title: string;
  artworkUrl: string;
  productType: "shirt" | "hoodie" | "poster" | "mug" | "sticker" | "book" | "other";
  description?: string;
  tags?: string[];
  publish?: boolean;
};

export function getMerchProvider(): MerchProvider {
  const provider = process.env.MERCH_PROVIDER?.toLowerCase();
  if (provider === "printful" || provider === "printify") return provider;
  return "mock";
}

export function createMerchDraft(input: MerchProductInput) {
  if (!input.title?.trim()) throw new Error("title is required.");
  if (!input.artworkUrl?.trim()) throw new Error("artworkUrl is required.");

  const provider = input.provider ?? getMerchProvider();

  return {
    status: "dry_run",
    provider,
    publishMode: input.publish ? "requested_publish_after_approval" : "draft_only",
    skuBase: slug(input.title),
    title: input.title,
    productType: input.productType,
    artworkUrl: input.artworkUrl,
    description: input.description ?? "",
    tags: input.tags ?? [],
    requiredNextSteps: providerSteps(provider),
    safety: [
      "Use transparent PNG for apparel when possible.",
      "Create draft products first; do not publish automatically until mockups and rights are approved.",
      "Validate artwork dimensions against the selected product blueprint/template.",
    ],
  };
}

function providerSteps(provider: MerchProvider) {
  if (provider === "printful") {
    return [
      "Fetch catalog product and variant IDs.",
      "Upload or provide hosted print file URL.",
      "Create mockup generator task.",
      "Create Sync Product / Sync Variants for API/manual store.",
      "Sync approved product to commerce storefront.",
    ];
  }

  if (provider === "printify") {
    return [
      "Upload image to Printify media library by URL or base64.",
      "Select blueprint ID, print provider ID, variants, placeholders, scale, and position.",
      "Create product in target shop.",
      "Keep as draft until mockups are approved.",
      "Publish selected fields to connected sales channel.",
    ];
  }

  return [
    "Prepare print-safe PNG.",
    "Choose Printful or Printify.",
    "Generate mockup and product draft.",
    "Approve before publishing.",
  ];
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
