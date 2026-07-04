import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

export type YouTubePrivacy = "private" | "public" | "unlisted";

export type YouTubeUploadInput = {
  videoPath: string;
  title: string;
  description: string;
  tags?: string[];
  scheduledFor?: string;
  isShort?: boolean;
  privacy?: YouTubePrivacy;
  categoryId?: string;
  madeForKids?: boolean;
};

export type YouTubeUploadResult = {
  videoId: string;
  url: string;
  status: "uploaded" | "mock";
  provider: "youtube";
};

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const UPLOAD_ENDPOINT =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

function hasYouTubeCreds(): boolean {
  return Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
      process.env.YOUTUBE_CLIENT_SECRET &&
      process.env.YOUTUBE_REFRESH_TOKEN,
  );
}

export function isYouTubeConfigured(): boolean {
  return hasYouTubeCreds();
}

async function getYouTubeAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID ?? "",
    client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN ?? "",
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`YouTube token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("YouTube returned no access_token.");
  return data.access_token;
}

export async function uploadToYouTube(input: YouTubeUploadInput): Promise<YouTubeUploadResult> {
  const privacy: YouTubePrivacy =
    input.privacy ??
    ((process.env.PUBLISH_PRIVACY_YT as YouTubePrivacy | undefined) ?? "private");

  const isShort = input.isShort ?? true;
  const description = isShort && !input.description.includes("#Shorts")
    ? `${input.description}\n\n#Shorts`
    : input.description;

  const title = input.title.length > 100 ? input.title.slice(0, 97) + "..." : input.title;

  if (!hasYouTubeCreds()) {
    const mockId = `mock-yt-${Date.now().toString(36)}`;
    console.log(`[publish:youtube] MOCK MODE — would upload ${input.videoPath}`);
    console.log(`[publish:youtube]   title=${title}`);
    console.log(`[publish:youtube]   privacy=${privacy} isShort=${isShort}`);
    console.log(`[publish:youtube]   tags=${(input.tags ?? []).join(",")}`);
    return {
      videoId: mockId,
      url: "https://youtube.com/mock",
      status: "mock",
      provider: "youtube",
    };
  }

  const accessToken = await getYouTubeAccessToken();
  const fileStat = statSync(input.videoPath);
  const fileSize = fileStat.size;

  const snippet = {
    snippet: {
      title,
      description,
      tags: input.tags ?? [],
      categoryId: input.categoryId ?? "24",
    },
    status: {
      privacyStatus: privacy,
      madeForKids: input.madeForKids ?? false,
      selfDeclaredMadeForKids: input.madeForKids ?? false,
      ...(input.scheduledFor ? { publishAt: input.scheduledFor } : {}),
    },
  };

  // Step 1: Initialize resumable upload session
  const initRes = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(fileSize),
    },
    body: JSON.stringify(snippet),
  });

  if (!initRes.ok) {
    throw new Error(`YouTube upload init failed: ${initRes.status} ${await initRes.text()}`);
  }

  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return resumable upload URL.");

  // Step 2: PUT the video bytes
  const stream = createReadStream(input.videoPath);
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(fileSize),
    },
    // @ts-expect-error — duplex is required for streaming bodies in undici
    duplex: "half",
    body: webStream,
  });

  if (!putRes.ok) {
    throw new Error(`YouTube file upload failed: ${putRes.status} ${await putRes.text()}`);
  }

  const result = (await putRes.json()) as { id?: string };
  if (!result.id) throw new Error("YouTube upload returned no video id.");

  return {
    videoId: result.id,
    url: `https://www.youtube.com/watch?v=${result.id}`,
    status: "uploaded",
    provider: "youtube",
  };
}
