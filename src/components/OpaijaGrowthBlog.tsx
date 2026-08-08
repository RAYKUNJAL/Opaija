import { useEffect, useState } from "react";
import { apiUrl } from "../lib/api";

type BlogPostStatus = "draft" | "scheduled" | "published" | "archived";

export type BlogPost = {
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

async function postTracking(event: string, metadata: Record<string, unknown> = {}) {
  try {
    await fetch(apiUrl("/api/funnel/event"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, metadata }),
    });
  } catch {
    // Tracking is non-blocking for UI reliability.
  }
}

function formatDate(value?: string) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString(undefined, {
    timeZoneName: "short",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function textToParagraphs(body: string) {
  return body
    .split("\n\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const isHeading = /^#+\s/.test(line);
      const tag = line.startsWith("##") ? "h3" : isHeading ? "h2" : "p";
      const cleanLine = line.replace(/^#+\s*/, "");
      return { tag, value: cleanLine, index };
    });
}

export function BlogIndexPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [schedule, setSchedule] = useState<BlogSchedule | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void postTracking("blog_index_view", { path: "/blog" });
    document.title = "OPAIJA Founder Blog | 2 Posts Daily Growth Engine";
    const description = "Daily growth updates, conversion science, SEO and GEO playbooks for the OPAIJA launch engine.";
    const descriptionTag = document.querySelector("meta[name='description']");
    if (descriptionTag) descriptionTag.setAttribute("content", description);
    const schemaHost = "https://opaija.com";
    const existing = document.getElementById("blog-index-schema");
    if (existing) existing.remove();
    const schema = document.createElement("script");
    schema.id = "blog-index-schema";
    schema.type = "application/ld+json";
    schema.text = JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "OPAIJA Founder Blog",
        description,
        url: `${schemaHost}/blog`,
        isPartOf: {
          "@type": "WebSite",
          name: "OPAIJA",
          url: schemaHost,
        },
      },
      null,
      2,
    );
    document.head.appendChild(schema);
    Promise.all([
      fetch(apiUrl("/api/blog/posts?status=published&limit=12")),
      fetch(apiUrl("/api/blog/cadence")),
    ]).then(async ([postRes, scheduleRes]) => {
      if (!postRes.ok || !scheduleRes.ok) {
        setError("Blog content is not ready yet.");
        return;
      }
      const [postData, scheduleData] = await Promise.all([postRes.json(), scheduleRes.json()]);
      setPosts(Array.isArray(postData) ? (postData as BlogPost[]) : []);
      setSchedule(scheduleData as BlogSchedule);
    });
  }, []);

  return (
    <main className="public-site">
      <section className="public-hero">
        <div className="public-copy">
          <p className="section-label">Dispatches from the Gayelle</p>
          <h1>Lore, characters, craft, and the road to the first OPAIJA season</h1>
          <p>
            Follow the Caribbean stories, fighting traditions, character reveals, and production choices shaping OPAIJA.
            New dispatches arrive every morning and evening.
          </p>
          <div className="public-actions">
            <a href="/launch" className="primary-action">
              Enter OPAIJA
            </a>
            <a href="/read-free" className="ghost-action">
              Read Founder Preview
            </a>
            <a href="/member" className="ghost-action">
              Member Hub
            </a>
          </div>
        </div>
        <div className="hero-glass-card">
          <h2 className="section-label">Morning + evening dispatch</h2>
          <p className="geo-chip">{schedule?.nextPublishAt ? `Next dispatch: ${formatDate(schedule.nextPublishAt)}` : "Preparing the next dispatch..."}</p>
          <p>
            OPAIJA publishes on a steady Caribbean rhythm:
            <strong>{` ${schedule ? schedule.cadence.join(" and ") : ""}`}</strong>.
          </p>
          <ul>
            <li>{`Published this week: ${schedule ? schedule.publishedThisWeek : 0}`}</li>
            <li>{`Published total: ${schedule ? schedule.totalPublished : 0}`}</li>
            <li>{`Expected this week: ${(schedule?.cadence.length ?? 0) * 7}`}</li>
          </ul>
        </div>
      </section>

      <section className="public-section">
        <h2>Latest OPAIJA Dispatches</h2>
        {error ? <p style={{ color: "#ff8a80" }}>{error}</p> : null}
        <div className="blog-grid">
          {posts.map((post) => (
            <article key={post.slug} className="blog-card">
              {post.imageUrl ? <img src={post.imageUrl} alt="" loading="lazy" /> : null}
              <h3>{post.title}</h3>
              <p>{post.excerpt}</p>
              <p className="geo-chip">{post.region ? `From ${post.region}` : "From the OPAIJA universe"}</p>
              <p className="blog-meta">Published {formatDate(post.publishedAt ?? post.createdAt)}</p>
              <a href={`/blog/${post.slug}`} className="primary-action">
                Open post
              </a>
            </article>
          ))}
          {posts.length === 0 && !error ? <p>No public posts yet. New posts are auto-scheduled every day.</p> : null}
        </div>
      </section>
    </main>
  );
}

export function BlogPostPage({ slug }: { slug: string }) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void postTracking("blog_post_view", { slug });
    fetch(apiUrl(`/api/blog/posts/${encodeURIComponent(slug)}`))
      .then((response) => {
        if (!response.ok) {
          setNotFound(true);
          return null;
        }
        return response.json() as Promise<BlogPost>;
      })
      .then((data) => {
        if (!data) return;
        setPost(data);
        if (data) {
          document.title = `${data.seoTitle ?? data.title} | OPAIJA`;
          const description = data.seoDescription ?? data.excerpt;
          const meta = document.querySelector("meta[name='description']");
          if (meta) meta.setAttribute("content", description);
          document.querySelector("meta[property='og:title']")?.setAttribute("content", data.seoTitle ?? data.title);
          document.querySelector("meta[property='og:description']")?.setAttribute("content", description);
          const existing = document.getElementById("blog-structured-data");
          if (existing) existing.remove();
          const schema = document.createElement("script");
          schema.id = "blog-structured-data";
          schema.type = "application/ld+json";
          const image = data.imageUrl ? [data.imageUrl] : undefined;
          schema.text = JSON.stringify(
            {
              "@context": "https://schema.org",
              "@type": "BlogPosting",
              headline: data.title,
              description: data.excerpt,
              datePublished: data.publishedAt,
              author: { "@type": "Organization", name: "OPAIJA" },
              ...(image ? { image } : {}),
              mainEntityOfPage: { "@type": "WebPage", "@id": `https://opaija.com/blog/${data.slug}` },
              articleSection: data.tags.join(", "),
            },
            null,
            2,
          );
          document.head.appendChild(schema);
        }
      });
  }, [slug]);

  if (notFound) {
    return (
      <main className="public-site public-empty">
        <section className="public-hero">
          <div className="public-copy">
            <h1>Post not found</h1>
            <p>We could not find that post yet. Continue to the latest drops.</p>
            <a href="/blog" className="primary-action">
              Open Blog
            </a>
          </div>
        </section>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="public-site">
        <section className="public-hero">
          <div className="public-copy">
            <p className="section-label">Loading</p>
            <h1>Loading this post…</h1>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="public-site">
      <section className="public-section">
        <a href="/blog" style={{ color: "var(--gold)", textDecoration: "underline", display: "inline-block", marginBottom: 20 }}>
          ← All posts
        </a>
        <h1>{post.title}</h1>
        <p className="geo-chip">{`Published: ${formatDate(post.publishedAt ?? post.createdAt)} • ${post.region ?? "Global audience"}`}</p>
        <p>{post.excerpt}</p>
        <div className="blog-post-body">
          {textToParagraphs(post.body).map((chunk) => {
            if (chunk.tag === "h2") return <h2 key={chunk.index}>{chunk.value}</h2>;
            if (chunk.tag === "h3") return <h3 key={chunk.index}>{chunk.value}</h3>;
            return <p key={chunk.index}>{chunk.value}</p>;
          })}
        </div>
        <div className="public-actions" style={{ marginTop: 26 }}>
          <a href="/checkout?product=tripwire&source=blog" className="primary-action">
            Unlock the $7 Founder Digital Vault
          </a>
          <a href="/read-free" className="ghost-action">
            Read the Founder Preview
          </a>
        </div>
      </section>
    </main>
  );
}
