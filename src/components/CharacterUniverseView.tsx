import { useEffect, useMemo, useState } from "react";
import { Archive, BookOpen, Check, Clapperboard, Folder, ImagePlus, Library, Plus, Search, Upload, X } from "lucide-react";
import { apiUrl } from "../lib/api";
import "./CharacterUniverseView.css";

type Artwork = { artworkId: string; fileName: string; label: string; artworkApiPath: string; createdAt: string; bytes: number };
type Character = {
  characterId: string; name: string; aliases: string[]; role: string; island: string; visualStyle: string;
  personality: string; powers: string; referencePrompt: string; tags: string[]; uses: string[];
  status: "active" | "development" | "archived"; version: number; canonical: boolean; artwork: Artwork[]; updatedAt: string;
};
type Storage = { storagePath: string; characterCount: number; canonicalCount: number; developmentCount: number; artworkCount: number; folders: Array<{ characterId: string; name: string; path: string; files: string[]; version: number; artworkCount: number; updatedAt: string }> };

const blankForm = { name: "", aliases: "", role: "", island: "", visualStyle: "", personality: "", powers: "", referencePrompt: "", tags: "", uses: ["books", "anime"] };

function headers(json = false) {
  const token = localStorage.getItem("opaija_admin_token") ?? "";
  return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { "x-admin-session": token } : {}) };
}

async function fileData(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}

export function CharacterUniverseView() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [storage, setStorage] = useState<Storage | null>(null);
  const [selected, setSelected] = useState<Character | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"library" | "files">("library");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const [charactersResponse, storageResponse] = await Promise.all([
      fetch(apiUrl("/api/character-universe/characters"), { headers: headers() }),
      fetch(apiUrl("/api/character-universe/storage"), { headers: headers() }),
    ]);
    if (!charactersResponse.ok || !storageResponse.ok) throw new Error("Character Universe could not be loaded.");
    const nextCharacters = await charactersResponse.json() as Character[];
    setCharacters(nextCharacters);
    setStorage(await storageResponse.json() as Storage);
    setSelected((current) => current ? nextCharacters.find((item) => item.characterId === current.characterId) ?? null : null);
  }

  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, []);

  const visible = useMemo(() => characters.filter((character) =>
    [character.name, character.role, character.island, ...character.aliases, ...character.tags].join(" ").toLowerCase().includes(query.toLowerCase())
  ), [characters, query]);

  async function createCharacter(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch(apiUrl("/api/character-universe/characters"), {
        method: "POST", headers: headers(true), body: JSON.stringify({
          ...form,
          aliases: form.aliases.split(",").map((value) => value.trim()).filter(Boolean),
          tags: form.tags.split(",").map((value) => value.trim()).filter(Boolean),
          imageData: image ? await fileData(image) : undefined,
          imageFileName: image?.name,
          imageLabel: "First official reference",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Character could not be created.");
      setForm(blankForm); setImage(null); setCreating(false); setMessage(`${payload.name} is now part of the shared universe.`);
      await load(); setSelected(payload);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Character could not be created."); }
    finally { setBusy(false); }
  }

  async function uploadArtwork(file: File) {
    if (!selected) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(apiUrl(`/api/character-universe/characters/${selected.characterId}/artwork`), {
        method: "POST", headers: headers(true), body: JSON.stringify({ imageData: await fileData(file), imageFileName: file.name, label: `Reference ${selected.artwork.length + 1}` }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Artwork could not be stored.");
      await load(); setSelected(payload); setMessage("New reference version saved permanently.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Artwork could not be stored."); }
    finally { setBusy(false); }
  }

  return (
    <section className="universe-shell">
      <header className="universe-hero">
        <div><span className="universe-kicker">Living production system</span><h1>Character Universe</h1><p>One visual canon library shared by every OPAIJA book, episode, trailer, game, and campaign.</p></div>
        <button className="universe-primary" onClick={() => setCreating(true)}><Plus size={18} /> New character</button>
      </header>

      <div className="universe-stats">
        <article><strong>{storage?.characterCount ?? characters.length}</strong><span>Characters</span></article>
        <article><strong>{storage?.canonicalCount ?? 0}</strong><span>Official canon</span></article>
        <article><strong>{storage?.artworkCount ?? 0}</strong><span>Reference sheets</span></article>
        <article><strong>Books + Anime</strong><span>Shared automatically</span></article>
      </div>

      <div className="universe-toolbar">
        <div className="universe-tabs"><button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}><Library size={17} /> Visual library</button><button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}><Archive size={17} /> Storage & files</button></div>
        {tab === "library" && <label className="universe-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, role, island or tag" /></label>}
      </div>

      {message && <div className="universe-message"><Check size={16} /> {message}</div>}

      {tab === "library" ? (
        <div className="universe-grid">
          {visible.map((character) => {
            const cover = character.artwork.at(-1);
            return <button className="universe-card" key={character.characterId} onClick={() => setSelected(character)}>
              <div className="universe-card-image">{cover ? <img src={apiUrl(cover.artworkApiPath)} alt={`${character.name} character bible`} /> : <div className="universe-needs-art"><ImagePlus size={30} /><span>Reference needed</span></div>}<span className={character.canonical ? "canon-badge" : "development-badge"}>{character.canonical ? "Official canon" : character.status}</span></div>
              <div className="universe-card-copy"><h2>{character.name}</h2><p>{character.role || "Role in development"}</p><div><span>{character.island || "Island pending"}</span><span>v{character.version}</span></div></div>
            </button>;
          })}
        </div>
      ) : (
        <div className="universe-files">
          <div className="universe-drive"><Folder size={22} /><div><strong>OPAIJA Character Universe</strong><span>{storage?.storagePath}</span></div><b>{storage?.characterCount ?? 0} folders</b></div>
          <div className="folder-grid">{storage?.folders.map((folder) => <button key={folder.characterId} onClick={() => { setSelected(characters.find((item) => item.characterId === folder.characterId) ?? null); setTab("library"); }}><Folder size={24} /><strong>{folder.name}</strong><span>{folder.path}</span><small>{folder.artworkCount} artwork · version {folder.version}</small></button>)}</div>
        </div>
      )}

      {selected && <div className="universe-overlay" onClick={() => setSelected(null)}><aside className="universe-detail" onClick={(event) => event.stopPropagation()}><button className="universe-close" onClick={() => setSelected(null)}><X /></button>{selected.artwork.at(-1) ? <img className="universe-detail-image" src={apiUrl(selected.artwork.at(-1)?.artworkApiPath ?? "")} alt={`${selected.name} full character bible`} /> : <div className="universe-detail-empty"><ImagePlus size={42} />Add the first official reference sheet</div>}<div className="universe-detail-copy"><span className="universe-kicker">{selected.canonical ? "Official canon" : selected.status} · version {selected.version}</span><h2>{selected.name}</h2><p>{selected.role}</p><dl><div><dt>Island</dt><dd>{selected.island || "Not set"}</dd></div><div><dt>Aliases</dt><dd>{selected.aliases.join(", ") || "None"}</dd></div><div><dt>Personality</dt><dd>{selected.personality || "In development"}</dd></div><div><dt>Powers</dt><dd>{selected.powers || "In development"}</dd></div></dl><div className="universe-uses">{selected.uses.map((use) => <span key={use}>{use === "books" ? <BookOpen size={14} /> : use === "anime" ? <Clapperboard size={14} /> : <Archive size={14} />}{use}</span>)}</div><label className="upload-reference"><Upload size={17} />{busy ? "Saving..." : "Add reference artwork"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => event.target.files?.[0] && void uploadArtwork(event.target.files[0])} /></label><div className="reference-history"><strong>Artwork history</strong>{selected.artwork.slice().reverse().map((art) => <a key={art.artworkId} href={apiUrl(art.artworkApiPath)} target="_blank" rel="noreferrer"><span>{art.label}</span><small>{new Date(art.createdAt).toLocaleDateString()}</small></a>)}</div></div></aside></div>}

      {creating && <div className="universe-overlay"><form className="universe-create" onSubmit={createCharacter}><button type="button" className="universe-close" onClick={() => setCreating(false)}><X /></button><span className="universe-kicker">Expand the canon</span><h2>Create a character</h2><p>This profile becomes reusable across Book Builder and future anime production.</p><div className="form-grid"><label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Aliases<input value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} placeholder="Comma separated" /></label><label>Role<input value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} /></label><label>Island / origin<input value={form.island} onChange={(event) => setForm({ ...form, island: event.target.value })} /></label><label className="wide">Visual identity<textarea value={form.visualStyle} onChange={(event) => setForm({ ...form, visualStyle: event.target.value })} /></label><label>Personality<textarea value={form.personality} onChange={(event) => setForm({ ...form, personality: event.target.value })} /></label><label>Powers / skills<textarea value={form.powers} onChange={(event) => setForm({ ...form, powers: event.target.value })} /></label><label className="wide">Identity lock for AI<textarea value={form.referencePrompt} onChange={(event) => setForm({ ...form, referencePrompt: event.target.value })} /></label><label>Tags<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="season-2, hero, Trinidad" /></label><label className="file-field">First reference sheet<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /><span><ImagePlus size={17} />{image?.name ?? "Choose artwork"}</span></label></div><div className="use-row"><label><input type="checkbox" checked={form.uses.includes("books")} onChange={(event) => setForm({ ...form, uses: event.target.checked ? [...form.uses, "books"] : form.uses.filter((use) => use !== "books") })} /> Books</label><label><input type="checkbox" checked={form.uses.includes("anime")} onChange={(event) => setForm({ ...form, uses: event.target.checked ? [...form.uses, "anime"] : form.uses.filter((use) => use !== "anime") })} /> Anime</label></div><button className="universe-primary" disabled={busy}>{busy ? "Building character folder..." : "Create shared character"}</button></form></div>}
    </section>
  );
}

