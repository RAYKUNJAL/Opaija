import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clapperboard,
  Clock,
  Copy,
  Download,
  FileText,
  Mic2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Video,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { type Episode, type EpisodeStatus, episodeStatusLabels, episodeStatusOrder } from "../data/episodes";

const STATUS_COLORS: Record<EpisodeStatus, string> = {
  PLANNED: "status-planned",
  SCRIPTED: "status-scripted",
  STORYBOARDED: "status-storyboarded",
  VIDEO_GENERATED: "status-video",
  AUDIO_COMPLETE: "status-audio",
  QA_PASSED: "status-qa",
  SCHEDULED: "status-scheduled",
  PUBLISHED: "status-published",
};

type ProductionStatus = {
  phase: string;
  episodes_completed: number;
  episodes_in_pipeline: number;
  teaser_days_scheduled: number;
  character_sheets_locked: boolean;
  trailer_complete: boolean;
  cleared_for_launch: boolean;
};

type QueueData = {
  production_status: ProductionStatus;
  episodes: Episode[];
  prelaunch_teaser_content: Array<{ id: string; type: string; status: string; caption?: string; character?: string }>;
};

function nextStatus(current: EpisodeStatus): EpisodeStatus | null {
  const idx = episodeStatusOrder.indexOf(current);
  if (idx === -1 || idx === episodeStatusOrder.length - 1) return null;
  return episodeStatusOrder[idx + 1];
}

type ScriptFeedback = {
  type: "success" | "error" | "dry_run";
  message: string;
};

type StatusFeedback = {
  type: "success" | "error";
  message: string;
};

export function EpisodesView() {
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEp, setSelectedEp] = useState<string | null>(null);
  const [generatingScript, setGeneratingScript] = useState<string | null>(null);
  const [scriptOutput, setScriptOutput] = useState<Record<string, string>>({});
  const [scriptFeedback, setScriptFeedback] = useState<Record<string, ScriptFeedback>>({});
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<Record<string, StatusFeedback>>({});
  const [activeTab, setActiveTab] = useState<Record<string, "brief" | "script" | "video">>({});
  const [videoJobs, setVideoJobs] = useState<Record<string, Array<{ id: string; status: string; requestId?: string; created_at?: string; episodeId?: string }>>>({});
  const scriptRef = useRef<HTMLPreElement>(null);

  async function loadQueue() {
    setLoading(true);
    try {
      const res = await fetch("/api/episodes");
      const data = (await res.json()) as QueueData;
      setQueue(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  async function fetchVideoJobsForEpisode(episodeId: string) {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) return;
      const data = (await res.json()) as Array<{ id: string; status: string; requestId?: string; created_at?: string; episodeId?: string }>;
      const filtered = data.filter((j) => j.episodeId === episodeId);
      setVideoJobs((prev) => ({ ...prev, [episodeId]: filtered }));
    } catch {
      /* ignore */
    }
  }

  async function generateScript(ep: Episode) {
    setGeneratingScript(ep.id);
    setScriptFeedback((prev) => {
      const next = { ...prev };
      delete next[ep.id];
      return next;
    });
    try {
      const res = await fetch(`/api/episodes/${ep.id}/generate-script`, { method: "POST" });
      const data = (await res.json()) as { status: string; output?: string; prompt?: string; error?: string; message?: string };
      if (data.status === "dry_run") {
        setScriptFeedback((prev) => ({
          ...prev,
          [ep.id]: { type: "dry_run", message: "No Claude key — add ANTHROPIC_API_KEY to .env to generate real scripts." },
        }));
        const text = data.output ?? data.prompt ?? "";
        if (text) setScriptOutput((prev) => ({ ...prev, [ep.id]: text }));
      } else if (!res.ok || data.status === "error") {
        const errMsg = data.error ?? data.message ?? "Script generation failed. Check API key configuration.";
        setScriptFeedback((prev) => ({ ...prev, [ep.id]: { type: "error", message: errMsg } }));
      } else {
        const text = data.output ?? data.prompt ?? "";
        setScriptOutput((prev) => ({ ...prev, [ep.id]: text }));
        setScriptFeedback((prev) => ({
          ...prev,
          [ep.id]: { type: "success", message: "Script generated! Switch to the Script tab to review." },
        }));
        setActiveTab((prev) => ({ ...prev, [ep.id]: "script" }));
        await loadQueue();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Script generation failed. Check API key configuration.";
      setScriptFeedback((prev) => ({ ...prev, [ep.id]: { type: "error", message: msg } }));
    } finally {
      setGeneratingScript(null);
    }
  }

  async function advanceStatus(ep: Episode) {
    const next = nextStatus(ep.status);
    if (!next) return;
    setUpdatingStatus(ep.id);
    setStatusFeedback((prev) => {
      const copy = { ...prev };
      delete copy[ep.id];
      return copy;
    });
    try {
      const res = await fetch(`/api/episodes/${ep.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setStatusFeedback((prev) => ({
          ...prev,
          [ep.id]: { type: "success", message: `Advanced to ${episodeStatusLabels[next]}` },
        }));
        await loadQueue();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const errMsg = data.error ?? data.message ?? "Failed to advance status.";
        setStatusFeedback((prev) => ({ ...prev, [ep.id]: { type: "error", message: errMsg } }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to advance status.";
      setStatusFeedback((prev) => ({ ...prev, [ep.id]: { type: "error", message: msg } }));
    } finally {
      setUpdatingStatus(null);
    }
  }

  if (loading) {
    return (
      <div className="view-grid">
        <div className="panel loading-panel">
          <RefreshCw size={24} className="spin" />
          <p>Loading production queue…</p>
        </div>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="view-grid">
        <div className="panel">
          <p>Could not load production queue.</p>
        </div>
      </div>
    );
  }

  const ps = queue.production_status;
  const prelaunchDone = [
    { label: "12 episodes complete", done: ps.episodes_completed >= 12 },
    { label: "30 teaser days scheduled", done: ps.teaser_days_scheduled >= 30 },
    { label: "Character sheets locked", done: ps.character_sheets_locked },
    { label: "Trailer complete", done: ps.trailer_complete },
  ];

  const completedCount = queue.episodes.filter((ep) => ep.status === "PUBLISHED").length;
  const inPipelineCount = queue.episodes.filter(
    (ep) => ep.status !== "PLANNED" && ep.status !== "PUBLISHED",
  ).length;

  return (
    <div className="view-grid episodes-view">
      {/* Production Status Banner */}
      <section className={`panel prelaunch-banner ${ps.cleared_for_launch ? "cleared" : "locked"}`}>
        <div className="prelaunch-header">
          <div>
            <span className="signal">{ps.phase.replace(/_/g, " ")}</span>
            <h2>Season 1: Blood of the Gayelle</h2>
            <p>
              {completedCount}/12 episodes published · {inPipelineCount} in pipeline ·{" "}
              {ps.teaser_days_scheduled}/30 teaser days scheduled
            </p>
          </div>
          <div className={`launch-badge ${ps.cleared_for_launch ? "green" : "red"}`}>
            {ps.cleared_for_launch ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            <span>{ps.cleared_for_launch ? "Cleared for Launch" : "Pre-Launch Hold"}</span>
          </div>
        </div>
        <div className="prelaunch-checklist">
          {prelaunchDone.map((item) => (
            <div key={item.label} className={`prelaunch-item ${item.done ? "done" : "pending"}`}>
              {item.done ? <CheckCircle2 size={15} /> : <Clock size={15} />}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Episode Cards */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <Clapperboard size={20} />
            <h2>Episode Production Queue</h2>
          </div>
          <button type="button" className="icon-btn" onClick={() => void loadQueue()} title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="episode-list">
          {queue.episodes.map((ep) => {
            const isOpen = selectedEp === ep.id;
            const tab = activeTab[ep.id] ?? "brief";
            const scriptText = scriptOutput[ep.id] ?? ep.generated_script ?? "";
            const canAdvance = nextStatus(ep.status) !== null;
            const isGenerating = generatingScript === ep.id;
            const isUpdating = updatingStatus === ep.id;
            const epScriptFeedback = scriptFeedback[ep.id];
            const epStatusFeedback = statusFeedback[ep.id];
            const epVideoJobs = videoJobs[ep.id] ?? [];

            return (
              <article key={ep.id} className={`episode-card ${isOpen ? "open" : ""}`}>
                <div
                  className="episode-card-header"
                  onClick={() => {
                    const opening = !isOpen;
                    setSelectedEp(opening ? ep.id : null);
                    if (opening) void fetchVideoJobsForEpisode(ep.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const opening = !isOpen;
                      setSelectedEp(opening ? ep.id : null);
                      if (opening) void fetchVideoJobsForEpisode(ep.id);
                    }
                  }}
                >
                  <div className="ep-id-block">
                    <span className="ep-number">{ep.id}</span>
                    {ep.SEASON_FINALE && <span className="ep-badge finale">Finale</span>}
                    {ep.SEASON_1_TITLE_EPISODE && <span className="ep-badge title-ep">Title Ep</span>}
                    {ep.LORE_HEAVY && <span className="ep-badge lore">Lore</span>}
                  </div>
                  <div className="ep-title-block">
                    <h3>{ep.title}</h3>
                    <span className="ep-hook">{ep.hook}</span>
                  </div>
                  <div className="ep-meta">
                    <span className={`ep-status ${STATUS_COLORS[ep.status]}`}>{episodeStatusLabels[ep.status]}</span>
                    <span className="ep-island">{ep.island}</span>
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {isOpen && (
                  <div className="episode-detail">
                    {/* Tabs */}
                    <div className="ep-tabs">
                      {(["brief", "script", "video"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`ep-tab ${tab === t ? "active" : ""}`}
                          onClick={() => setActiveTab((prev) => ({ ...prev, [ep.id]: t }))}
                        >
                          {t === "brief" && <BookOpen size={14} />}
                          {t === "script" && <FileText size={14} />}
                          {t === "video" && <Video size={14} />}
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                          {t === "script" && scriptText && <span className="tab-dot" />}
                        </button>
                      ))}
                    </div>

                    {tab === "brief" && (
                      <div className="ep-brief">
                        <div className="ep-story-beats">
                          {[
                            { label: "Hook", value: ep.hook },
                            { label: "Conflict", value: ep.conflict },
                            { label: "Reveal", value: ep.reveal },
                            { label: "Escalation", value: ep.escalation },
                            { label: "Cliffhanger", value: ep.cliffhanger },
                          ].map((beat) => (
                            <div key={beat.label} className="story-beat">
                              <strong>{beat.label}</strong>
                              <p>{beat.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="ep-doubles">
                          <span className="doubles-label">🫓 Doubles Moment</span>
                          <p>{ep.doubles_moment}</p>
                        </div>
                        <div className="ep-cast">
                          <strong>Characters</strong>
                          <div className="ep-tags">
                            {ep.characters.map((c) => (
                              <span key={c} className="ep-tag">{c.replace(/_/g, " ")}</span>
                            ))}
                          </div>
                        </div>
                        <div className="ep-location">
                          <strong>Location</strong>
                          <span>{ep.location}</span>
                        </div>
                        {ep.villain_presence && typeof ep.villain_presence === "string" && (
                          <div className="ep-villain-note">
                            <AlertTriangle size={14} />
                            <span>{ep.villain_presence}</span>
                          </div>
                        )}
                        {ep.CANON_NOTE && (
                          <div className="ep-canon-note">
                            <ShieldCheck size={14} />
                            <span>{ep.CANON_NOTE}</span>
                          </div>
                        )}
                        {ep.status_notes && (
                          <div className="ep-status-note">
                            <ChevronRight size={14} />
                            <span>{ep.status_notes}</span>
                          </div>
                        )}
                        {ep.assets_needed && ep.assets_needed.length > 0 && (
                          <div className="ep-assets">
                            <strong>Assets Needed</strong>
                            <div className="ep-tags">
                              {ep.assets_needed.map((a) => (
                                <span key={a} className="ep-tag asset-tag">{a.replace(/_/g, " ")}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {ep.narrator_script && (
                          <div className="ep-narrator">
                            <strong>Narrator Script Draft</strong>
                            <pre className="narrator-text">{ep.narrator_script}</pre>
                          </div>
                        )}
                      </div>
                    )}

                    {tab === "script" && (
                      <div className="ep-script-panel">
                        {scriptText ? (
                          <>
                            <div className="script-toolbar">
                              <div className="script-meta">
                                <span className="script-wordcount">
                                  {scriptText.trim().split(/\s+/).length} words
                                </span>
                                <span className="script-readtime">
                                  ~{Math.ceil(scriptText.trim().split(/\s+/).length / 130)} min read
                                </span>
                              </div>
                              <div className="script-actions">
                                <button
                                  type="button"
                                  className="ep-btn secondary small"
                                  onClick={() => void navigator.clipboard.writeText(scriptText)}
                                  title="Copy script to clipboard"
                                >
                                  <Copy size={13} />
                                  Copy
                                </button>
                                <button
                                  type="button"
                                  className="ep-btn secondary small"
                                  onClick={() => {
                                    const blob = new Blob([scriptText], { type: "text/plain" });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `${ep.id}_script.txt`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  }}
                                  title="Download script as .txt"
                                >
                                  <Download size={13} />
                                  Download .txt
                                </button>
                              </div>
                            </div>
                            <pre className="script-output" ref={scriptRef}>{scriptText}</pre>
                          </>
                        ) : (
                          <div className="no-script">
                            <FileText size={32} />
                            <p>No script generated yet.</p>
                            <p className="dim">Generate a full production script with Claude AI.</p>
                            <button
                              type="button"
                              className="ep-btn primary"
                              onClick={() => void generateScript(ep)}
                              disabled={isGenerating}
                            >
                              {isGenerating ? (
                                <RefreshCw size={15} className="spin" />
                              ) : (
                                <Sparkles size={15} />
                              )}
                              {isGenerating ? "Generating with Claude..." : "Generate Script with Claude"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {tab === "video" && (
                      <div className="ep-video-panel">
                        <VideoJobForm episodeId={ep.id} title={ep.title} hook={ep.hook} />
                        {epVideoJobs.length > 0 && (
                          <div className="past-video-jobs">
                            <h4 className="past-jobs-heading">Past Video Jobs for {ep.id}</h4>
                            <div className="past-jobs-list">
                              {epVideoJobs.map((job) => (
                                <div key={job.id} className="past-job-row">
                                  <span className={`job-status-badge status-${job.status.toLowerCase()}`}>
                                    {job.status}
                                  </span>
                                  <span className="job-request-id" title={job.requestId}>
                                    {job.requestId ? job.requestId.slice(0, 14) + "…" : job.id.slice(0, 10) + "…"}
                                  </span>
                                  {job.created_at && (
                                    <span className="job-date">
                                      {new Date(job.created_at).toLocaleDateString()}
                                    </span>
                                  )}
                                  <a
                                    href="/command#work"
                                    className="job-review-link"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      window.location.hash = "work";
                                    }}
                                  >
                                    View in Work Review →
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Script feedback banner */}
                    {epScriptFeedback && (
                      <div className={`feedback-banner ${epScriptFeedback.type}`}>
                        {epScriptFeedback.type === "success" && <CheckCircle2 size={15} />}
                        {epScriptFeedback.type === "error" && <XCircle size={15} />}
                        {epScriptFeedback.type === "dry_run" && <AlertTriangle size={15} />}
                        <span>{epScriptFeedback.message}</span>
                        <button
                          type="button"
                          className="banner-dismiss"
                          onClick={() => setScriptFeedback((prev) => { const copy = { ...prev }; delete copy[ep.id]; return copy; })}
                          aria-label="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {/* Status feedback banner */}
                    {epStatusFeedback && (
                      <div className={`feedback-banner ${epStatusFeedback.type}`}>
                        {epStatusFeedback.type === "success" && <CheckCircle2 size={15} />}
                        {epStatusFeedback.type === "error" && <XCircle size={15} />}
                        <span>{epStatusFeedback.message}</span>
                        <button
                          type="button"
                          className="banner-dismiss"
                          onClick={() => setStatusFeedback((prev) => { const copy = { ...prev }; delete copy[ep.id]; return copy; })}
                          aria-label="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="ep-actions">
                      <button
                        type="button"
                        className="ep-btn primary"
                        onClick={() => void generateScript(ep)}
                        disabled={isGenerating}
                      >
                        {isGenerating ? (
                          <RefreshCw size={15} className="spin" />
                        ) : (
                          <Sparkles size={15} />
                        )}
                        {isGenerating ? "Generating with Claude..." : "Generate Script with Claude"}
                      </button>

                      <button
                        type="button"
                        className="ep-btn secondary"
                        onClick={() => void generateNarration(ep)}
                        disabled={isGenerating}
                      >
                        <Mic2 size={15} />
                        Generate Narration
                      </button>

                      {canAdvance && (
                        <button
                          type="button"
                          className="ep-btn advance"
                          onClick={() => void advanceStatus(ep)}
                          disabled={isUpdating}
                        >
                          {isUpdating ? <RefreshCw size={15} className="spin" /> : <Play size={15} />}
                          {isUpdating
                            ? "Advancing..."
                            : `${episodeStatusLabels[ep.status]} → ${episodeStatusLabels[nextStatus(ep.status)!]}`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* Teaser Content Queue */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <Sparkles size={20} />
            <h2>Pre-Launch Teaser Content</h2>
          </div>
          <span>{queue.prelaunch_teaser_content.filter((t) => t.status === "PLANNED").length} planned</span>
        </div>
        <div className="teaser-grid">
          {queue.prelaunch_teaser_content.map((teaser) => (
            <article key={teaser.id} className={`teaser-card ${teaser.status.toLowerCase()}`}>
              <span className="teaser-id">{teaser.id}</span>
              <h4>{teaser.type.replace(/_/g, " ")}</h4>
              {teaser.caption && <p className="teaser-caption">{teaser.caption}</p>}
              {teaser.character && <span className="ep-tag">{teaser.character.replace(/_/g, " ")}</span>}
              <span className={`ep-status status-${teaser.status.toLowerCase()}`}>{teaser.status}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

async function generateNarration(ep: Episode) {
  try {
    await fetch("/api/voice/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: ep.narrator_script ?? `${ep.hook} ${ep.conflict} ${ep.reveal}`,
        episodeId: ep.id,
        voiceId: "web-teller",
      }),
    });
  } catch {
    /* handled by caller */
  }
}

type VideoJobResult = {
  status: string;
  requestId?: string;
  error?: string;
  message?: string;
};

function VideoJobForm({ episodeId, title, hook }: { episodeId: string; title: string; hook: string }) {
  const [prompt, setPrompt] = useState(
    `OPAIJA ${episodeId}: ${title}. ${hook} 2.5D Caribbean anime style. Rounded features, full lips, broad nose, warm Caribbean tones. 9:16 vertical. Dramatic action with rhythm glyphs.`,
  );
  const [mode, setMode] = useState<"text-to-video" | "image-to-video">("text-to-video");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<VideoJobResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/video/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode, aspectRatio: "9:16", resolution: "1080p", generateAudio: true, episodeId }),
      });
      const data = (await res.json()) as VideoJobResult;
      setResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to connect to server.";
      setResult({ status: "error", error: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="video-job-form" onSubmit={(e) => void submit(e)}>
      <label>
        Mode
        <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} disabled={submitting}>
          <option value="text-to-video">Text to Video</option>
          <option value="image-to-video">Image to Video</option>
        </select>
      </label>
      <label>
        Seedance Prompt
        <textarea
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the scene for Seedance 2.0..."
          disabled={submitting}
        />
      </label>
      <button type="submit" className="ep-btn primary" disabled={submitting}>
        {submitting ? <RefreshCw size={15} className="spin" /> : <Video size={15} />}
        {submitting ? "Submitting to Seedance..." : "Submit to Seedance"}
      </button>
      {result && (
        <div className={`feedback-banner ${result.status === "queued" ? "success" : result.status === "dry_run" ? "dry_run" : "error"}`}>
          {result.status === "dry_run" && (
            <>
              <AlertTriangle size={15} />
              <span>Running in dry-run mode. Add FAL_KEY to .env to submit real video jobs.</span>
            </>
          )}
          {result.status === "queued" && (
            <>
              <CheckCircle2 size={15} />
              <span>
                Video job submitted! Request ID: {result.requestId}. Go to Work Review → Video Renders to track it.
              </span>
            </>
          )}
          {result.status === "error" && (
            <>
              <XCircle size={15} />
              <span>{result.error ?? result.message ?? "Error submitting video job. Check your FAL_KEY configuration."}</span>
            </>
          )}
        </div>
      )}
    </form>
  );
}
