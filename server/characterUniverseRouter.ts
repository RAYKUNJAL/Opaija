import { Router } from "express";
import {
  addUniverseArtwork,
  createUniverseCharacter,
  getUniverseArtworkPath,
  getUniverseStorageSummary,
  listUniverseCharacters,
  updateUniverseCharacter,
  type UniverseCharacterInput,
} from "./characterUniverse.js";

export const characterUniverseRouter = Router();

characterUniverseRouter.get("/characters", async (_request, response) => {
  try { response.json(await listUniverseCharacters()); }
  catch (error) { response.status(500).json({ error: error instanceof Error ? error.message : "Unable to load character universe." }); }
});

characterUniverseRouter.post("/characters", async (request, response) => {
  try { response.status(201).json(await createUniverseCharacter(request.body as UniverseCharacterInput)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : "Unable to create character." }); }
});

characterUniverseRouter.patch("/characters/:characterId", async (request, response) => {
  try { response.json(await updateUniverseCharacter(request.params.characterId, request.body)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : "Unable to update character." }); }
});

characterUniverseRouter.post("/characters/:characterId/artwork", async (request, response) => {
  try { response.status(201).json(await addUniverseArtwork(request.params.characterId, request.body)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : "Unable to store artwork." }); }
});

characterUniverseRouter.get("/characters/:characterId/artwork/:fileName", async (request, response) => {
  try { response.sendFile(await getUniverseArtworkPath(request.params.characterId, request.params.fileName)); }
  catch (error) { response.status(404).json({ error: error instanceof Error ? error.message : "Artwork not found." }); }
});

characterUniverseRouter.get("/storage", async (_request, response) => {
  try { response.json(await getUniverseStorageSummary()); }
  catch (error) { response.status(500).json({ error: error instanceof Error ? error.message : "Unable to inspect storage." }); }
});

