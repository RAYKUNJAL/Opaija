import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  FolderOpen,
  Gauge,
  Image,
  Key,
  Layers3,
  Megaphone,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Video,
  Zap,
} from "lucide-react";

type HealthData = {
  ok: boolean;
  claudeProvider: string;
  provider: string;
  voiceProvider: string;
  keys: Record<string, boolean>;
  seedance: string;
};

type EpisodeStatus = string;
type Episode = { id: string; title: string; status: EpisodeStatus; priority: number };
type ProductionStatus = {
  phase: string;
  episodes_completed: number;
  teaser_days_scheduled: number;
  character_sheets_locked: boolean;
  trailer_complete: boolean;
  cleared_for_launch: boolean;
};
type QueueData = { production_status: ProductionStatus; episodes: Episode[] };
type JobRecord = {
  id: string;
  type: string;
  label: string;
  status: string;
  createdAt: string;
  episodeId?: string;
};
type ContentLog = { total_published: number; platforms: Record<string, { total: number }> };
type AssetInventory = { totalFiles: number; totalSizeLabel: string; folders: Array<{ folder: string; label: string; totalFiles: number }> };

const STATUS_COLOR: Record<string, string> = {
  PLANNED: "#64748b", SCRIPTED: "#3b82f6", STORYBOARDED: "#7c3aed",
  VIDEO_GENERATED: "#ea580c", AUDIO_COMPLETE: "#0d9488",
  QA_PASSED: "#e4a700", SCHEDULED: "#a855f7", PUBLISHED: "#22c55e",
};

const KEY_LABELS: Record<string, string> = {
  anthropic: "Claude AI", fal: "Legacy fal.ai", replicate: "Replicate Video",
  elevenlabs: "ElevenLabs Voice", resend: "Resend Email",
  openai: "OpenAI", printful: "Printful", printify: "Printify",
};

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`status-dot ${ok ? "ok" : "off"}`} />;
}

export function MasterDashboard({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [contentLog, setContentLog] = useState<ContentLog | null>(null);
  const [assets, setAssets] = useState<AssetInventory | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [h, q, j, c, a] = await Promise.allSettled([
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/episodes").then((r) => r.json()),
      fetch("/api/jobs?limit=8").then((r) => r.json()),
      fetch("/api/content-log").then((r) => r.json()),
      fetch("/api/assets").then((r) => r.json()),
    ]);
    if (h.status === "fulfilled" && h.value && !h.value.error) setHealth(h.value as HealthData);
    if (q.status === "fulfilled" && q.value && !q.value.error && q.value.production_status) setQueue(q.value as QueueData);
    if (j.status === "fulfilled" && Array.isArray(j.value)) setJobs(j.value as JobRecord[]);
    if (c.status === "fulfilled" && c.value && !c.value.error) setContentLog(c.value as ContentLog);
    if (a.status === "fulfilled" && a.value && !a.value.error) setAssets(a.value as AssetInventory);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  const ps = queue?.production_status;
  const eps = queue?.episodes ?? [];
  const byStatus = eps.reduce<Record<string, number>>((acc, ep) => {
    acc[ep.status] = (acc[ep.status] ?? 0) + 1;
    return acc;
  }, {});

  const connectedKeys = health ? Object.values(health.keys).filter(Boolean).length : 0;
  const totalKeys = health ? Object.keys(health.keys).length : 0;

  return (
    <div className="view-grid master-dash">
      {/* Header strip */}
      <section className="dash-hero">
        <div className="dash-hero-copy">
          <span className="signal">Master Command Center</span>
          <h2>OPAIJA Studios — Season 1: Blood of the Gayelle</h2>
          <p>Production pipeline, storage, AI jobs, and review — all in one view.</p>
        </div>
        <div className="dash-hero-actions">
          <button type="button" className="primary-action" onClick={() => onNavigate("episodes")}>
            <Clapperboard size={16} /> Episode Queue
          </button>
          <button type="button" className="ghost-action" onClick={() => onNavigate("canon")}>
            <ShieldCheck size={16} /> Canon Guard
          </button>
          <button type="button" className="icon-btn dash-refresh" onClick={() => void refresh()} title="Refresh all">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
        </div>
      </section>

      {/* System health — API key status */}
      <section className="panel dash-health">
        <div className="panel-header">
          <div><Key size={18} /><h2>System Health</h2></div>
          <span className={connectedKeys === totalKeys ? "health-all-ok" : "health-partial"}>
            {connectedKeys}/{totalKeys} services connected
          </span>
        </div>
        <div className="health-grid">
          {health ? (
            Object.entries(health.keys).map(([key, ok]) => (
              <div key={key} className={`health-item ${ok ? "ok" : "off"}`}>
                <StatusDot ok={ok} />
                <span>{KEY_LABELS[key] ?? key}</span>
                <span className="health-tag">{ok ? "Connected" : "Not set"}</span>
              </div>
            ))
          ) : (
            <div className="loading-row"><RefreshCw size={16} className="spin" /> Checking…</div>
          )}
          {health && (
            <>
              <div className={`health-item ${health.seedance !== "dry_run" ? "ok" : "off"}`}>
                <StatusDot ok={health.seedance !== "dry_run"} />
                <span>Video Render Mode</span>
                <span className="health-tag">{health.seedance === "dry_run" ? "Dry run" : "Live renders"}</span>
              </div>
              <div className="health-item ok">
                <StatusDot ok />
                <span>Claude Brain</span>
                <span className="health-tag">{health.claudeProvider}</span>
              </div>
            </>
          )}
        </div>
        {health && !health.keys["anthropic"] && (
          <div className="health-tip">
            <AlertTriangle size={14} />
            <span>Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> to enable AI script generation.</span>
          </div>
        )}
        {health && !health.keys["replicate"] && (
          <div className="health-tip">
            <AlertTriangle size={14} />
            <span>Add <code>REPLICATE_API_TOKEN</code> to <code>.env</code> to enable live video rendering.</span>
          </div>
        )}
      </section>

      {/* Pre-launch gate + episode pipeline */}
      <section className="split-layout">
        <div className="panel">
          <div className="panel-header">
            <div><Gauge size={18} /><h2>Pre-Launch Gate</h2></div>
            <span className={ps?.cleared_for_launch ? "badge-green" : "badge-red"}>
              {ps?.cleared_for_launch ? "CLEARED" : "HOLD"}
            </span>
          </div>
          {ps ? (
            <div className="launch-gate-list">
              {[
                { label: "12 episodes complete", done: (ps?.episodes_completed ?? 0) >= 12, value: `${ps?.episodes_completed ?? 0}/12` },
                { label: "30 teaser days scheduled", done: (ps?.teaser_days_scheduled ?? 0) >= 30, value: `${ps?.teaser_days_scheduled ?? 0}/30` },
                { label: "Character sheets locked", done: ps?.character_sheets_locked ?? false, value: (ps?.character_sheets_locked) ? "Done" : "Pending" },
                { label: "Trailer complete", done: ps?.trailer_complete ?? false, value: (ps?.trailer_complete) ? "Done" : "Pending" },
              ].map((item) => (
                <div key={item.label} className={`gate-row ${item.done ? "done" : "pending"}`}>
                  {item.done ? <CheckCircle2 size={15} /> : <Activity size={15} />}
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
              <button type="button" className="dash-link-btn" onClick={() => onNavigate("episodes")}>
                <Clapperboard size={13} /> Open Episode Queue <ExternalLink size={12} />
              </button>
            </div>
          ) : <div className="loading-row"><RefreshCw size={16} className="spin" /></div>}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div><Activity size={18} /><h2>Episode Pipeline</h2></div>
            <span>{eps.length} episodes</span>
          </div>
          <div className="pipeline-status-bars">
            {Object.entries(STATUS_COLOR).map(([status, color]) => {
              const count = byStatus[status] ?? 0;
              if (count === 0) return null;
              return (
                <div key={status} className="pipeline-bar-row">
                  <span className="pipeline-bar-label">{status.replace(/_/g, " ")}</span>
                  <div className="pipeline-bar-track">
                    <div
                      className="pipeline-bar-fill"
                      style={{ width: `${(count / 12) * 100}%`, background: color }}
                    />
                  </div>
                  <span className="pipeline-bar-count">{count}</span>
                </div>
              );
            })}
          </div>
          <div className="pipeline-ep-mini">
            {eps.map((ep) => (
              <div
                key={ep.id}
                className="ep-mini-chip"
                style={{ borderColor: STATUS_COLOR[ep.status] ?? "#333" }}
                title={`${ep.id}: ${ep.title} — ${ep.status}`}
              >
                <span style={{ color: STATUS_COLOR[ep.status] ?? "#666" }}>{ep.id}</span>
              </div>
            ))}
          </div>
          <button type="button" className="dash-link-btn" onClick={() => onNavigate("episodes")}>
            <Clapperboard size={13} /> Manage Episodes <ExternalLink size={12} />
          </button>
        </div>
      </section>

      {/* Stats row */}
      <section className="dash-stats-row">
        {[
          { icon: Image, label: "Character Sheets", value: "10/10", detail: "All P1 cast loaded", ok: true },
          { icon: Layers3, label: "Season Episodes", value: `${eps.length}`, detail: "Season 1 — Blood of the Gayelle", ok: true },
          { icon: TrendingUp, label: "Published", value: `${contentLog?.total_published ?? 0}`, detail: "Across all platforms", ok: (contentLog?.total_published ?? 0) > 0 },
          { icon: FolderOpen, label: "Asset Files", value: assets ? String(assets.totalFiles) : "—", detail: assets ? assets.totalSizeLabel + " total" : "Scanning…", ok: (assets?.totalFiles ?? 0) > 0 },
          { icon: Brain, label: "AI Jobs", value: `${jobs.length}`, detail: "Recent tasks", ok: jobs.length > 0 },
          { icon: Video, label: "Video Mode", value: health?.seedance === "dry_run" ? "Dry Run" : "Live", detail: health?.provider ?? "—", ok: health?.seedance !== "dry_run" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className="dash-stat">
              <Icon size={20} />
              <span className="dash-stat-label">{stat.label}</span>
              <strong className={stat.ok ? "" : "dim"}>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          );
        })}
      </section>

      {/* Quick nav grid */}
      <section className="panel">
        <div className="panel-header">
          <div><Zap size={18} /><h2>Quick Access</h2></div>
        </div>
        <div className="quick-nav-grid">
          {[
            { view: "episodes", icon: Clapperboard, label: "Episode Queue", desc: "Manage all 12 episodes, generate scripts, submit video jobs" },
            { view: "canon", icon: ShieldCheck, label: "Canon Guard + QA", desc: "Run QA checklists, live Claude brain, canon rules" },
            { view: "storage", icon: FolderOpen, label: "Asset Storage", desc: "Browse all character sheets, video, audio, and exports" },
            { view: "review", icon: Sparkles, label: "Work Review", desc: "Review generated scripts, AI jobs, and video renders" },
            { view: "publishing", icon: Megaphone, label: "Publishing", desc: "Platform stats, content log, 12-week launch calendar" },
            { view: "growth", icon: TrendingUp, label: "Growth & Leads", desc: "Fan leads, founder list, referral leaderboard" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.view} type="button" className="quick-nav-card" onClick={() => onNavigate(item.view)}>
                <Icon size={22} />
                <strong>{item.label}</strong>
                <p>{item.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent jobs */}
      <section className="split-layout">
        <div className="panel">
          <div className="panel-header">
            <div><Brain size={18} /><h2>Recent AI Jobs</h2></div>
            <button type="button" className="dash-link-btn" onClick={() => onNavigate("review")}>
              View all <ExternalLink size={12} />
            </button>
          </div>
          {jobs.length === 0 ? (
            <div className="empty-log">
              <Brain size={28} />
              <p>No jobs yet.</p>
              <p className="dim">Generate a script or video to see jobs here.</p>
            </div>
          ) : (
            <div className="recent-jobs-list">
              {jobs.slice(0, 6).map((job) => (
                <div key={job.id} className="recent-job-row">
                  <div className="job-type-icon">
                    {job.type === "video" ? <Video size={14} /> : job.type === "script" ? <Play size={14} /> : <Brain size={14} />}
                  </div>
                  <div className="job-info">
                    <span className="job-label">{job.label}</span>
                    {job.episodeId && <span className="job-ep">{job.episodeId}</span>}
                  </div>
                  <span className={`job-status-badge ${job.status}`}>{job.status}</span>
                  <span className="job-time">{new Date(job.createdAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div><FolderOpen size={18} /><h2>Asset Storage</h2></div>
            <button type="button" className="dash-link-btn" onClick={() => onNavigate("storage")}>
              Browse <ExternalLink size={12} />
            </button>
          </div>
          {assets ? (
            <div className="asset-summary-list">
              {assets.folders.map((folder) => (
                <div key={folder.folder} className="asset-summary-row">
                  <span className="asset-folder-label">{folder.label}</span>
                  <div className="asset-count-bar">
                    <div
                      className="asset-count-fill"
                      style={{ width: `${Math.min((folder.totalFiles / 15) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="asset-count">{folder.totalFiles} files</span>
                </div>
              ))}
              <div className="asset-total">
                <FolderOpen size={13} />
                <span>{assets.totalFiles} total files · {assets.totalSizeLabel}</span>
              </div>
            </div>
          ) : (
            <div className="loading-row"><RefreshCw size={16} className="spin" /> Scanning assets…</div>
          )}
        </div>
      </section>
    </div>
  );
}
