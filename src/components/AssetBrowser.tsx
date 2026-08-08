import { useEffect, useState } from "react";
import { Download, FolderOpen, Image, Mic2, RefreshCw, Video } from "lucide-react";
import { apiUrl } from "../lib/api";

type AssetFile = {
  name: string;
  publicUrl: string;
  type: "image" | "video" | "audio" | "other";
  sizeLabel: string;
  folder: string;
};

type AssetFolder = {
  folder: string;
  label: string;
  files: AssetFile[];
  totalFiles: number;
  totalSizeBytes: number;
};

type AssetInventory = {
  folders: AssetFolder[];
  totalFiles: number;
  totalSizeLabel: string;
};

const TYPE_ICON = {
  image: Image,
  video: Video,
  audio: Mic2,
  other: FolderOpen,
};

function AssetCard({ file }: { file: AssetFile }) {
  const Icon = TYPE_ICON[file.type];
  const [preview, setPreview] = useState(false);

  return (
    <article className="asset-card" onClick={() => file.type === "image" || file.type === "video" ? setPreview(!preview) : undefined}>
      <div className={`asset-thumb ${file.type}`}>
        {file.type === "image" ? (
          <img src={file.publicUrl} alt={file.name} loading="lazy" />
        ) : file.type === "video" ? (
          preview ? (
            <video src={file.publicUrl} controls autoPlay muted style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <div className="asset-play-overlay">
              <Video size={28} />
              <span>Click to preview</span>
            </div>
          )
        ) : (
          <Icon size={28} />
        )}
      </div>
      <div className="asset-info">
        <span className="asset-name" title={file.name}>{file.name}</span>
        <span className="asset-size">{file.sizeLabel}</span>
        <a
          href={file.publicUrl}
          download={file.name}
          className="asset-download"
          onClick={(e) => e.stopPropagation()}
          title="Download"
        >
          <Download size={13} />
        </a>
      </div>
    </article>
  );
}

export function AssetBrowser({ token }: { token: string | null }) {
  const [inventory, setInventory] = useState<AssetInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "image" | "video" | "audio">("all");

  async function load() {
    setLoading(true);
    try {
      const headers: Record<string, string> = token ? { "x-admin-session": token } : {};
      const res = await fetch(apiUrl("/api/assets"), { headers });
      if (!res.ok) { setInventory(null); return; }
      const data = await res.json() as Partial<AssetInventory> | { error?: string };
      if (!data || typeof data !== "object" || !Array.isArray((data as AssetInventory).folders)) {
        setInventory(null);
        return;
      }
      const inv = data as AssetInventory;
      setInventory(inv);
      if (!activeFolder && inv.folders.length > 0) {
        setActiveFolder(inv.folders[0].folder);
      }
    } catch {
      setInventory(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const currentFolder = inventory?.folders.find((f) => f.folder === activeFolder);
  const visibleFiles = currentFolder?.files.filter((f) => filter === "all" || f.type === filter) ?? [];

  return (
    <div className="view-grid asset-browser">
      <section className="panel">
        <div className="panel-header">
          <div>
            <FolderOpen size={20} />
            <h2>Asset Storage</h2>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {inventory && (
              <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                {inventory.totalFiles} files · {inventory.totalSizeLabel}
              </span>
            )}
            <button type="button" className="icon-btn" onClick={() => void load()} title="Refresh">
              <RefreshCw size={15} className={loading ? "spin" : ""} />
            </button>
          </div>
        </div>

        {loading && !inventory ? (
          <div className="loading-panel"><RefreshCw size={24} className="spin" /><p>Scanning assets…</p></div>
        ) : inventory ? (
          <div className="asset-layout">
            {/* Sidebar folders */}
            <nav className="asset-sidebar">
              {inventory.folders.map((folder) => (
                <button
                  key={folder.folder}
                  type="button"
                  className={`asset-folder-btn ${activeFolder === folder.folder ? "active" : ""}`}
                  onClick={() => setActiveFolder(folder.folder)}
                >
                  <FolderOpen size={14} />
                  <span>{folder.label}</span>
                  <strong>{folder.totalFiles}</strong>
                </button>
              ))}
            </nav>

            {/* File grid */}
            <div className="asset-main">
              <div className="asset-filter-bar">
                {(["all", "image", "video", "audio"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`filter-chip ${filter === t ? "active" : ""}`}
                    onClick={() => setFilter(t)}
                  >
                    {t === "image" ? <Image size={12} /> : t === "video" ? <Video size={12} /> : t === "audio" ? <Mic2 size={12} /> : null}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                    {t === "all" && currentFolder && <span className="filter-count">{currentFolder.totalFiles}</span>}
                    {t !== "all" && currentFolder && (
                      <span className="filter-count">
                        {currentFolder.files.filter((f) => f.type === t).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {visibleFiles.length === 0 ? (
                <div className="empty-log">
                  <FolderOpen size={32} />
                  <p>No {filter === "all" ? "" : filter} files in this folder.</p>
                  <p className="dim">Drop files into <code>public/assets/{activeFolder}/</code> to see them here.</p>
                </div>
              ) : (
                <div className="asset-grid">
                  {visibleFiles.map((file) => (
                    <AssetCard key={file.publicUrl} file={file} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p>Could not load assets.</p>
        )}
      </section>

      {/* Upload guide */}
      <section className="panel">
        <div className="panel-header">
          <div><FolderOpen size={18} /><h2>Where to Put Files</h2></div>
        </div>
        <div className="upload-guide">
          {[
            { folder: "public/assets/characters/", label: "Character Sheets", note: "PNG with transparent background — one per character" },
            { folder: "public/assets/video/", label: "Video Assets", note: "MP4 hero clips, rendered Seedance output" },
            { folder: "public/assets/audio/", label: "Narration / Audio", note: "MP3 narration files from ElevenLabs" },
            { folder: "public/assets/flipbook/", label: "Flipbook Pages", note: "Character spread PNGs for the public flipbook" },
            { folder: "public/assets/exports/shorts/", label: "YouTube Shorts Exports", note: "Final 9:16 MP4 — ready to upload" },
            { folder: "public/assets/exports/tiktok/", label: "TikTok Exports", note: "Final 9:16 MP4 — ready to upload" },
            { folder: "public/assets/exports/reels/", label: "Reels Exports", note: "Final 9:16 MP4 — ready to upload" },
          ].map((item) => (
            <div key={item.folder} className="upload-guide-row">
              <code className="folder-path">{item.folder}</code>
              <div>
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
