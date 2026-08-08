import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type UniverseUse = "books" | "anime" | "games" | "marketing";

export type UniverseArtwork = {
  artworkId: string;
  fileName: string;
  label: string;
  source: "canonical" | "uploaded";
  artworkApiPath: string;
  createdAt: string;
  bytes: number;
};

export type UniverseCharacter = {
  characterId: string;
  name: string;
  aliases: string[];
  role: string;
  island: string;
  visualStyle: string;
  personality: string;
  powers: string;
  referencePrompt: string;
  tags: string[];
  uses: UniverseUse[];
  status: "active" | "development" | "archived";
  version: number;
  canonical: boolean;
  artwork: UniverseArtwork[];
  createdAt: string;
  updatedAt: string;
};

export type UniverseCharacterInput = Partial<Omit<UniverseCharacter, "characterId" | "version" | "canonical" | "artwork" | "createdAt" | "updatedAt">> & {
  name: string;
  imageData?: string;
  imageFileName?: string;
  imageLabel?: string;
};

const root = path.resolve(process.env.CHARACTER_UNIVERSE_STORAGE_PATH ?? path.join(process.cwd(), "data", "character-universe"));
const charactersRoot = path.join(root, "characters");

const canonicalSeed: Array<{ name: string; fileName: string; aliases?: string[]; role: string; island: string }> = [
  { name: 'Kairo "Kai" Baptiste', fileName: "kairo-kai-baptiste.png", aliases: ["Kai", "Kairo"], role: "Main hero / First Opaija seed wielder", island: "Trinidad" },
  { name: "Nia Toussaint", fileName: "nia-toussaint.png", aliases: ["Nia"], role: "Voice Pulse wielder", island: "Trinidad" },
  { name: "Malik St. Hill", fileName: "malik-st-hill.png", aliases: ["Malik"], role: "Opaija warrior", island: "Caribbean" },
  { name: "Asha Singh-Baptiste", fileName: "asha-singh-baptiste.png", aliases: ["Asha"], role: "Matador / Medic / Researcher", island: "Trinidad" },
  { name: 'Jabari "Jabs" Henry', fileName: "jabari-jabs-henry.png", aliases: ["Jabari", "Jabs"], role: "Opaija warrior", island: "Caribbean" },
  { name: "Tariq Davidson", fileName: "tariq-davidson.png", aliases: ["Tariq"], role: "Opaija warrior", island: "Caribbean" },
  { name: "Mother Lall", fileName: "mother-lall.png", role: "Elder / Keeper", island: "Caribbean" },
  { name: "Papa Etienne Roach", fileName: "papa-etienne-roach.png", aliases: ["Papa Etienne"], role: "Elder / Keeper", island: "Caribbean" },
  { name: "Marius Vale", fileName: "marius-vale.png", aliases: ["Marius"], role: "Vale lineage", island: "Caribbean" },
  { name: "Selah Vale", fileName: "selah-vale.png", aliases: ["Selah"], role: "Vale lineage", island: "Caribbean" },
];

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function characterDir(characterId: string) {
  return path.join(charactersRoot, slugify(characterId));
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temporary, filePath);
}

async function persistCharacter(character: UniverseCharacter) {
  const directory = characterDir(character.characterId);
  await fs.mkdir(path.join(directory, "artwork"), { recursive: true });
  await fs.mkdir(path.join(directory, "history"), { recursive: true });
  await writeJsonAtomic(path.join(directory, "character.json"), character);
  await writeJsonAtomic(path.join(directory, "history", `version-${String(character.version).padStart(4, "0")}.json`), character);
}

async function ensureSeeded() {
  await fs.mkdir(charactersRoot, { recursive: true });
  const now = new Date().toISOString();
  for (const seed of canonicalSeed) {
    const characterId = slugify(seed.name.replace(/["']/g, ""));
    const filePath = path.join(characterDir(characterId), "character.json");
    try {
      await fs.access(filePath);
    } catch {
      const artworkApiPath = `/api/character-universe/characters/${characterId}/artwork/${seed.fileName}`;
      await persistCharacter({
        characterId,
        name: seed.name,
        aliases: seed.aliases ?? [],
        role: seed.role,
        island: seed.island,
        visualStyle: "Official OPAIJA 2.5D Caribbean anime model-sheet identity lock.",
        personality: "Defined by the official character bible.",
        powers: "Defined by the official character bible.",
        referencePrompt: "Preserve the exact official sheet face, hair, skin tone, proportions, clothing, palette, accessories, and cultural details.",
        tags: ["season-1", "official-cast"],
        uses: ["books", "anime", "marketing"],
        status: "active",
        version: 1,
        canonical: true,
        artwork: [{ artworkId: randomUUID(), fileName: seed.fileName, label: "Official model sheet", source: "canonical", artworkApiPath, createdAt: now, bytes: 0 }],
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

export async function listUniverseCharacters(): Promise<UniverseCharacter[]> {
  await ensureSeeded();
  const entries = await fs.readdir(charactersRoot, { withFileTypes: true });
  const characters: UniverseCharacter[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      characters.push(JSON.parse(await fs.readFile(path.join(charactersRoot, entry.name, "character.json"), "utf8")) as UniverseCharacter);
    } catch {
      continue;
    }
  }
  return characters.sort((left, right) => Number(right.canonical) - Number(left.canonical) || left.name.localeCompare(right.name));
}

export async function getUniverseCharacter(characterId: string) {
  await ensureSeeded();
  const filePath = path.join(characterDir(characterId), "character.json");
  return JSON.parse(await fs.readFile(filePath, "utf8")) as UniverseCharacter;
}

function decodeImage(imageData: string) {
  const match = imageData.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) throw new Error("Reference artwork must be a PNG, JPG, or WebP image.");
  return { extension: match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase(), buffer: Buffer.from(match[2], "base64") };
}

export async function createUniverseCharacter(input: UniverseCharacterInput) {
  await ensureSeeded();
  const name = input.name?.trim();
  if (!name) throw new Error("Character name is required.");
  let characterId = slugify(name);
  try {
    await fs.access(path.join(characterDir(characterId), "character.json"));
    characterId = `${characterId}-${randomUUID().slice(0, 8)}`;
  } catch { /* available */ }
  const now = new Date().toISOString();
  const character: UniverseCharacter = {
    characterId,
    name,
    aliases: input.aliases ?? [],
    role: input.role?.trim() ?? "",
    island: input.island?.trim() ?? "",
    visualStyle: input.visualStyle?.trim() ?? "",
    personality: input.personality?.trim() ?? "",
    powers: input.powers?.trim() ?? "",
    referencePrompt: input.referencePrompt?.trim() ?? "",
    tags: input.tags ?? [],
    uses: input.uses?.length ? input.uses : ["books", "anime"],
    status: input.status ?? "development",
    version: 1,
    canonical: false,
    artwork: [],
    createdAt: now,
    updatedAt: now,
  };
  if (input.imageData) await attachArtwork(character, input.imageData, input.imageFileName, input.imageLabel, false);
  else await persistCharacter(character);
  return character;
}

async function attachArtwork(character: UniverseCharacter, imageData: string, originalName?: string, label?: string, bumpVersion = true) {
  const decoded = decodeImage(imageData);
  if (decoded.buffer.length > 20 * 1024 * 1024) throw new Error("Reference artwork must be 20 MB or smaller.");
  const safeBase = slugify(path.parse(originalName ?? "reference").name) || "reference";
  const fileName = `${Date.now()}-${safeBase}.${decoded.extension}`;
  const filePath = path.join(characterDir(character.characterId), "artwork", fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, decoded.buffer);
  character.artwork.push({
    artworkId: randomUUID(),
    fileName,
    label: label?.trim() || `Reference ${character.artwork.length + 1}`,
    source: "uploaded",
    artworkApiPath: `/api/character-universe/characters/${character.characterId}/artwork/${fileName}`,
    createdAt: new Date().toISOString(),
    bytes: decoded.buffer.length,
  });
  if (bumpVersion) character.version += 1;
  character.updatedAt = new Date().toISOString();
  await persistCharacter(character);
}

export async function addUniverseArtwork(characterId: string, input: { imageData?: string; imageFileName?: string; label?: string }) {
  if (!input.imageData) throw new Error("Reference artwork is required.");
  const character = await getUniverseCharacter(characterId);
  await attachArtwork(character, input.imageData, input.imageFileName, input.label);
  return character;
}

export async function updateUniverseCharacter(characterId: string, patch: Partial<UniverseCharacter>) {
  const character = await getUniverseCharacter(characterId);
  const allowed: Array<keyof UniverseCharacter> = ["name", "aliases", "role", "island", "visualStyle", "personality", "powers", "referencePrompt", "tags", "uses", "status"];
  for (const key of allowed) if (patch[key] !== undefined) (character as Record<string, unknown>)[key] = patch[key];
  character.version += 1;
  character.updatedAt = new Date().toISOString();
  await persistCharacter(character);
  return character;
}

export async function getUniverseArtworkPath(characterId: string, fileName: string) {
  if (path.basename(fileName) !== fileName) throw new Error("Invalid artwork file name.");
  const character = await getUniverseCharacter(characterId);
  const artwork = character.artwork.find((entry) => entry.fileName === fileName);
  if (!artwork) throw new Error("Artwork not found.");
  if (artwork.source === "uploaded") return path.join(characterDir(character.characterId), "artwork", fileName);
  const candidates = [
    path.resolve(process.cwd(), "public", "assets", "characters", fileName),
    path.resolve(process.cwd(), "dist", "assets", "characters", fileName),
  ];
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch { /* continue */ }
  }
  throw new Error("Canonical artwork file is missing.");
}

export async function getUniverseStorageSummary() {
  const characters = await listUniverseCharacters();
  return {
    storagePath: root,
    characterCount: characters.length,
    canonicalCount: characters.filter((character) => character.canonical).length,
    developmentCount: characters.filter((character) => character.status === "development").length,
    artworkCount: characters.reduce((sum, character) => sum + character.artwork.length, 0),
    folders: characters.map((character) => ({
      characterId: character.characterId,
      name: character.name,
      path: `characters/${character.characterId}`,
      files: ["character.json", "history/", "artwork/"],
      version: character.version,
      artworkCount: character.artwork.length,
      updatedAt: character.updatedAt,
    })),
  };
}

