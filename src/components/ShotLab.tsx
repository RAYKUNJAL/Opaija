import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clapperboard,
  RefreshCw,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";

const EPISODE_IDS = Array.from({ length: 12 }, (_, i) => `EP${String(i + 1).padStart(3, "0")}`);

type PromptBeat = {
  idx: number;
  prompt: string;
  referenceImage?: string;
  mode?: string;
  characters?: string[];
};

type PromptsResponse = {
  source: string;
  beats: PromptBeat[];
};

type ShotLabState = {
  beats: Record<string, Array<{ file: string; url: string }>>;
  approvals: Record<string, string>;
};

type BeatFeedback = { type: "success" | "error"; message: string };

function getToken(): string | null {
  return sessionStorage.getItem("opaija_admin_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-admin-session"] = token;
  return headers;
}

export function ShotLab() {
  const [epId, setEpId] = useState<string>("EP001");
  const [promptBeats, setPromptBeats] = useState<PromptBeat[]>([]);
  const [promptsSource, setPromptsSource] = useState<string>("manual");
  const [manualBeats, setManualBeats] = useState<Record<number, string>>({});
  const [state, setState] = useState<ShotLabState>({ beats: {}, approvals: {} });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<Record<number, boolean>>({});
  const [approving, setApproving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<number, BeatFeedback>>({});
  const [countOverride, setCountOverride] = useState<Record<number, number>>({});

  const loadState = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [promptsRes, stateRes] = await Promise.all([
        fetch(`/api/shotlab/${id}/prompts`, { headers: authHeaders() }),
        fetch(`/api/shotlab/${id}`, { headers: authHeaders() }),
      ]);
      if (promptsRes.ok) {
        const data = (await promptsRes.json()) as PromptsResponse;
        setPromptBeats(data.beats);
        setPromptsSource(data.source);
      }
      if (stateRes.ok) {
        const data = (await stateRes.json()) as ShotLabState & { epId: string };
        setState({ beats: data.beats ?? {}, approvals: data.approvals ?? {} });
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState(epId);
  }, [epId, loadState]);

  // Build the list of beat rows to render: from prompts.json if present,
  // otherwise from manual entries (1..maxManual). Always show at least one.
  const maxManual = Math.max(8, ...Object.keys(manualBeats).map(Number));
  const beatRows: Array<{ idx: number; prompt: string }> =
    promptBeats.length > 0
      ? promptBeats.map((b) => ({ idx: b.idx, prompt: b.prompt }))
      : Array.from({ length: maxManual }, (_, i) => ({
          idx: i + 1,
          prompt: manualBeats[i + 1] ?? "",
        }));

  async function generate(beatIdx: number, prompt: string) {
    if (!prompt.trim()) return;
    setGenerating((p) => ({ ...p, [beatIdx]: true }));
    setFeedback((p) => { const c = { ...p }; delete c[beatIdx]; return c; });
    const count = countOverride[beatIdx] ?? 2;
    try {
      const res = await fetch(`/api/shotlab/${epId}/generate`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ beatIdx, prompt, count }),
      });
      const data = (await res.json()) as { urls?: string[]; error?: string };
      if (!res.ok) {
        setFeedback((p) => ({ ...p, [beatIdx]: { type: "error", message: data.error ?? "Generation failed." } }));
      } else {
        setFeedback((p) => ({ ...p, [beatIdx]: { type: "success", message: `Generated ${data.urls?.length ?? 0} stills.` } }));
        await loadState(epId);
      }
    } catch (err) {
      setFeedback((p) => ({ ...p, [beatIdx]: { type: "error", message: err instanceof Error ? err.message : "Network error." } }));
    } finally {
      setGenerating((p) => ({ ...p, [beatIdx]: false }));
    }
  }

  async function approve(beatIdx: number, file: string) {
    const key = `${beatIdx}:${file}`;
    setApproving(key);
    try {
      const res = await fetch(`/api/shotlab/${epId}/approve`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ beatIdx, file }),
      });
      if (res.ok) {
        await loadState(epId);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setFeedback((p) => ({ ...p, [beatIdx]: { type: "error", message: data.error ?? "Approval failed." } }));
      }
    } catch {
      setFeedback((p) => ({ ...p, [beatIdx]: { type: "error", message: "Network error." } }));
    } finally {
      setApproving(null);
    }
  }

  return (
    <div className="view-grid shotlab-view">
      <section className="panel">
        <div className="panel-header">
          <div>
            <Clapperboard size={20} />
            <h2>Shot Lab — Pre-Visualization</h2>
          </div>
          <div className="shotlab-controls">
            <label className="shotlab-ep-select">
              <span>Episode</span>
              <select value={epId} onChange={(e) => setEpId(e.target.value)} disabled={loading}>
                {EPISODE_IDS.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
            <button type="button" className="icon-btn" onClick={() => void loadState(epId)} title="Refresh" disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </button>
          </div>
        </div>

        <p className="shotlab-meta">
          Prompt source: <strong>{promptsSource}</strong>
          {" · "}~$0.05/still (flux/dev)
          {" · "}Approved stills override character sheets in the produce.ts pipeline.
        </p>

        {promptBeats.length === 0 && (
          <p className="shotlab-hint">
            No prompts.json for this episode. Type a prompt for each beat manually, then generate stills.
          </p>
        )}

        <div className="shotlab-beat-list">
          {beatRows.map((row) => {
            const key = String(row.idx);
            const candidates = state.beats[key] ?? [];
            const approvedFile = state.approvals[key];
            const isGenerating = generating[row.idx];
            const fb = feedback[row.idx];
            const editable = promptBeats.length === 0;
            return (
              <article key={row.idx} className="shotlab-beat-card">
                <div className="shotlab-beat-head">
                  <span className="shotlab-beat-num">Beat {row.idx}</span>
                  {approvedFile && (
                    <span className="shotlab-approved-tag">
                      <CheckCircle2 size={13} /> Approved
                    </span>
                  )}
                </div>

                <textarea
                  className="shotlab-prompt"
                  rows={3}
                  defaultValue={row.prompt}
                  placeholder="Describe the still frame for this beat…"
                  readOnly={!editable}
                  onChange={editable ? (e) => setManualBeats((p) => ({ ...p, [row.idx]: e.target.value })) : undefined}
                />

                <div className="shotlab-gen-row">
                  <label className="shotlab-count">
                    <span>Count</span>
                    <select
                      value={countOverride[row.idx] ?? 2}
                      onChange={(e) => setCountOverride((p) => ({ ...p, [row.idx]: Number(e.target.value) }))}
                      disabled={isGenerating}
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="ep-btn primary"
                    disabled={isGenerating}
                    onClick={() => void generate(row.idx, editable ? (manualBeats[row.idx] ?? "") : row.prompt)}
                  >
                    {isGenerating ? <RefreshCw size={15} className="spin" /> : <Wand2 size={15} />}
                    {isGenerating ? "Generating…" : `Generate ${countOverride[row.idx] ?? 2} stills`}
                  </button>
                </div>

                {candidates.length > 0 && (
                  <div className="shotlab-candidate-grid">
                    {candidates.map((c) => {
                      const isApproved = approvedFile === c.file;
                      return (
                        <button
                          type="button"
                          key={c.file}
                          className={`shotlab-thumb ${isApproved ? "approved" : ""}`}
                          onClick={() => void approve(row.idx, c.file)}
                          disabled={approving !== null}
                          title={isApproved ? "Approved — click to re-approve" : "Click to approve"}
                        >
                          <img src={c.url} alt={`Candidate ${c.file}`} loading="lazy" />
                          {isApproved && (
                            <span className="shotlab-thumb-check">
                              <Check size={18} />
                            </span>
                          )}
                          <span className="shotlab-thumb-label">{c.file}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {fb && (
                  <div className={`feedback-banner ${fb.type}`}>
                    {fb.type === "success" ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                    <span>{fb.message}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
