import { useEffect, useState } from "react";
import {
  Brain,
  CheckCircle2,
  Clock,
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

function JobRow({ job, onPoll }: { job: JobRecord; onPoll: (id: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [polling, setPolling] = useState(false);
  const Icon = JOB_TYPE_ICON[job.type] ?? Brain;

  async function poll() {
    setPolling(true);
    await onPoll(job.id);
    setPolling(false);
  }

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
          {job.status === "queued" || job.status === "processing" ? (
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
              <strong>Output preview</strong>
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
          {job.error && (
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

  return (
    <div className="script-review-layout">
      <nav className="script-nav">
        {scripted.length === 0 ? (
          <div className="empty-log">
            <FileText size={24} />
            <p>No scripts generated yet.</p>
            <p className="dim">Go to Episodes and hit Generate Script.</p>
          </div>
        ) : (
          scripted.map((ep) => (
            <button
              key={ep.id}
              type="button"
              className={`script-nav-btn ${current?.id === ep.id ? "active" : ""}`}
              onClick={() => setSelected(ep.id)}
            >
              <span className="ep-number">{ep.id}</span>
              <span>{ep.title}</span>
              <CheckCircle2 size={13} />
            </button>
          ))
        )}
      </nav>
      <div className="script-viewer">
        {current ? (
          <>
            <div className="script-viewer-header">
              <strong>{current.id}: {current.title}</strong>
              <span className={`ep-status status-${current.status.toLowerCase()}`}>{current.status}</span>
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

  useEffect(() => { void load(); }, []);

  const filteredJobs = jobs.filter((j) => typeFilter === "all" || j.type === typeFilter);
  const videoJobs = jobs.filter((j) => j.type === "video");
  const episodes = queue?.episodes ?? [];

  return (
    <div className="view-grid work-review">
      <section className="panel">
        <div className="panel-header">
          <div><Sparkles size={20} /><h2>Work Review</h2></div>
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
            return (
              <button
                key={t.id}
                type="button"
                className={`ep-tab ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                <Icon size={14} />
                {t.label}
                <span className="tab-count">{t.count}</span>
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
                <p className="dim">Go to Episodes → select an episode → Video tab → Submit to Seedance.</p>
              </div>
            ) : (
              <div className="video-job-grid">
                {videoJobs.map((job) => (
                  <article key={job.id} className="video-job-card">
                    <div className="vjc-thumb">
                      {job.outputUrl ? (
                        <video src={job.outputUrl} controls muted />
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
