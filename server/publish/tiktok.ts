import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

export type TikTokUploadInput = {
  videoPath: string;
  caption: string;
  hashtags?: string[];
  scheduledFor?: string;
  privacy?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
};

export type TikTokUploadResult = {
  videoId: string;
  url: string;
  status: "uploaded" | "mock";
  provider: "tiktok";
};

const INIT_ENDPOINT = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const STATUS_ENDPOINT = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

function hasTikTokCreds(): boolean {
  return Boolean(
    process.env.TIKTOK_ACCESS_TOKEN &&
      process.env.TIKTOK_CLIENT_KEY &&
      process.env.TIKTOK_OPEN_ID,
  );
}

export function isTikTokConfigured(): boolean {
  return hasTikTokCreds();
}

function buildCaption(caption: string, hashtags?: string[]): string {
  const tagBlock = (hashtags ?? [])
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .join(" ");
  const full = tagBlock ? `${caption}\n\n${tagBlock}` : caption;
  return full.length > 2200 ? full.slice(0, 2197) + "..." : full;
}

export async function uploadToTikTok(input: TikTokUploadInput): Promise<TikTokUploadResult> {
  const caption = buildCaption(input.caption, input.hashtags);

  if (!hasTikTokCreds()) {
    const mockId = `mock-tt-${Date.now().toString(36)}`;
    console.log(`[publish:tiktok] MOCK MODE — would upload ${input.videoPath}`);
    console.log(`[publish:tiktok]   caption=${caption.slice(0, 80)}...`);
    return {
      videoId: mockId,
      url: "https://tiktok.com/mock",
      status: "mock",
      provider: "tiktok",
    };
  }

  const fileStat = statSync(input.videoPath);
  const fileSize = fileStat.size;
  // TikTok recommends single-chunk upload <= 64MB; for production use chunked upload.
  const chunkSize = fileSize;

  // Step 1: Init upload
  const initRes = await fetch(INIT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: caption,
        privacy_level: input.privacy ?? "SELF_ONLY",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: fileSize,
        chunk_size: chunkSize,
        total_chunk_count: 1,
      },
    }),
  });

  if (!initRes.ok) {
    throw new Error(`TikTok init failed: ${initRes.status} ${await initRes.text()}`);
  }

  const initData = (await initRes.json()) as {
    data?: { publish_id?: string; upload_url?: string };
  };
  const uploadUrl = initData.data?.upload_url;
  const publishId = initData.data?.publish_id;
  if (!uploadUrl || !publishId) throw new Error("TikTok did not return upload URL.");

  // Step 2: PUT video bytes to upload URL
  const stream = createReadStream(input.videoPath);
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(fileSize),
      "Content-Range": `bytes 0-${fileSize - 1}/${fileSize}`,
    },
    // @ts-expect-error — duplex required for streaming bodies in undici
    duplex: "half",
    body: webStream,
  });

  if (!putRes.ok) {
    throw new Error(`TikTok upload PUT failed: ${putRes.status} ${await putRes.text()}`);
  }

  // Step 3: Poll for publish status (best-effort, returns publish_id either way)
  try {
    await fetch(STATUS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
  } catch {
    /* status polling is best-effort */
  }

  return {
    videoId: publishId,
    url: `https://www.tiktok.com/@${process.env.TIKTOK_OPEN_ID}/video/${publishId}`,
    status: "uploaded",
    provider: "tiktok",
  };
}
