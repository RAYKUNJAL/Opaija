import { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Megaphone,
  RefreshCw,
  Radio,
  Youtube,
  ExternalLink,
} from "lucide-react";

type Platform = "youtube_shorts" | "tiktok" | "instagram" | "webtoon" | "gumroad";

type PlatformStats = {
  total: number;
  subscribers?: number;
  followers?: number;
  total_chapters?: number;
  total_items?: number;
  revenue_usd?: number;
  last_post: string | null;
  last_chapter?: string | null;
};

type ContentLogEntry = {
  episodeId: string;
  platform: string;
  url?: string;
  publishedAt: string;
};

type ContentLog = {
  total_published: number;
  platforms: Record<Platform, PlatformStats>;
  published_content: ContentLogEntry[];
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube_shorts: "YouTube Shorts",
  tiktok: "TikTok",
  instagram: "Instagram Reels",
  webtoon: "Webtoon",
  gumroad: "Gumroad",
};

const PLATFORM_ICONS: Record<string, string> = {
  youtube_shorts: "▶",
  tiktok: "♪",
  instagram: "◈",
  webtoon: "📖",
  gumroad: "$",
};

const POSTING_SCHEDULE = [
  { week: "Week 1–2", focus: "Logo tease + world concept", output: "3 posts (logo reveal, tagline, world lore drop)" },
  { week: "Week 3–4", focus: "Character reveals", output: "Kai, Nia, Malik — 1 per day with hooks" },
  { week: "Week 5", focus: "Power system explainer", output: "The Five Parts short (45s)" },
  { week: "Week 6", focus: "Food culture + doubles comedy", output: "What is doubles? — viral hook" },
  { week: "Week 7", focus: "Folklore drop", output: "Real history of stick fighting (60s)" },
  { week: "Week 8", focus: "Villain tease", output: "Silhouette only + one line" },
  { week: "Week 9–12", focus: "Episode buffer + more reveals", output: "Build to EP001 launch" },
];

function LogEntryCard({ entry }: { entry: ContentLogEntry }) {
  return (
    <article className="log-entry">
      <div>
        <strong>{entry.episodeId}</strong>
        <span className="log-platform">{PLATFORM_LABELS[entry.platform] ?? entry.platform}</span>
      </div>
      <div>
        <span className="log-time">{new Date(entry.publishedAt).toLocaleDateString()}</span>
        {entry.url && (
          <a href={entry.url} target="_blank" rel="noreferrer" className="log-link">
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </article>
  );
}

export function PublishingView() {
  const [contentLog, setContentLog] = useState<ContentLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [logEpisodeId, setLogEpisodeId] = useState("");
  const [logPlatform, setLogPlatform] = useState<Platform>("youtube_shorts");
  const [logUrl, setLogUrl] = useState("");
  const [logStatus, setLogStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function loadLog() {
    setLoading(true);
    try {
      const res = await fetch("/api/content-log");
      setContentLog(await res.json() as ContentLog);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadLog(); }, []);

  async function logContent(e: React.FormEvent) {
    e.preventDefault();
    if (!logEpisodeId.trim()) return;
    setLogStatus("saving");
    try {
      await fetch("/api/content-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: logEpisodeId, platform: logPlatform, url: logUrl }),
      });
      setLogStatus("saved");
      setLogEpisodeId("");
      setLogUrl("");
      await loadLog();
    } catch {
      setLogStatus("error");
    }
  }

  return (
    <div className="view-grid publishing-view">
      {/* Platform Stats */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <Megaphone size={20} />
            <h2>Platform Stats</h2>
          </div>
          <button type="button" className="icon-btn" onClick={() => void loadLog()}>
            <RefreshCw size={16} />
          </button>
        </div>

        {loading ? (
          <div className="loading-row"><RefreshCw size={20} className="spin" /> Loading…</div>
        ) : contentLog ? (
          <div className="platform-stats-grid">
            {(Object.entries(contentLog.platforms) as [Platform, PlatformStats][]).map(([key, stats]) => (
              <article key={key} className="platform-card">
                <div className="platform-icon">{PLATFORM_ICONS[key]}</div>
                <h3>{PLATFORM_LABELS[key] ?? key}</h3>
                <div className="platform-metrics">
                  <div>
                    <span>Posts</span>
                    <strong>{stats.total}</strong>
                  </div>
                  {stats.subscribers != null && (
                    <div>
                      <span>Subscribers</span>
                      <strong>{stats.subscribers.toLocaleString()}</strong>
                    </div>
                  )}
                  {stats.followers != null && (
                    <div>
                      <span>Followers</span>
                      <strong>{stats.followers.toLocaleString()}</strong>
                    </div>
                  )}
                  {stats.revenue_usd != null && (
                    <div>
                      <span>Revenue</span>
                      <strong>${stats.revenue_usd.toFixed(2)}</strong>
                    </div>
                  )}
                </div>
                <span className="last-post">
                  {stats.last_post ? `Last: ${new Date(stats.last_post).toLocaleDateString()}` : "No posts yet"}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p>Could not load content log.</p>
        )}

        {contentLog && (
          <div className="total-published">
            <CheckCircle2 size={18} />
            <span>Total published: <strong>{contentLog.total_published}</strong></span>
          </div>
        )}
      </section>

      {/* Log New Content */}
      <section className="split-layout">
        <div className="panel">
          <div className="panel-header">
            <div>
              <Radio size={20} />
              <h2>Log Published Content</h2>
            </div>
          </div>
          <form className="log-form" onSubmit={(e) => void logContent(e)}>
            <label>
              Episode / Content ID
              <input
                value={logEpisodeId}
                onChange={(e) => setLogEpisodeId(e.target.value)}
                placeholder="EP001, TEASER_01, etc."
              />
            </label>
            <label>
              Platform
              <select value={logPlatform} onChange={(e) => setLogPlatform(e.target.value as Platform)}>
                <option value="youtube_shorts">YouTube Shorts</option>
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram Reels</option>
                <option value="webtoon">Webtoon</option>
                <option value="gumroad">Gumroad</option>
              </select>
            </label>
            <label>
              URL (optional)
              <input
                value={logUrl}
                onChange={(e) => setLogUrl(e.target.value)}
                placeholder="https://..."
                type="url"
              />
            </label>
            <button type="submit" className="ep-btn primary" disabled={logStatus === "saving"}>
              {logStatus === "saving" ? <RefreshCw size={15} className="spin" /> : <CheckCircle2 size={15} />}
              {logStatus === "saving" ? "Logging…" : logStatus === "saved" ? "Logged!" : "Log Content"}
            </button>
            {logStatus === "error" && <span className="error-msg">Could not log content. Try again.</span>}
          </form>
        </div>

        {/* Content Log Feed */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <Clock size={20} />
              <h2>Published Feed</h2>
            </div>
            <span>{contentLog?.published_content.length ?? 0} entries</span>
          </div>
          <div className="content-log-list">
            {contentLog?.published_content.length ? (
              [...contentLog.published_content]
                .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
                .map((entry, i) => <LogEntryCard key={i} entry={entry} />)
            ) : (
              <div className="empty-log">
                <Radio size={28} />
                <p>No published content yet.</p>
                <p className="dim">Log your first post above to start tracking.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Posting Strategy */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <CalendarDays size={20} />
            <h2>12-Week Pre-Launch Calendar</h2>
          </div>
          <span>Build 30-day warm audience before EP001</span>
        </div>
        <div className="schedule-grid">
          {POSTING_SCHEDULE.map((week) => (
            <article key={week.week} className="schedule-card">
              <strong>{week.week}</strong>
              <h4>{week.focus}</h4>
              <p>{week.output}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Social Links */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <Youtube size={20} />
            <h2>Live Channels</h2>
          </div>
        </div>
        <div className="channels-grid">
          {[
            { name: "YouTube", handle: "@Opaija", url: "https://www.youtube.com/@Opaija" },
            { name: "Instagram", handle: "@opa_ija", url: "https://www.instagram.com/opa_ija/" },
          ].map((channel) => (
            <a key={channel.name} href={channel.url} target="_blank" rel="noreferrer" className="channel-card">
              <strong>{channel.name}</strong>
              <span>{channel.handle}</span>
              <ExternalLink size={14} />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
