import { useEffect, useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  RefreshCw,
  Video,
  Play,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type JobRecord = {
  id: string;
  type: "video" | "voice" | "script" | "brain";
  label: string;
  status: "queued" | "processing" | "completed" | "failed" | "dry_run";
  provider: string;
  modelId?: string;
  requestId?: string;
  episodeId?: string;
  createdAt: string;
  completedAt?: string;
  outputUrl?: string;
  outputText?: string;
  error?: string;
};

type Episode = { id: string; title: string; generated_script?: string; status: string };
type QueueData = { episodes: Episode[] };

const JOB_STATUS_STYLE: Record<string, string> = {
  queued: "status-scripted",
  processing: "status-storyboarded",
  completed: "status-published",
  failed: "status-danger",
  dry_run: "status-planned",
};

const JOB_TYPE_ICON = {
  video: Video,
  voice: Brain,
  script: FileText,
  brain: Sparkles,
};

function isActiveJob(job: JobRecord) {
  return job.status === "queued" || job.status === "processing";
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

function JobRow({ job, onPoll }: { job: JobRecord; onPoll: (id: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const Icon = JOB_TYPE_ICON[job.type] ?? Brain;

  async function poll() {
    setPolling(true);
    await onPoll(job.id);
    setPolling(false);
  }

  function handleCopyPrompt() {
    if (job.outputText) {
      copyToClipboard(job.outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Detect if outputText looks like a Seedance prompt (video job or contains "prompt" cues)
  const hasSeedancePrompt =
    job.outputText &&
    (job.type === "video" || job.outputText.length > 20);

  return (
    <article className="job-row-card">
      <div className="job-row-header" onClick={() => setExpanded(!expanded)}>
        <div className="job-row-left">
          <Icon size={15} />
          <span className="job-label-text">{job.label}</span>
          {job.episodeId && <span className="ep-tag">{job.episodeId}</span>}
        </div>
        <div className="job-row-right">
          <span className={`ep-status ${JOB_STATUS_STYLE[job.status] ?? "status-planned"}`}>
            {job.status}
          </span>
          <span className="job-time-small">
            {new Date(job.createdAt).toLocaleString()}
          </span>
          {isActiveJob(job) ? (
            <button
              type="button"
              className="ep-btn secondary"
              style={{ padding: "4px 10px", fontSize: "0.75rem" }}
              onClick={(e) => { e.stopPropagation(); void poll(); }}
              disabled={polling}
            >
              {polling ? <RefreshCw size={12} className="spin" /> : <RefreshCw size={12} />}
              Poll
            </button>
          ) : null}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>
      {expanded && (
        <div className="job-row-detail">
          <div className="job-meta-grid">
            <div><span>Type</span><strong>{job.type}</strong></div>
            <div><span>Provider</span><strong>{job.provider}</strong></div>
            {job.requestId && <div><span>Request ID</span><code>{job.requestId}</code></div>}
            {job.modelId && <div><span>Model</span><code>{job.modelId}</code></div>}
            {job.completedAt && <div><span>Completed</span><strong>{new Date(job.completedAt).toLocaleString()}</strong></div>}
          </div>
          {job.outputText && (
            <div className="job-output-preview">
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <strong>Output preview</strong>
                {hasSeedancePrompt && (
                  <button
                    type="button"
                    className="ep-btn secondary copy-btn"
                    style={{ padding: "2px 8px", fontSize: "0.7rem" }}
                    onClick={handleCopyPrompt}
                  >
                    {copied ? <CheckCircle2 size={11} /> : <FileText size={11} />}
                    {copied ? "Copied!" : "Copy Prompt"}
                  </button>
                )}
              </div>
              <pre>{job.outputText}</pre>
            </div>
          )}
          {job.outputUrl && (
            <div>
              <a href={job.outputUrl} target="_blank" rel="noreferrer" className="dash-link-btn">
                View output
              </a>
            </div>
          )}
          {job.status === "failed" && job.error && (
            <div
              className="job-error"
              style={{
                background: "rgba(220, 38, 38, 0.15)",
                border: "1px solid rgba(220, 38, 38, 0.4)",
                borderRadius: "8px",
                padding: "12px",
                marginTop: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <AlertTriangle size={15} style={{ color: "#ef4444", flexShrink: 0 }} />
                <strong style={{ color: "#ef4444", fontSize: "0.85rem" }}>Job Failed</strong>
              </div>
              <pre style={{ color: "#fca5a5", fontSize: "0.8rem", whiteSpace: "pre-wrap", margin: 0 }}>
                {job.error}
              </pre>
            </div>
          )}
          {job.status !== "failed" && job.error && (
            <div className="job-error">
              <AlertTriangle size={13} />
              <span>{job.error}</span>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ScriptReview({ episodes }: { episodes: Episode[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const scripted = episodes.filter((ep) => ep.generated_script);
  const current = scripted.find((ep) => ep.id === selected) ?? scripted[0];

  function downloadScript(ep: Episode) {
    if (!ep.generated_script) return;
    const blob = new Blob([ep.generated_script], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ep.id}-${ep.title.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="script-review-layout">
      <nav className="script-nav">
        {scripted.length === 0 ? (
          <div className="empty-log">
            <FileText size={24} />
            <p>No scripts generated yet.</p>
            <p className="dim">
              Go to the Episodes tab, open an episode, and click "Generate Script with Claude".
            </p>
          </div>
        ) : (
          scripted.map((ep) => (
            <div key={ep.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                type="button"
                className={`script-nav-btn ${current?.id === ep.id ? "active" : ""}`}
                style={{ flex: 1 }}
                onClick={() => setSelected(ep.id)}
              >
                <span className="ep-number">{ep.id}</span>
                <span>{ep.title}</span>
                <CheckCircle2 size={13} />
              </button>
              <button
                type="button"
                className="ep-btn secondary download-btn"
                style={{ padding: "4px 8px", fontSize: "0.7rem", flexShrink: 0 }}
                title={`Download ${ep.id} script as .txt`}
                onClick={() => downloadScript(ep)}
              >
                <Download size={12} />
              </button>
            </div>
          ))
        )}
      </nav>
      <div className="script-viewer">
        {current ? (
          <>
            <div className="script-viewer-header">
              <strong>{current.id}: {current.title}</strong>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className={`ep-status status-${current.status.toLowerCase()}`}>{current.status}</span>
                <button
                  type="button"
                  className="ep-btn secondary download-btn"
                  style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                  onClick={() => downloadScript(current)}
                >
                  <Download size={12} />
                  Download .txt
                </button>
              </div>
            </div>
            <pre className="script-full">{current.generated_script}</pre>
          </>
        ) : (
          <div className="empty-log">
            <FileText size={32} />
            <p>Select a script to review.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkReview() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"jobs" | "scripts" | "video">("jobs");
  const [typeFilter, setTypeFilter] = useState<"all" | "video" | "script" | "brain">("all");
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    setLoading(true);
    const [j, q] = await Promise.allSettled([
      fetch("/api/jobs?limit=100").then((r) => r.json()),
      fetch("/api/episodes").then((r) => r.json()),
    ]);
    if (j.status === "fulfilled") setJobs(j.value as JobRecord[]);
    if (q.status === "fulfilled") setQueue(q.value as QueueData);
    setLoading(false);
  }

  async function pollJob(id: string) {
    try {
      await fetch(`/api/jobs/${id}/poll`, { method: "POST" });
      await load();
    } catch {
      /* ignore */
    }
  }

  // Auto-poll all active jobs every 8 seconds; stop when none remain active
  useEffect(() => {
    const hasActiveJobs = jobs.some(isActiveJob);

    if (hasActiveJobs) {
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(() => {
          void load();
        }, 8000);
      }
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [jobs]);

  useEffect(() => { void load(); }, []);

  const filteredJobs = jobs.filter((j) => typeFilter === "all" || j.type === typeFilter);
  const videoJobs = jobs.filter((j) => j.type === "video");
  const episodes = queue?.episodes ?? [];
  const hasActiveJobs = jobs.some(isActiveJob);

  return (
    <div className="view-grid work-review">
      <section className="panel">
        <div className="panel-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Sparkles size={20} />
            <h2>Work Review</h2>
            {hasActiveJobs && (
              <span className="auto-poll-indicator" title="Auto-polling active jobs every 8s">
                <span className="poll-dot" />
                polling
              </span>
            )}
          </div>
          <button type="button" className="icon-btn" onClick={() => void load()}>
            <RefreshCw size={15} className={loading ? "spin" : ""} />
          </button>
        </div>

        <div className="review-tabs">
          {([
            { id: "jobs", label: "All Jobs", count: jobs.length, icon: Brain },
            { id: "scripts", label: "Scripts", count: episodes.filter((e) => e.generated_script).length, icon: FileText },
            { id: "video", label: "Video Renders", count: videoJobs.length, icon: Video },
          ] as const).map((t) => {
            const Icon = t.icon;
            const showPulse = t.id === "jobs" && hasActiveJobs;
            return (
              <button
                key={t.id}
                type="button"
                className={`ep-tab ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}
                style={{ position: "relative" }}
              >
                <Icon size={14} />
                {t.label}
                <span className="tab-count">{t.count}</span>
                {showPulse && (
                  <span
                    className="poll-dot"
                    style={{ position: "absolute", top: "4px", right: "4px" }}
                    title="Jobs are running"
                  />
                )}
              </button>
            );
          })}
        </div>

        {tab === "jobs" && (
          <>
            <div className="job-filter-bar">
              {(["all", "video", "script", "brain"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`filter-chip ${typeFilter === f ? "active" : ""}`}
                  onClick={() => setTypeFilter(f)}
                >
                  {f}
                  <span className="filter-count">{f === "all" ? jobs.length : jobs.filter((j) => j.type === f).length}</span>
                </button>
              ))}
            </div>
            <div className="jobs-list">
              {loading && jobs.length === 0 ? (
                <div className="loading-panel"><RefreshCw size={20} className="spin" /></div>
              ) : filteredJobs.length === 0 ? (
                <div className="empty-log">
                  <Brain size={28} />
                  <p>No {typeFilter === "all" ? "" : typeFilter} jobs yet.</p>
                </div>
              ) : (
                filteredJobs.map((job) => <JobRow key={job.id} job={job} onPoll={pollJob} />)
              )}
            </div>
          </>
        )}

        {tab === "scripts" && (
          <ScriptReview episodes={episodes} />
        )}

        {tab === "video" && (
          <div className="video-review-panel">
            {videoJobs.length === 0 ? (
              <div className="empty-log">
                <Video size={32} />
                <p>No video jobs yet.</p>
                <p className="dim">
                  To generate video: open the Episodes tab, select an episode, switch to the Video
                  sub-tab, fill in a prompt, and click "Submit to Seedance".
                </p>
              </div>
            ) : (
              <div className="video-job-grid">
                {videoJobs.map((job) => (
                  <article key={job.id} className="video-job-card">
                    <div className="vjc-thumb">
                      {job.outputUrl ? (
                        <video src={job.outputUrl} controls muted />
                      ) : job.status === "completed" ? (
                        // Completed but no outputUrl yet — offer manual re-check
                        <div className="vjc-placeholder">
                          <Play size={20} />
                          <span>Output pending</span>
                          <button
                            type="button"
                            className="ep-btn secondary"
                            style={{ marginTop: "8px", padding: "4px 12px", fontSize: "0.75rem" }}
                            onClick={() => void pollJob(job.id)}
                          >
                            <RefreshCw size={12} />
                            Check Again
                          </button>
                        </div>
                      ) : (
                        <div className="vjc-placeholder">
                          {job.status === "queued" || job.status === "processing" ? (
                            <><RefreshCw size={20} className="spin" /><span>{job.status}</span></>
                          ) : job.status === "dry_run" ? (
                            <><Clock size={20} /><span>Dry run</span></>
                          ) : job.status === "failed" ? (
                            <><AlertTriangle size={20} /><span>Failed</span></>
                          ) : (
                            <><Play size={20} /><span>No output</span></>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="vjc-info">
                      <span className="job-label-text">{job.label}</span>
                      {job.episodeId && <span className="ep-tag">{job.episodeId}</span>}
                      <span className={`ep-status ${JOB_STATUS_STYLE[job.status] ?? "status-planned"}`}>{job.status}</span>
                      <span className="job-time-small">{new Date(job.createdAt).toLocaleDateString()}</span>
                      {job.requestId && <code className="request-id">{job.requestId.slice(0, 20)}…</code>}
                      {job.status === "failed" && job.error && (
                        <div
                          style={{
                            marginTop: "6px",
                            background: "rgba(220, 38, 38, 0.15)",
                            border: "1px solid rgba(220, 38, 38, 0.35)",
                            borderRadius: "6px",
                            padding: "6px 8px",
                            fontSize: "0.72rem",
                            color: "#fca5a5",
                          }}
                        >
                          <AlertTriangle size={11} style={{ display: "inline", marginRight: "4px", color: "#ef4444" }} />
                          {job.error.slice(0, 120)}{job.error.length > 120 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
