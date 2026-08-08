import { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Edit3,
  ExternalLink,
  Megaphone,
  RefreshCw,
  Radio,
  Send,
  Users,
  Youtube,
} from "lucide-react";
import { apiUrl } from "../lib/api";

type ViewMode = "publishing" | "growth";

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

type BlogPostStatus = "draft" | "scheduled" | "published" | "archived";

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  tags: string[];
  region?: string;
  seoTitle?: string;
  seoDescription?: string;
  status: BlogPostStatus;
  publishAt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  imageUrl?: string;
};

type BlogSchedule = {
  cadence: string[];
  publishedThisWeek: number;
  totalPublished: number;
  nextPublishAt: string | null;
  upcoming: Array<{ title: string; slug: string; publishAt?: string; status: BlogPostStatus }>;
};

type FunnelKpi = {
  totalLeads: number;
  eventsByName: Record<string, number>;
  tripwireRate: string | number;
  lastSeen: string | null;
  recentEvents: Array<{ event: string; ts: string; metadata?: Record<string, unknown> }>;
};

type GrowthSummary = {
  leadCount: number;
  contestOptIns: number;
  bySource: Record<string, number>;
  topReferrers: Array<{
    name: string;
    email: string;
    referralCode: string;
    referralLink: string;
    referrals: number;
    clicks: number;
  }>;
};

type ActionState = "idle" | "saving" | "saved" | "error";

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

const POST_SCHEDULE_CADENCE = [
  { label: "Morning SEO push", desc: "Geo-targeted discovery post, conversion-first hooks" },
  { label: "Evening retention push", desc: "Retention, CTA, referral and CRO nudges" },
];

function formatDateTime(value?: string): string {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Invalid date";
  return parsed.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatDateLabel(value?: string): string {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Invalid date";
  return parsed.toISOString().slice(0, 16).replace("T", " ");
}

function toAuthHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers["x-admin-session"] = token;
  return headers;
}

function toJsonHeaders(token: string | null): Record<string, string> {
  return { ...toAuthHeaders(token), "Content-Type": "application/json" };
}

function toRate(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return `${n.toFixed(2)}%`;
}

function sortedEntries(payload: Record<string, number>) {
  return Object.entries(payload).sort(([, aCount], [, bCount]) => bCount - aCount);
}

function LogEntryCard({ entry }: { entry: ContentLogEntry }) {
  const date = new Date(entry.publishedAt);
  const formattedDate = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const formattedTime = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const platformIcon = PLATFORM_ICONS[entry.platform] ?? "•";
  const platformLabel = PLATFORM_LABELS[entry.platform] ?? entry.platform;

  return (
    <article className="log-entry">
      <div className="log-entry-left">
        <span className="ep-badge">{entry.episodeId}</span>
        <span className="log-platform-tag">
          <span className="log-platform-icon">{platformIcon}</span>
          {platformLabel}
        </span>
      </div>
      <div className="log-entry-right">
        <span className="log-time" title={date.toISOString()}>{formattedDate} · {formattedTime}</span>
        {entry.url && (
          <a href={entry.url} target="_blank" rel="noreferrer" className="log-link" title="Open post">
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </article>
  );
}

export function PublishingView({ token, mode = "publishing" }: { token: string | null; mode?: ViewMode }) {
  const isGrowthMode = mode === "growth";

  const [contentLog, setContentLog] = useState<ContentLog | null>(null);
  const [loading, setLoading] = useState(true);

  const [logEpisodeId, setLogEpisodeId] = useState("");
  const [logPlatform, setLogPlatform] = useState<Platform>("youtube_shorts");
  const [logUrl, setLogUrl] = useState("");
  const [logStatus, setLogStatus] = useState<ActionState>("idle");
  const [loggedEntry, setLoggedEntry] = useState<ContentLogEntry | null>(null);
  const [episodeIdError, setEpisodeIdError] = useState(false);

  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogSchedule, setBlogSchedule] = useState<BlogSchedule | null>(null);
  const [growthKpi, setGrowthKpi] = useState<FunnelKpi | null>(null);
  const [growthSummary, setGrowthSummary] = useState<GrowthSummary | null>(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [postStatus, setPostStatus] = useState<ActionState>("idle");
  const [postError, setPostError] = useState("");
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostExcerpt, setNewPostExcerpt] = useState("");
  const [newPostBody, setNewPostBody] = useState("");
  const [newPostRegion, setNewPostRegion] = useState("");
  const [newPostTags, setNewPostTags] = useState("");
  const [customPublishAt, setCustomPublishAt] = useState("");
  const [postActionState, setPostActionState] = useState<Record<string, ActionState>>({});
  const [growthFilter, setGrowthFilter] = useState<BlogPostStatus | "all">("all");
  const [growthError, setGrowthError] = useState("");

  const filteredBlogPosts =
    growthFilter === "all" ? blogPosts : blogPosts.filter((post) => post.status === growthFilter);

  const growthPostStatuses: Array<BlogPostStatus | "all"> = ["all", "draft", "scheduled", "published", "archived"];

  async function loadLog() {
    setLoading(true);
    try {
      const headers = toAuthHeaders(token);
      const res = await fetch(apiUrl("/api/content-log"), { headers });
      if (!res.ok) {
        setContentLog(null);
        return;
      }
      const data = (await res.json()) as Partial<ContentLog> | { error?: string };
      if (
        !data ||
        typeof data !== "object" ||
        typeof (data as ContentLog).total_published !== "number" ||
        typeof (data as ContentLog).platforms !== "object" ||
        (data as ContentLog).platforms === null ||
        !Array.isArray((data as ContentLog).published_content)
      ) {
        setContentLog(null);
        return;
      }
      setContentLog(data as ContentLog);
    } catch {
      setContentLog(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadGrowthAssets() {
    if (!isGrowthMode) return;
    setGrowthLoading(true);
    setGrowthError("");
    try {
      const headers = toAuthHeaders(token);
      const [postsRes, scheduleRes, kpiRes, summaryRes] = await Promise.all([
        fetch(apiUrl("/api/blog/posts?limit=60"), { headers }),
        fetch(apiUrl("/api/blog/schedule"), { headers }),
        fetch(apiUrl("/api/funnel/kpi"), { headers }),
        fetch(apiUrl("/api/growth/summary"), { headers }),
      ]);
      if (!postsRes.ok || !scheduleRes.ok || !kpiRes.ok || !summaryRes.ok) {
        throw new Error("Could not load growth systems.");
      }
      const [postsData, scheduleData, kpiData, summaryData] = await Promise.all([
        postsRes.json(),
        scheduleRes.json(),
        kpiRes.json(),
        summaryRes.json(),
      ]);
      setBlogPosts(Array.isArray(postsData) ? (postsData as BlogPost[]) : []);
      setBlogSchedule(scheduleData as BlogSchedule);
      setGrowthKpi(kpiData as FunnelKpi);
      setGrowthSummary(summaryData as GrowthSummary);
    } catch (error) {
      setGrowthError(error instanceof Error ? error.message : "Could not load growth systems.");
    } finally {
      setGrowthLoading(false);
    }
  }

  useEffect(() => {
    void loadLog();
    void loadGrowthAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, token]);

  async function logContent(event: React.FormEvent) {
    event.preventDefault();
    if (!logEpisodeId.trim()) {
      setEpisodeIdError(true);
      return;
    }
    setEpisodeIdError(false);
    setLogStatus("saving");
    setLoggedEntry(null);
    try {
      const body = { episodeId: logEpisodeId.trim(), platform: logPlatform, url: logUrl || undefined };
      await fetch(apiUrl("/api/content-log"), {
        method: "POST",
        headers: toJsonHeaders(token),
        body: JSON.stringify(body),
      });
      setLoggedEntry({ episodeId: body.episodeId, platform: body.platform, url: body.url, publishedAt: new Date().toISOString() });
      setLogStatus("saved");
      setLogEpisodeId("");
      setLogUrl("");
      await loadLog();
    } catch {
      setLogStatus("error");
    }
  }

  async function createGrowthPost(event: React.FormEvent) {
    event.preventDefault();
    if (!newPostTitle.trim() || !newPostExcerpt.trim() || !newPostBody.trim()) {
      setPostStatus("error");
      setPostError("Title, excerpt, and body are required.");
      return;
    }
    setPostStatus("saving");
    setPostError("");
    try {
      const response = await fetch(apiUrl("/api/blog/posts"), {
        method: "POST",
        headers: toJsonHeaders(token),
        body: JSON.stringify({
          title: newPostTitle.trim(),
          excerpt: newPostExcerpt.trim(),
          body: newPostBody.trim(),
          region: newPostRegion.trim() || undefined,
          tags: newPostTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          source: "admin",
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Could not create post.");
      }

      setPostStatus("saved");
      setNewPostTitle("");
      setNewPostExcerpt("");
      setNewPostBody("");
      setNewPostRegion("");
      setNewPostTags("");
      await loadGrowthAssets();
    } catch (error) {
      setPostStatus("error");
      setPostError(error instanceof Error ? error.message : "Could not create post.");
    }
  }

  function updatePostActionState(slug: string, status: ActionState) {
    setPostActionState((prev) => ({ ...prev, [slug]: status }));
  }

  async function runPostAction(slug: string, action: "schedule" | "publish") {
    try {
      updatePostActionState(slug, "saving");
      const scheduleEndpoint = action === "schedule" ? `/api/blog/posts/${slug}/schedule` : `/api/blog/posts/${slug}/publish`;
      const payload = action === "schedule"
        ? ({ publishAt: customPublishAt ? new Date(customPublishAt).toISOString() : undefined } as { publishAt?: string })
        : undefined;
      const response = await fetch(apiUrl(scheduleEndpoint), {
        method: "POST",
        headers: action === "schedule" ? toJsonHeaders(token) : toAuthHeaders(token),
        body: payload ? JSON.stringify(payload) : undefined,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Unable to ${action} post.`);
      }
      updatePostActionState(slug, "saved");
      await loadGrowthAssets();
    } catch (error) {
      updatePostActionState(slug, "error");
      setGrowthError(error instanceof Error ? error.message : `Unable to ${action} post.`);
    }
  }

  return (
    <div className="view-grid publishing-view">
      {isGrowthMode ? (
        <>
          <section className="dash-stats-row">
            <article className="dash-stat">
              <CalendarDays size={20} />
              <span className="dash-stat-label">Blog cadence</span>
              <strong>
                {blogSchedule?.nextPublishAt ? formatDateLabel(blogSchedule.nextPublishAt) : "No slot yet"}
              </strong>
              <small>
                {blogSchedule?.cadence?.length ? `2-post/day windows: ${blogSchedule.cadence.join(", ")}` : "Initializing schedule"}
              </small>
            </article>
            <article className="dash-stat">
              <CheckCircle2 size={20} />
              <span className="dash-stat-label">Published this week</span>
              <strong>{blogSchedule?.publishedThisWeek ?? 0}</strong>
              <small>
                {`Total published: ${blogSchedule?.totalPublished ?? 0} · Target: ${(blogSchedule?.cadence.length ?? 0) * 7}/week`}
              </small>
            </article>
            <article className="dash-stat">
              <Users size={20} />
              <span className="dash-stat-label">Founders captured</span>
              <strong>{growthSummary?.leadCount ?? 0}</strong>
              <small>{`Contest opt-ins: ${growthSummary?.contestOptIns ?? 0}`}</small>
            </article>
            <article className="dash-stat">
              <Activity size={20} />
              <span className="dash-stat-label">Funnel conversion</span>
              <strong>{toRate(growthKpi?.tripwireRate ?? 0)}</strong>
              <small>{`Tripwire rate from ${growthKpi?.totalLeads ?? 0} leads`}</small>
            </article>
          </section>

          <section className="split-layout">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <Edit3 size={20} />
                  <h2>Growth blog CMS</h2>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void loadGrowthAssets()}
                  title="Reload blog data"
                  disabled={growthLoading}
                >
                  <RefreshCw size={16} className={growthLoading ? "spin" : ""} />
                  <span>Refresh</span>
                </button>
              </div>

              <form className="log-form" onSubmit={(e) => void createGrowthPost(e)}>
                <label>
                  Title <span className="required-star">*</span>
                  <input
                    value={newPostTitle}
                    onChange={(event) => setNewPostTitle(event.target.value)}
                    placeholder="Morning SEO angle or community story angle"
                  />
                </label>
                <label>
                  Excerpt <span className="required-star">*</span>
                  <input
                    value={newPostExcerpt}
                    onChange={(event) => setNewPostExcerpt(event.target.value)}
                    placeholder="1–2 sharp lines that set the conversion hook"
                  />
                </label>
                <label>
                  Body <span className="required-star">*</span>
                  <textarea
                    value={newPostBody}
                    onChange={(event) => setNewPostBody(event.target.value)}
                    placeholder="Write post body in markdown-like paragraphs"
                    rows={10}
                  />
                </label>
                <label>
                  Region (optional)
                  <input
                    value={newPostRegion}
                    onChange={(event) => setNewPostRegion(event.target.value)}
                    placeholder="Trinidad and Tobago / Tobago / Caribbean"
                  />
                </label>
                <label>
                  Tags (comma separated)
                  <input
                    value={newPostTags}
                    onChange={(event) => setNewPostTags(event.target.value)}
                    placeholder="growth, seo, geo, anime"
                  />
                </label>
                <button type="submit" className="ep-btn primary" disabled={postStatus === "saving"}>
                  {postStatus === "saving" ? <RefreshCw size={15} className="spin" /> : <Send size={15} />}
                  {postStatus === "saving" ? "Creating…" : "Create post draft"}
                </button>
              </form>

              {postStatus === "error" ? <span className="error-msg">{postError}</span> : null}
              {postStatus === "saved" ? (
                <div className="log-success">
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>Post created.</strong>
                    <p>New post is now in draft and can be scheduled from the right panel.</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <ClipboardList size={20} />
                  <h2>All posts + actions</h2>
                </div>
                <div className="mode-row">
                  {growthPostStatuses.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={growthFilter === status ? "mode-button active" : "mode-button"}
                      onClick={() => setGrowthFilter(status)}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <label>
                Optional custom publish time (local browser timezone)
                <input
                  type="datetime-local"
                  value={customPublishAt}
                  onChange={(event) => setCustomPublishAt(event.target.value)}
                  title="Optional custom schedule timestamp"
                />
              </label>

              <div className="blog-post-list">
                {growthLoading ? (
                  <div className="loading-row"><RefreshCw size={16} className="spin" /> Loading posts…</div>
                ) : null}
                {growthError ? <p className="error-msg">{growthError}</p> : null}
                {!growthLoading && filteredBlogPosts.length === 0 ? (
                  <div className="empty-log">
                    <Radio size={28} />
                    <p>No posts matching this view.</p>
                    <p className="dim">Publish drafts and schedules are managed from the form.</p>
                  </div>
                ) : null}
                {filteredBlogPosts.map((post) => {
                  const actionState = postActionState[post.slug] ?? "idle";
                  return (
                    <article key={post.slug} className="blog-post-row">
                      <div className="blog-post-main">
                        <div className="blog-post-top">
                          <strong>{post.title}</strong>
                          <span className={`status-pill status-${post.status}`}>{post.status}</span>
                        </div>
                        <div className="blog-post-meta">
                          <span>/{post.slug}</span>
                          <span>{post.region ? `Geo: ${post.region}` : "Geo: global"}</span>
                          <span>Updated: {formatDateTime(post.updatedAt)}</span>
                        </div>
                        {post.publishAt ? <span className="dim">Publish at: {formatDateTime(post.publishAt)}</span> : null}
                        <div className="blog-post-tags">
                          {post.tags.length ? (
                            post.tags.map((tag) => (
                              <span key={tag} className="blog-tag">
                                #{tag}
                              </span>
                            ))
                          ) : (
                            <span className="dim">No tags</span>
                          )}
                        </div>
                      </div>
                      <div className="blog-post-actions">
                        <a className="dash-link-btn" href={`/blog/${encodeURIComponent(post.slug)}`} target="_blank" rel="noreferrer">
                          Open public post
                        </a>
                        {post.status !== "published" ? (
                          <>
                            <button
                              type="button"
                              className="ep-btn secondary"
                              disabled={actionState === "saving"}
                              onClick={() => void runPostAction(post.slug, "schedule")}
                            >
                              {actionState === "saving" ? <RefreshCw size={14} className="spin" /> : <CalendarDays size={14} />}
                              {customPublishAt ? "Schedule custom" : "Schedule next slot"}
                            </button>
                            <button
                              type="button"
                              className="ep-btn primary"
                              disabled={actionState === "saving"}
                              onClick={() => void runPostAction(post.slug, "publish")}
                            >
                              {actionState === "saving" ? <RefreshCw size={14} className="spin" /> : <CheckCircle2 size={14} />}
                              Publish now
                            </button>
                            {actionState === "error" ? <span className="error-msg">Action failed</span> : null}
                          </>
                        ) : (
                          <span className="dim">{`Published ${formatDateTime(post.publishedAt)}`}</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="split-layout">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <Clock size={20} />
                  <h2>CRO & SEO signals</h2>
                </div>
              </div>
              <div className="metric-note">
                {growthSummary ? (
                  <>
                    <div className="signal-row">
                      <strong>Lead sources</strong>
                      <div className="signal-list">
                        {sortedEntries(growthSummary.bySource).map(([source, count]) => (
                          <div key={source} className="signal-item">
                            <span>{source}</span>
                            <strong>{count}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="signal-row">
                      <strong>Conversion events</strong>
                      <div className="signal-list">
                        {sortedEntries(growthKpi?.eventsByName ?? {}).map(([eventName, count]) => (
                          <div key={eventName} className="signal-item">
                            <span>{eventName}</span>
                            <strong>{count}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="loading-row"><RefreshCw size={16} className="spin" /> Loading KPI stream…</div>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <Users size={20} />
                  <h2>Top referrer leaderboard</h2>
                </div>
              </div>
              <div className="leaderboard-list">
                {(growthSummary?.topReferrers ?? []).length ? (
                  (growthSummary?.topReferrers ?? []).map((lead, index) => (
                    <article key={lead.referralCode || index}>
                      <strong>{index + 1}</strong>
                      <div>
                        <span>{lead.name}</span>
                        <small>{lead.email} • {lead.referralLink}</small>
                      </div>
                      <div>{lead.referrals} referrals</div>
                      <div>{lead.clicks} clicks</div>
                    </article>
                  ))
                ) : (
                  <p className="dim">No referrer data yet.</p>
                )}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <CalendarDays size={20} />
                <h2>Upcoming blog cadence</h2>
              </div>
              <span>
                {`Expected weekly total: ${(blogSchedule?.cadence.length ?? 0) * 7}`}
              </span>
            </div>
            <div className="schedule-grid">
              {POST_SCHEDULE_CADENCE.map((slot) => (
                <article key={slot.label} className="schedule-card">
                  <strong>{slot.label}</strong>
                  <h4>{slot.desc}</h4>
                  <p>{`Target times: ${blogSchedule?.cadence.join(", ") ?? "08:00, 20:00"}`}</p>
                </article>
              ))}
            </div>
            <div className="upcoming-posts">
              <h3>Next scheduled posts</h3>
              <div className="upcoming-posts-grid">
                {(blogSchedule?.upcoming ?? []).length ? (
                  blogSchedule?.upcoming.map((item) => (
                    <article key={item.slug} className="schedule-card">
                      <strong>{item.title}</strong>
                      <p>{item.status} · {item.publishAt ? formatDateTime(item.publishAt) : "TBD"}</p>
                      <a className="dash-link-btn" href={`/blog/${encodeURIComponent(item.slug)}`} target="_blank" rel="noreferrer">
                        Open draft
                      </a>
                    </article>
                  ))
                ) : (
                  <p className="dim">No posts scheduled yet.</p>
                )}
              </div>
            </div>
            {growthKpi?.lastSeen ? (
              <p className="dim">{`Last funnel event tracked: ${formatDateTime(growthKpi.lastSeen)}`}</p>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <Youtube size={20} />
                <h2>Growth event stream</h2>
              </div>
            </div>
            <div className="content-log-list">
              {(growthKpi?.recentEvents ?? []).map((event, index) => (
                <div key={index} className="log-entry">
                  <div className="log-entry-left">
                    <span className="ep-badge">event</span>
                    <span>{event.event}</span>
                  </div>
                  <div className="log-entry-right">
                    <span className="log-time">{formatDateTime(event.ts)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {/* Platform Stats */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <Megaphone size={20} />
            <h2>Platform Stats</h2>
          </div>
          <button type="button" className="icon-btn" onClick={() => void loadLog()} title="Refresh data" disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>

        {loading ? (
          <div className="loading-row"><RefreshCw size={20} className="spin" /> Loading…</div>
        ) : contentLog ? (
          <>
            {contentLog.total_published === 0 ? (
              <div className="empty-log">
                <Megaphone size={28} />
                <p>No content published yet.</p>
                <p className="dim">Log your first post above to start tracking platform stats.</p>
              </div>
            ) : (
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
                      {stats.last_post
                        ? `Last: ${new Date(stats.last_post).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                        : "No posts yet"}
                    </span>
                  </article>
                ))}
              </div>
            )}
            <div className="total-published">
              <CheckCircle2 size={18} />
              <span>Total published: <strong>{contentLog.total_published}</strong></span>
            </div>
          </>
        ) : (
          <p className="dim">Could not load content log. Is the server running?</p>
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
              Episode / Content ID <span className="required-star">*</span>
              <input
                value={logEpisodeId}
                onChange={(e) => { setLogEpisodeId(e.target.value); if (e.target.value.trim()) setEpisodeIdError(false); }}
                placeholder="EP001, TEASER_01, etc."
                className={episodeIdError ? "input-error" : ""}
              />
              {episodeIdError && <span className="field-error-msg">Episode / Content ID is required.</span>}
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
              {logStatus === "saving" ? "Logging…" : "Log Content"}
            </button>
            {logStatus === "error" && <span className="error-msg">Could not log content. Try again.</span>}
          </form>

          {logStatus === "saved" && loggedEntry && (
            <div className="log-success">
              <CheckCircle2 size={16} />
              <div>
                <strong>Logged successfully!</strong>
                <p>
                  <span className="ep-badge">{loggedEntry.episodeId}</span>
                  {" → "}
                  <span className="log-platform">{PLATFORM_LABELS[loggedEntry.platform] ?? loggedEntry.platform}</span>
                  {loggedEntry.url && (
                    <>{" · "}<a href={loggedEntry.url} target="_blank" rel="noreferrer">{loggedEntry.url}</a></>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <Clock size={20} />
              <h2>Published Feed</h2>
            </div>
            <span>{contentLog?.published_content?.length ?? 0} entries</span>
          </div>
          <div className="content-log-list">
            {contentLog?.published_content?.length ? (
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
          {POST_SCHEDULE_CADENCE.map((slot) => (
            <article key={slot.label} className="schedule-card">
              <strong>{slot.label}</strong>
              <h4>{slot.desc}</h4>
              <p>Keep this rhythm active in public and private channels.</p>
            </article>
          ))}
        </div>
      </section>

      {/* Social Links */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <Youtube size={20} />
            <h2>Distribution links</h2>
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
