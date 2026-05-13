import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export type AssetFile = {
  name: string;
  path: string;
  publicUrl: string;
  type: "image" | "video" | "audio" | "other";
  sizeBytes: number;
  sizeLabel: string;
  folder: string;
};

export type AssetFolder = {
  folder: string;
  label: string;
  files: AssetFile[];
  totalFiles: number;
  totalSizeBytes: number;
};

const publicDir = path.join(process.cwd(), "public");

function fileType(name: string): AssetFile["type"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image";
  if (["mp4", "webm", "mov"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio";
  return "other";
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function scanFolder(folder: string, label: string): Promise<AssetFolder> {
  const fullPath = path.join(publicDir, "assets", folder);
  let files: AssetFile[] = [];

  try {
    const entries = await readdir(fullPath);
    const results = await Promise.all(
      entries.map(async (name) => {
        const filePath = path.join(fullPath, name);
        try {
          const info = await stat(filePath);
          if (!info.isFile()) return null;
          return {
            name,
            path: filePath,
            publicUrl: `/assets/${folder}/${name}`,
            type: fileType(name),
            sizeBytes: info.size,
            sizeLabel: sizeLabel(info.size),
            folder,
          } satisfies AssetFile;
        } catch {
          return null;
        }
      }),
    );
    files = results.filter((f): f is AssetFile => f !== null);
  } catch {
    /* folder may not exist */
  }

  const totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);

  return {
    folder,
    label,
    files,
    totalFiles: files.length,
    totalSizeBytes,
  };
}

export async function getAssetInventory() {
  const folders = await Promise.all([
    scanFolder("characters", "Character Sheets"),
    scanFolder("video", "Video Assets"),
    scanFolder("audio", "Audio / Narration"),
    scanFolder("flipbook", "Flipbook"),
    scanFolder("exports/shorts", "Exports — Shorts"),
    scanFolder("exports/tiktok", "Exports — TikTok"),
    scanFolder("exports/reels", "Exports — Reels"),
    scanFolder("storyboards", "Storyboards"),
  ]);

  const totalFiles = folders.reduce((sum, f) => sum + f.totalFiles, 0);
  const totalSizeBytes = folders.reduce((sum, f) => sum + f.totalSizeBytes, 0);

  return {
    folders: folders.filter((f) => f.totalFiles > 0 || ["characters", "video", "audio"].includes(f.folder)),
    totalFiles,
    totalSizeBytes,
    totalSizeLabel: sizeLabel(totalSizeBytes),
  };
}
