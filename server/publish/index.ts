import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { logPublishedContent, readQueue } from "../episodes.js";
import { isInstagramConfigured, uploadToInstagram } from "./instagram.js";
import { isTikTokConfigured, uploadToTikTok } from "./tiktok.js";
import { isYouTubeConfigured, uploadToYouTube } from "./youtube.js";

export type PublishPlatform = "youtube" | "tiktok" | "instagram";

export type PublishEpisodeInput = {
  episodeId: string;
  platforms: PublishPlatform[];
  aspect?: "9:16" | "16:9";
  videoPath?: string;
  publicVideoUrl?: string; // required for instagram in non-mock mode
};

export type PublishPlatformResult = {
  platform: PublishPlatform;
  success: boolean;
  mock: boolean;
  url?: string;
  externalId?: string;
  error?: string;
};

export type PublishResult = {
  episodeId: string;
  results: PublishPlatformResult[];
};

export type PublishConfig = {
  youtube: boolean;
  tiktok: boolean;
  instagram: boolean;
};

const STANDARD_HASHTAGS = [
  "Opaija",
  "CaribbeanAnime",
  "Trinidad",
  "Carnival",
  "Anime",
  "Doubles",
  "Diaspora",
  "BloodOfTheGayelle",
];

const DEFAULT_CTA = `\n\n— OPAIJA Studios —\nRhythm. Roots. Resistance.\nFollow @opa_ija for new episodes every week.\nhttps://opaija.com`;

export function getPublishConfig(): PublishConfig {
  return {
    youtube: isYouTubeConfigured(),
    tiktok: isTikTokConfigured(),
    instagram: isInstagramConfigured(),
  };
}

function loadCta(): string {
  const ctaPath = path.join(process.cwd(), "data", "publish", "cta-yt.txt");
  if (existsSync(ctaPath)) {
    try {
      return "\n\n" + readFileSync(ctaPath, "utf8").trim();
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_CTA;
}

function buildYouTubeTitle(episode: { id: string; title: string }): string {
  const epNum = episode.id.replace(/^EP/i, "").padStart(3, "0");
  const base = `OPAIJA EP${epNum}: ${episode.title} | Caribbean Anime`;
  return base.length > 100 ? base.slice(0, 97) + "..." : base;
}

function buildYouTubeDescription(
  episode: {
    id: string;
    title: string;
    hook?: string;
    cliffhanger?: string;
    characters?: string[];
  },
): string {
  const lines = [
    `EP${episode.id.replace(/^EP/i, "")}: ${episode.title}`,
    "",
    episode.hook ? `${episode.hook}` : "",
    "",
    episode.cliffhanger ? `Next: ${episode.cliffhanger}` : "",
    "",
    episode.characters?.length ? `Featuring: ${episode.characters.join(", ")}` : "",
    loadCta(),
  ];
  return lines.filter(Boolean).join("\n");
}

function buildSocialCaption(episode: {
  id: string;
  title: string;
  hook?: string;
}): string {
  const hookLine = episode.hook ?? `${episode.title} — a new chapter in the Gayelle.`;
  return `${hookLine}\n\nEP${episode.id.replace(/^EP/i, "")}: ${episode.title}`;
}

export async function publishEpisode(input: PublishEpisodeInput): Promise<PublishResult> {
  const queue = await readQueue();
  const episode = queue.episodes.find((ep) => ep.id === input.episodeId);
  if (!episode) {
    throw new Error(`Episode ${input.episodeId} not found in queue.`);
  }

  const videoPath =
    input.videoPath ?? path.join(process.cwd(), "out", `${input.episodeId}.mp4`);
  if (!existsSync(videoPath)) {
    throw new Error(
      `Video file not found at ${videoPath}. Run /api/episodes/${input.episodeId}/produce first, ` +
        `or pass an explicit videoPath in the request body.`,
    );
  }

  const tags = [...(episode.characters ?? []), ...STANDARD_HASHTAGS]
    .map((t) => t.replace(/\s+/g, ""))
    .filter(Boolean);

  const ytTitle = buildYouTubeTitle(episode);
  const ytDescription = buildYouTubeDescription({
    id: episode.id,
    title: episode.title,
    hook: episode.hook,
    cliffhanger: episode.cliffhanger,
    characters: episode.characters,
  });
  const socialCaption = buildSocialCaption({
    id: episode.id,
    title: episode.title,
    hook: episode.hook,
  });
  const aspect = input.aspect ?? "9:16";
  const isShort = aspect === "9:16";

  const platformPromises: Array<Promise<PublishPlatformResult>> = [];

  for (const platform of input.platforms) {
    if (platform === "youtube") {
      platformPromises.push(
        uploadToYouTube({
          videoPath,
          title: ytTitle,
          description: ytDescription,
          tags,
          isShort,
        })
          .then<PublishPlatformResult>((r) => ({
            platform: "youtube",
            success: true,
            mock: r.status === "mock",
            url: r.url,
            externalId: r.videoId,
          }))
          .catch((err): PublishPlatformResult => ({
            platform: "youtube",
            success: false,
            mock: false,
            error: err instanceof Error ? err.message : String(err),
          })),
      );
    } else if (platform === "tiktok") {
      platformPromises.push(
        uploadToTikTok({
          videoPath,
          caption: socialCaption,
          hashtags: STANDARD_HASHTAGS,
        })
          .then<PublishPlatformResult>((r) => ({
            platform: "tiktok",
            success: true,
            mock: r.status === "mock",
            url: r.url,
            externalId: r.videoId,
          }))
          .catch((err): PublishPlatformResult => ({
            platform: "tiktok",
            success: false,
            mock: false,
            error: err instanceof Error ? err.message : String(err),
          })),
      );
    } else if (platform === "instagram") {
      // IG needs a public URL. In mock mode any value works.
      const publicUrl =
        input.publicVideoUrl ??
        `${process.env.PUBLIC_SITE_URL ?? "https://opaija.com"}/episodes/${input.episodeId}.mp4`;
      platformPromises.push(
        uploadToInstagram({
          videoUrl: publicUrl,
          caption: socialCaption,
          hashtags: STANDARD_HASHTAGS,
        })
          .then<PublishPlatformResult>((r) => ({
            platform: "instagram",
            success: true,
            mock: r.status === "mock",
            url: r.permalink,
            externalId: r.mediaId,
          }))
          .catch((err): PublishPlatformResult => ({
            platform: "instagram",
            success: false,
            mock: false,
            error: err instanceof Error ? err.message : String(err),
          })),
      );
    }
  }

  const results = await Promise.all(platformPromises);

  // Log successes (including mocks) to CONTENT_LOG.json
  const PLATFORM_TO_LOG_KEY: Record<PublishPlatform, string> = {
    youtube: "youtube_shorts",
    tiktok: "tiktok",
    instagram: "instagram",
  };

  for (const r of results) {
    if (r.success) {
      try {
        await logPublishedContent({
          episodeId: input.episodeId,
          platform: PLATFORM_TO_LOG_KEY[r.platform],
          url: r.url,
        });
      } catch (err) {
        console.error(`[publish] Could not write CONTENT_LOG for ${r.platform}:`, err);
      }
    }
  }

  return {
    episodeId: input.episodeId,
    results,
  };
}
