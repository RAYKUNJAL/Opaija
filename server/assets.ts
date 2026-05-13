import { readdir, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import express from "express";

type AssetRoot = {
  key: string;
  relativeRoot: string;
  category: string;
  deletable: boolean;
};

export type GeneratedAsset = {
  id: string;
  name: string;
  relativePath: string;
  category: string;
  size: number;
  updatedAt: string;
  downloadable: boolean;
  deletable: boolean;
  downloadUrl: string;
};

type AssetIdPayload = {
  root: string;
  path: string;
};

const ASSET_ROOTS: AssetRoot[] = [
  { key: "out", relativeRoot: "out", category: "generated", deletable: true },
  { key: "voiceover", relativeRoot: path.join("public", "voiceover"), category: "voiceover", deletable: true },
  { key: "video", relativeRoot: path.join("public", "assets", "video"), category: "video", deletable: false },
  { key: "flipbook", relativeRoot: path.join("public", "assets", "flipbook"), category: "flipbook", deletable: false },
  { key: "characters", relativeRoot: path.join("public", "assets", "characters"), category: "characters", deletable: false },
];

const assetsRouter = express.Router();

assetsRouter.get("/", async (_request, response) => {
  try {
    response.json({ assets: await listGeneratedAssets() });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unable to list assets.",
    });
  }
});

assetsRouter.get("/:id/download", async (request, response) => {
  try {
    const resolved = await resolveAssetId(request.params.id);
    response.download(resolved.absolutePath, path.basename(resolved.absolutePath));
  } catch (error) {
    response.status(error instanceof AssetError ? error.status : 400).json({
      error: error instanceof Error ? error.message : "Unable to download asset.",
    });
  }
});

assetsRouter.delete("/:id", async (request, response) => {
  try {
    const resolved = await resolveAssetId(request.params.id);
    if (!resolved.root.deletable) {
      throw new AssetError("This asset cannot be deleted.", 403);
    }

    await rm(resolved.absolutePath, { force: false });
    response.status(204).send();
  } catch (error) {
    response.status(error instanceof AssetError ? error.status : 400).json({
      error: error instanceof Error ? error.message : "Unable to delete asset.",
    });
  }
});

export { assetsRouter };

async function listGeneratedAssets(): Promise<GeneratedAsset[]> {
  const assets = await Promise.all(ASSET_ROOTS.map((root) => listRootAssets(root)));
  return assets
    .flat()
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

async function listRootAssets(root: AssetRoot): Promise<GeneratedAsset[]> {
  const rootPath = getRootPath(root);

  try {
    const rootStat = await stat(rootPath);
    if (!rootStat.isDirectory()) return [];
  } catch {
    return [];
  }

  return walkRoot(root, rootPath, "");
}

async function walkRoot(root: AssetRoot, rootPath: string, relativeDirectory: string): Promise<GeneratedAsset[]> {
  const directoryPath = safeResolve(rootPath, relativeDirectory);
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const assets: GeneratedAsset[] = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;

    const entryRelativePath = toPosixPath(path.join(relativeDirectory, entry.name));

    if (entry.isDirectory()) {
      assets.push(...(await walkRoot(root, rootPath, entryRelativePath)));
      continue;
    }

    if (!entry.isFile()) continue;

    const absolutePath = safeResolve(rootPath, entryRelativePath);
    const fileStat = await stat(absolutePath);
    const relativePath = toPosixPath(path.join(root.relativeRoot, entryRelativePath));
    const id = encodeAssetId({ root: root.key, path: entryRelativePath });

    assets.push({
      id,
      name: entry.name,
      relativePath,
      category: root.category,
      size: fileStat.size,
      updatedAt: fileStat.mtime.toISOString(),
      downloadable: true,
      deletable: root.deletable,
      downloadUrl: `/api/assets/${encodeURIComponent(id)}/download`,
    });
  }

  return assets;
}

async function resolveAssetId(id: string) {
  const payload = decodeAssetId(id);
  const root = ASSET_ROOTS.find((candidate) => candidate.key === payload.root);
  if (!root) {
    throw new AssetError("Asset root is not allowed.", 404);
  }

  const rootPath = getRootPath(root);
  const absolutePath = safeResolve(rootPath, payload.path);
  const fileStat = await stat(absolutePath).catch(() => undefined);

  if (!fileStat?.isFile()) {
    throw new AssetError("Asset was not found.", 404);
  }

  await ensureRealPathInsideRoot(rootPath, absolutePath);

  return { root, absolutePath };
}

function getRootPath(root: AssetRoot) {
  return path.resolve(process.cwd(), root.relativeRoot);
}

function safeResolve(rootPath: string, relativePath: string) {
  if (path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new AssetError("Invalid asset path.", 400);
  }

  const normalizedPath = path.normalize(relativePath);
  if (normalizedPath === ".." || normalizedPath.startsWith(`..${path.sep}`)) {
    throw new AssetError("Invalid asset path.", 400);
  }

  const resolvedPath = path.resolve(rootPath, normalizedPath);
  const rootRelativePath = path.relative(rootPath, resolvedPath);
  if (rootRelativePath === ".." || rootRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(rootRelativePath)) {
    throw new AssetError("Invalid asset path.", 400);
  }

  return resolvedPath;
}

async function ensureRealPathInsideRoot(rootPath: string, assetPath: string) {
  const [realRootPath, realAssetPath] = await Promise.all([realpath(rootPath), realpath(assetPath)]);
  const rootRelativePath = path.relative(realRootPath, realAssetPath);

  if (rootRelativePath === ".." || rootRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(rootRelativePath)) {
    throw new AssetError("Asset path escapes its allowed root.", 400);
  }
}

function encodeAssetId(payload: AssetIdPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeAssetId(id: string): AssetIdPayload {
  try {
    const payload = JSON.parse(Buffer.from(id, "base64url").toString("utf8")) as Partial<AssetIdPayload>;

    if (typeof payload.root !== "string" || typeof payload.path !== "string" || !payload.path) {
      throw new Error("Invalid asset id.");
    }

    return { root: payload.root, path: toPosixPath(payload.path) };
  } catch {
    throw new AssetError("Invalid asset id.", 400);
  }
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

class AssetError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
