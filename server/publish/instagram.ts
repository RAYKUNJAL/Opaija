// Instagram Reels publishing via Instagram Graph API.
// IMPORTANT: Instagram REQUIRES a publicly accessible HTTPS URL for the video.
// Local file paths will not work. In production, upload the MP4 to R2/S3/Cloudinary
// (or expose via ngrok/cloudflared tunnel) and pass the public URL as `videoUrl`.
// Mock mode below simulates the flow without requiring a public URL.

export type InstagramUploadInput = {
  videoUrl: string; // MUST be a publicly accessible HTTPS URL
  caption: string;
  hashtags?: string[];
  shareToFeed?: boolean;
};

export type InstagramUploadResult = {
  mediaId: string;
  permalink: string;
  status: "uploaded" | "mock";
  provider: "instagram";
};

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

function hasInstagramCreds(): boolean {
  return Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ID);
}

export function isInstagramConfigured(): boolean {
  return hasInstagramCreds();
}

function buildCaption(caption: string, hashtags?: string[]): string {
  const tagBlock = (hashtags ?? [])
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .join(" ");
  const full = tagBlock ? `${caption}\n\n${tagBlock}` : caption;
  // IG caption limit is 2200 chars, max 30 hashtags
  return full.length > 2200 ? full.slice(0, 2197) + "..." : full;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadToInstagram(
  input: InstagramUploadInput,
): Promise<InstagramUploadResult> {
  const caption = buildCaption(input.caption, input.hashtags);

  if (!hasInstagramCreds()) {
    const mockId = `mock-ig-${Date.now().toString(36)}`;
    console.log(`[publish:instagram] MOCK MODE — would publish reel`);
    console.log(`[publish:instagram]   videoUrl=${input.videoUrl}`);
    console.log(`[publish:instagram]   caption=${caption.slice(0, 80)}...`);
    return {
      mediaId: mockId,
      permalink: "https://instagram.com/mock",
      status: "mock",
      provider: "instagram",
    };
  }

  const businessId = process.env.INSTAGRAM_BUSINESS_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

  // Step 1: Create media container
  const containerRes = await fetch(`${GRAPH_BASE}/${businessId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: input.videoUrl,
      caption,
      share_to_feed: input.shareToFeed ?? true,
      access_token: accessToken,
    }),
  });

  if (!containerRes.ok) {
    throw new Error(`Instagram container failed: ${containerRes.status} ${await containerRes.text()}`);
  }
  const containerData = (await containerRes.json()) as { id?: string };
  const creationId = containerData.id;
  if (!creationId) throw new Error("Instagram returned no container id.");

  // Step 2: Poll status until FINISHED (or error / timeout)
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    const statusRes = await fetch(
      `${GRAPH_BASE}/${creationId}?fields=status_code&access_token=${accessToken}`,
    );
    if (!statusRes.ok) continue;
    const statusData = (await statusRes.json()) as { status_code?: string };
    if (statusData.status_code === "FINISHED") {
      ready = true;
      break;
    }
    if (statusData.status_code === "ERROR" || statusData.status_code === "EXPIRED") {
      throw new Error(`Instagram container ${statusData.status_code}`);
    }
  }
  if (!ready) throw new Error("Instagram container did not finish in time.");

  // Step 3: Publish container
  const publishRes = await fetch(`${GRAPH_BASE}/${businessId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
  });

  if (!publishRes.ok) {
    throw new Error(`Instagram publish failed: ${publishRes.status} ${await publishRes.text()}`);
  }

  const publishData = (await publishRes.json()) as { id?: string };
  const mediaId = publishData.id;
  if (!mediaId) throw new Error("Instagram publish returned no media id.");

  // Best-effort permalink fetch
  let permalink = `https://www.instagram.com/reel/${mediaId}/`;
  try {
    const permRes = await fetch(
      `${GRAPH_BASE}/${mediaId}?fields=permalink&access_token=${accessToken}`,
    );
    if (permRes.ok) {
      const permData = (await permRes.json()) as { permalink?: string };
      if (permData.permalink) permalink = permData.permalink;
    }
  } catch {
    /* ignore */
  }

  return {
    mediaId,
    permalink,
    status: "uploaded",
    provider: "instagram",
  };
}
