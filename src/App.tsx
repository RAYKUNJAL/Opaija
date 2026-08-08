import { Component, type ReactNode, useEffect, useState } from "react";
import {
  Archive,
  BookOpen,
  Check,
  CheckCircle2,
  Clapperboard,
  Command,
  Gift,
  Mail,
  Play,
  Radio,
  Shirt,
  TrendingUp,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { characters } from "./data/characters";
import { digitalPassTiers, paidReaderFeatures } from "./data/books";
import { merchProducts } from "./data/merch";
import { OpaijaMotionHero } from "./components/OpaijaMotionHero";
import { CanonGuardView } from "./components/CanonGuardView";
import { PublishingView } from "./components/PublishingView";
import { MasterDashboard } from "./components/MasterDashboard";
import { AssetBrowser } from "./components/AssetBrowser";
import { WorkReview } from "./components/WorkReview";
import { EpisodesView } from "./components/EpisodesView";
import { BookBuilderView } from "./components/BookBuilderView";
import { CharacterUniverseView } from "./components/CharacterUniverseView";
import { BlogIndexPage, BlogPostPage } from "./components/OpaijaGrowthBlog";
import { apiUrl } from "./lib/api";

const ASSET_BASE_URL = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/command/";

type View =
  | "pipeline"
  | "canon"
  | "storage"
  | "review"
  | "publishing"
  | "growth"
  | "characters"
  | "book-builder";

const viewAliases: Record<string, View> = {
  pipeline: "pipeline",
  episodes: "pipeline",
  canon: "canon",
  storage: "storage",
  assets: "storage",
  review: "review",
  work: "review",
  publishing: "publishing",
  growth: "growth",
  characters: "characters",
  universe: "characters",
  "book-builder": "book-builder",
  book: "book-builder",
};

const navItems: Array<{ id: View; label: string; icon: typeof Command }> = [
  { id: "pipeline", label: "Video Studio", icon: Clapperboard },
  { id: "book-builder", label: "Book Builder", icon: BookOpen },
  { id: "characters", label: "Character Universe", icon: UsersRound },
  { id: "canon", label: "Canon Guard", icon: CheckCircle2 },
  { id: "storage", label: "Storage", icon: Archive },
  { id: "review", label: "Review", icon: Sparkles },
  { id: "publishing", label: "Publishing", icon: Radio },
  { id: "growth", label: "Growth", icon: TrendingUp },
];

class ViewErrorBoundary extends Component<
  { children: ReactNode; viewName: string },
  { hasError: boolean; error: string }
> {
  state = { hasError: false, error: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center", color: "#E5D1A6" }}>
          <p style={{ color: "#fca5a5", marginBottom: 12 }}>This section hit an error:</p>
          <code style={{ display: "block", padding: 12, background: "rgba(198,40,30,0.1)", borderRadius: 8, fontSize: 12, marginBottom: 16 }}>
            {this.state.error}
          </code>
          <button
            onClick={() => this.setState({ hasError: false, error: "" })}
            style={{ padding: "8px 16px", background: "rgba(243,167,18,0.15)", border: "1px solid rgba(243,167,18,0.3)", borderRadius: 8, color: "#f3a712", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  if (window.location.pathname.startsWith("/hero-prototype")) {
    return <OpaijaMotionHero />;
  }

  const isAdminRoute = window.location.pathname.startsWith("/command") || window.location.pathname.startsWith("/admin");
  return isAdminRoute ? <AdminGate /> : <PublicSite />;
}

type PublicProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  currency: "USD";
  description: string;
  status: "ready" | "preorder";
  type: "issue" | "membership" | "addon" | "merch";
};

type FunnelMember = {
  token: string;
  email: string;
  plan: string;
  startedAt: string;
  lastActiveAt: string;
  source: string;
};

function PublicSite() {
  const [pathname, setPathname] = useState(() => window.location.pathname.toLowerCase());

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname.toLowerCase());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  if (pathname.startsWith("/checkout")) return <FunnelCheckout />;
  if (pathname === "/launch") return <FunnelLaunch />;
  if (pathname === "/read-free") return <ReadFreeIssue />;
  if (pathname.startsWith("/blog")) {
    const slug = pathname.replace(/^\/blog\/?/, "");
    return slug ? <BlogPostPage slug={decodeURIComponent(slug)} /> : <BlogIndexPage />;
  }
  if (pathname === "/member" || pathname.startsWith("/member/")) return <MemberHub />;

  return <PublicLanding />;
}

function getCommandViewFromLocation(): View {
  const hash = window.location.hash.replace(/^#/, "").split(":")[0].toLowerCase();
  if (hash && viewAliases[hash]) return viewAliases[hash];

  const pathSegment = window.location.pathname
    .replace(/^\/(?:command|admin)\/?/, "")
    .split("/")[0]
    .toLowerCase();
  return viewAliases[pathSegment] ?? "pipeline";
}

function AdminGate() {
  const [authState, setAuthState] = useState<"checking" | "login" | "authed">("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(() => {
    return sessionStorage.getItem("opaija_admin_token");
  });

  useEffect(() => {
    const saved = sessionStorage.getItem("opaija_admin_token");
    if (saved) {
      fetch(apiUrl("/api/auth/check"), { headers: { "x-admin-session": saved } })
        .then((r) => r.json())
        .then((data: { authenticated: boolean; authRequired: boolean }) => {
          if (data.authenticated) {
            setToken(saved);
            setAuthState("authed");
          } else {
            sessionStorage.removeItem("opaija_admin_token");
            setAuthState(data.authRequired ? "login" : "authed");
          }
        })
        .catch(() => setAuthState("login"));
    } else {
      fetch(apiUrl("/api/auth/check"))
        .then((r) => r.json())
        .then((data: { authenticated: boolean; authRequired: boolean }) => {
          setAuthState(data.authRequired ? "login" : "authed");
        })
        .catch(() => setAuthState("login"));
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        sessionStorage.setItem("opaija_admin_token", data.token);
        setToken(data.token);
        setPassword("");
        setAuthState("authed");
      } else if (data.status === "open") {
        setAuthState("authed");
      } else {
        setError(data.error ?? "Login failed");
      }
    } catch {
      setError("Could not connect to server");
    }
  }

  if (authState === "checking") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0F0F10", color: "#E5D1A6" }}>
        <p>Checking access…</p>
      </div>
    );
  }

  if (authState === "login") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0F0F10", fontFamily: "system-ui, sans-serif" }}>
        <form onSubmit={handleLogin} style={{ width: 360, padding: 32, background: "#1A1A1E", borderRadius: 12, border: "1px solid #2A2A2E" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <img src={`${ASSET_BASE_URL}favicon.svg`} alt="OPAIJA" style={{ width: 220, marginBottom: 8 }} />
            <h1 style={{ color: "#E5D1A6", fontSize: 20, margin: 0 }}>OPAIJA Command Center</h1>
            <p style={{ color: "#6A6A6E", fontSize: 13, marginTop: 4 }}>Enter password to access production dashboard</p>
          </div>
          {error && <p style={{ color: "#C6281E", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</p>}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            style={{ width: "100%", padding: "12px 14px", background: "#0F0F10", border: "1px solid #2A2A2E", borderRadius: 8, color: "#E5D1A6", fontSize: 15, marginBottom: 16, boxSizing: "border-box" }}
          />
          <button
            type="submit"
            style={{ width: "100%", padding: "12px", background: "#E4A700", border: "none", borderRadius: 8, color: "#0F0F10", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
          >
            Enter Command Center
          </button>
        </form>
      </div>
    );
  }

  return <CommandCenter token={token} />;
}

function CommandCenter({ token }: { token: string | null }) {
  const [activeView, setActiveView] = useState<View>(() => getCommandViewFromLocation());

  useEffect(() => {
    const syncRoute = () => setActiveView(getCommandViewFromLocation());
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
    return () => {
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("popstate", syncRoute);
    };
  }, []);

  function selectView(view: View) {
    setActiveView(view);
    const nextHash = view === "pipeline" ? "" : `#${view}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }

  return (
    <main className={`app-shell ${activeView === "pipeline" ? "video-studio-shell" : ""}`}>
      <aside className="sidebar" aria-label="Opaija command navigation">
        <div className="brand-lockup">
          <img src={`${ASSET_BASE_URL}favicon.svg`} alt="OPAIJA" className="brand-logo-img" />
          <div>
            <strong>OPAIJA</strong>
            <span>Command Center</span>
          </div>
        </div>

        <nav className="nav-stack">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activeView === item.id ? "nav-button active" : "nav-button"}
                onClick={() => selectView(item.id)}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-status">
          <Radio size={18} />
          <div>
            <strong>Brain online</strong>
            <span>Shared memory active</span>
          </div>
        </div>
        {token && (
          <button
            onClick={() => {
              fetch(apiUrl("/api/auth/logout"), { method: "POST", headers: { "x-admin-session": token ?? "" } }).catch(() => {});
              sessionStorage.removeItem("opaija_admin_token");
              window.location.reload();
            }}
            style={{ marginTop: 12, padding: "8px 12px", background: "transparent", border: "1px solid #2A2A2E", borderRadius: 8, color: "#6A6A6E", fontSize: 13, cursor: "pointer", width: "100%" }}
          >
            Log out
          </button>
        )}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <a href="/" className="topbar-back" title="Back to opaija.com">
              ← Public Site
            </a>
            <span className="topbar-sep">|</span>
            <p className="section-label">{navItems.find((n) => n.id === activeView)?.label ?? "Command Center"}</p>
          </div>
          <div className="topbar-right">
            <a href="/" className="topbar-link">opaija.com</a>
          </div>
        </header>

        <ViewErrorBoundary key={activeView} viewName={activeView}>
          {activeView === "pipeline" && <EpisodesView />}
          {activeView === "canon" && <CanonGuardView />}
          {activeView === "publishing" && <PublishingView token={token} />}
          {activeView === "growth" && <PublishingView token={token} mode="growth" />}
          {activeView === "storage" && <AssetBrowser token={token} />}
          {activeView === "review" && <WorkReview token={token} />}
          {activeView === "book-builder" && <BookBuilderView />}
          {activeView === "characters" && <CharacterUniverseView />}
        </ViewErrorBoundary>
      </section>
  </main>
  );
}

function FunnelLaunch() {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    fetch(apiUrl("/api/funnel/catalog"))
      .then((res) => res.json())
      .then((data) => setProducts(Array.isArray(data) ? (data as PublicProduct[]) : []))
      .catch(() => setCatalogError("Catalog is currently unavailable."));
    void trackFunnelEvent("landing_view", { location: "launch" });
    void trackFunnelEvent("blog_cta_visible", { location: "launch", channel: "home-cta" });
    document.title = "OPAIJA Inner Circle | Founder's Launch";
    const description = "Start with the real OPAIJA founder funnel: free issue, founder passes, and high-conversion member journeys.";
    const descriptionTag = document.querySelector("meta[name='description']");
    if (descriptionTag) descriptionTag.setAttribute("content", description);
    const existing = document.getElementById("launch-schema");
    if (existing) existing.remove();
    const schema = document.createElement("script");
    schema.id = "launch-schema";
    schema.type = "application/ld+json";
    schema.text = JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "OPAIJA Inner Circle Launch",
        description,
        areaServed: "Trinidad and Tobago",
        audience: "anime and creator brands",
      },
      null,
      2,
    );
    document.head.appendChild(schema);
  }, []);

  async function submitLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch(apiUrl("/api/funnel/lead"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName,
          source: "launch",
          consent: true,
        }),
      });
      if (!res.ok) throw new Error("Lead capture failed.");
      await trackFunnelEvent("lead_submit", { location: "launch", email });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const tripwire = products.find(
    (product) => product.type === "membership" && (product.slug === "tripwire-pass" || product.slug === "tripwire"),
  );
  const audioBump = products.find((product) => product.type === "addon");

  return (
    <main className="public-site">
      <section className="public-hero" style={{ minHeight: "100vh", alignItems: "center" }}>
        <div className="public-copy">
          <p className="section-label">Inner Circle Launch</p>
          <h1>Own the Founder Journey.</h1>
          <p>
            Read OPAIJA free issue, claim the founder pass, and support the world build. Every checkout unlocks a
            real feature in the reader and community stack.
          </p>
          <a className="primary-action" href="/read-free">
            Read Issue #0 Free
          </a>
          <a className="ghost-action" href="/blog">
            Growth Blog
          </a>
          <a className="ghost-action" href="/member">
            Member Hub Preview
          </a>
        </div>
      </section>

      <section className="public-section">
        <h2>Tripwire Offer</h2>
        <p style={{ marginBottom: 16 }}>
          {tripwire
            ? `${tripwire.name} — ${tripwire.currency} ${tripwire.price} to join the active member path.`
            : "Tripwire catalog is syncing. Add products in server/data/funnel."}
        </p>
        {catalogError ? <p style={{ color: "#ff6f61" }}>{catalogError}</p> : null}
        <div className="pass-tier-grid">
          {tripwire ? (
            <article>
              <span>{`${tripwire.currency} ${tripwire.price}`}</span>
              <h3>{tripwire.name}</h3>
              <p>{tripwire.description}</p>
              <a
                className="primary-action"
                href={`/checkout?product=${encodeURIComponent(tripwire.slug)}&source=launch`}
              >
                Start with {tripwire.name}
              </a>
            </article>
          ) : null}
          {audioBump ? (
            <article>
              <span>{`${audioBump.currency} ${audioBump.price}`}</span>
              <h3>{audioBump.name}</h3>
              <p>{audioBump.description}</p>
              <a
                className={tripwire ? "ghost-action" : "primary-action"}
                href={`/checkout?product=${encodeURIComponent(audioBump.slug)}&source=launch`}
              >
                Add-on only
              </a>
            </article>
          ) : null}
        </div>
      </section>

      <section className="public-section">
        <h2>Pre-order Membership</h2>
        <p>Monthly and annual founder passes are preorders.</p>
        <div className="pass-tier-grid">
          {products
            .filter((item) => item.type === "membership" && item.status === "preorder")
            .map((item) => (
              <article key={item.id}>
                <span>{`${item.currency} ${item.price}`}</span>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <a className="ghost-action" href={`/checkout?product=${encodeURIComponent(item.slug)}&source=launch`}>
                  Join preorder list
                </a>
              </article>
            ))}
        </div>
      </section>

      <section className="public-section">
        <h2>Secure founder access early</h2>
        <form className="founder-form" style={{ maxWidth: 640 }} onSubmit={submitLead}>
          <label>
            Name
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Name" />
          </label>
          <label>
            Email
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </label>
          <button type="submit" className="primary-action" disabled={status === "saving"}>
            <Mail size={18} />
            {status === "saving" ? "Saving..." : "Get launch updates"}
          </button>
          {status === "saved" ? <p>You're added. Continue to checkout when you're ready.</p> : null}
          {status === "error" ? <p className="gate-error">Could not save your email.</p> : null}
        </form>
      </section>
    </main>
  );
}

function ReadFreeIssue() {
  const [issue, setIssue] = useState<{
    title: string;
    description: string;
    price: number;
    currency: string;
    assets: string[];
    status: string;
  } | null>(null);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, issue?.assets?.length ?? 1);
  const currentAsset = issue?.assets?.[Math.max(0, Math.min(page - 1, totalPages - 1))];
  const [readerStatus, setReaderStatus] = useState<"loading" | "ready" | "error">("loading");
  const [email, setEmail] = useState("");

  useEffect(() => {
    void trackFunnelEvent("reader_open", { location: "read-free" });
    fetch(apiUrl("/api/funnel/content/issue-0"))
      .then((res) => res.json())
      .then((data) => {
        setIssue(data);
        setReaderStatus("ready");
      })
      .catch(() => setReaderStatus("error"));
  }, []);

  useEffect(() => {
    if (page >= Math.max(1, Math.ceil(totalPages * 0.8)) && page < totalPages) {
      void trackFunnelEvent("reader_page_25", { location: "read-free", page });
    }
    if (page === totalPages && issue?.assets?.length) {
      void trackFunnelEvent("reader_complete", { location: "read-free", page });
    }
  }, [page, totalPages, issue?.assets]);

  function nextPage() {
    const next = Math.min(page + 1, totalPages);
    setPage(next);
  }
  function prevPage() {
    setPage(Math.max(page - 1, 1));
  }

  return (
    <main className="public-site" style={{ background: "linear-gradient(180deg, #09090A 0%, #17181A 100%)" }}>
      <section className="public-section">
        <div className="public-section-header">
          <span className="signal">Free Reader</span>
          <h1>{issue?.title ?? "OPAIJA Founder Preview"} {readerStatus === "ready" && issue ? `- ${issue.currency}${issue.price}` : ""}</h1>
          <p>Explore real OPAIJA key art and selected character dossiers, then watch the released motion test.</p>
        </div>

        <div className="founder-form" style={{ marginBottom: 16 }}>
          <label>
            Optional email to receive chapter unlock
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <a
            className="primary-action"
            href={`/checkout?product=${encodeURIComponent("tripwire-pass")}&source=read-free&email=${encodeURIComponent(email)}&next=${encodeURIComponent(window.location.pathname)}`}
          >
            Upgrade for full access
          </a>
        </div>

        <div style={{ border: "1px solid rgba(229,209,166,0.16)", borderRadius: 12, padding: 20, minHeight: 420 }}>
          <p style={{ marginTop: 0 }}>
            {readerStatus === "loading"
              ? "Loading issue..."
              : readerStatus === "error"
                ? "Reader asset metadata unavailable. Contact support if this persists."
                : `Issue page ${page} of ${totalPages}.`}
          </p>
          {readerStatus === "ready" ? (
            <>
              <p>
                Page {page}: The tide rose on Port of Spain just before dawn. Kai moves through the old wharf lanes and hears
                drumbeats he can’t remember hearing in waking life.
              </p>
              {currentAsset ? (
                <div style={{ width: "min(100%, 780px)", margin: "12px auto 0" }}>
                  <img
                    src={currentAsset}
                    alt={`Issue #0 page ${page}`}
                    style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(229,209,166,0.2)" }}
                  />
                </div>
              ) : (
                <p>Page panel is being prepared. Return in a moment.</p>
              )}
              <div className="feature-grid" style={{ marginTop: 12 }}>
                {(issue?.assets ?? []).slice(0, Math.min(issue?.assets?.length ?? 0, 4)).map((asset, index) => (
                  <a
                    key={`${asset}-${index}`}
                    href={asset}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "#E5D1A6",
                      fontSize: 14,
                      textAlign: "center",
                      border: "1px solid rgba(229,209,166,0.2)",
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    Open panel {index + 1}
                  </a>
                ))}
              </div>
            </>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            <button type="button" className="ghost-action" onClick={prevPage} disabled={page <= 1}>Previous</button>
            <button type="button" className="primary-action" onClick={nextPage} disabled={page >= totalPages}>Next page</button>
          </div>
        </div>
        <a style={{ display: "inline-block", marginTop: 14 }} href="/launch" className="ghost-action">
          Go to launch funnel
        </a>
      </section>
    </main>
  );
}

function FunnelCheckout() {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [paypalOrderId, setPaypalOrderId] = useState("");
  const [captureMessage, setCaptureMessage] = useState("");
  const [memberToken, setMemberToken] = useState("");

  const query = new URLSearchParams(window.location.search);
  const productId = query.get("product") ?? "tripwire-pass";
  const source = query.get("source") ?? "site";
  const returnOrderId = query.get("orderId");
  const returnPaypalId = query.get("token");

  useEffect(() => {
    fetch(apiUrl("/api/funnel/catalog"))
      .then((res) => res.json())
      .then((data) => setProducts(Array.isArray(data) ? (data as PublicProduct[]) : []))
      .catch(() => setMessage("Unable to load launch products."));

    const seededEmail = query.get("email");
    if (seededEmail) setEmail(seededEmail);

    void trackFunnelEvent("tripwire_view", { location: "checkout", productId, source });
  }, [productId, source]);

  useEffect(() => {
    if (!returnOrderId) return;
    if (!returnPaypalId) {
      setMessage("No PayPal token returned. Try create order again.");
      return;
    }
    const captured = window.localStorage.getItem(`order:${returnOrderId}`);
    if (captured === "captured") return;
    void capture(returnOrderId, returnPaypalId);
  }, [returnOrderId, returnPaypalId]);

  const selected = products.find((item) => item.id === productId || item.slug === productId);

  async function create() {
    setLoading(true);
    setMessage("Starting checkout...");
    try {
      const response = await fetch(apiUrl("/api/paypal/create-order"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, email, route: "/checkout", metadata: { source } }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to create order.");
      }
      setOrderId(data.orderId ?? "");
      setPaypalOrderId(data.paypalOrderId ?? "");
      if (data.approveUrl) {
        window.location.href = data.approveUrl;
        return;
      }
      setMessage("Waiting for external PayPal approval URL.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setLoading(false);
    }
  }

  async function capture(id: string, paypalId: string | null) {
    setLoading(true);
    setCaptureMessage("Capturing payment...");
    try {
      const response = await fetch(apiUrl("/api/paypal/capture-order"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: id ?? orderId,
          paypalOrderId: (paypalId ?? paypalOrderId) || undefined,
          email,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to capture payment.");
      setCaptureMessage(payload.member?.token ? "Payment verified. Your member access is ready." : "Payment verified. Your receipt is ready.");
      if (payload.member?.token) {
        setMemberToken(payload.member.token);
        sessionStorage.setItem("opaija_member_token", payload.member.token);
        void trackFunnelEvent("tripwire_capture", { location: "checkout", productId, email: payload.member.email });
      }
      void trackFunnelEvent("tripwire_buy", { location: "checkout", productId, orderId: payload.order?.orderId });
      window.localStorage.setItem(`order:${id}`, "captured");
      if (payload.member?.token) {
        setTimeout(() => {
          window.location.href = "/member";
        }, 1000);
      }
    } catch (error) {
      setCaptureMessage(error instanceof Error ? error.message : "Could not capture payment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="public-site">
      <section className="public-section">
        <div className="public-section-header">
          <span className="signal">Secure Checkout</span>
          <h1>Checkout</h1>
          <p>PayPal powers this checkout. No card form is stored here.</p>
        </div>

        <div className="founder-form" style={{ maxWidth: 640 }}>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </label>
          <p>
            {selected
              ? `${selected.name} • ${selected.currency} ${selected.price}`
              : "Loading product..."}
          </p>
          <button type="button" className="primary-action" onClick={create} disabled={loading || !selected}>
            <Gift size={18} />
            {loading ? "Processing..." : `Pay ${selected ? `${selected.currency} ${selected.price}` : ""} with PayPal`}
          </button>
          <p>{message}</p>
          {orderId ? <p>Order: {orderId}</p> : null}
          {captureMessage ? <p>{captureMessage}</p> : null}
          {memberToken ? <a href="/member" className="ghost-action">Go to Member Hub</a> : null}
        </div>
      </section>
    </main>
  );
}

function MemberHub() {
  const [member, setMember] = useState<FunnelMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState("");
  const segments = window.location.pathname.toLowerCase().split("/").filter(Boolean);
  const current = segments[1] || "home";

  const savedToken = sessionStorage.getItem("opaija_member_token");
  const queryToken = new URLSearchParams(window.location.search).get("token") ?? "";
  const activeToken = queryToken || savedToken || "";

  useEffect(() => {
    if (queryToken) {
      sessionStorage.setItem("opaija_member_token", queryToken);
      window.history.replaceState({}, "", window.location.pathname);
    }
    void trackFunnelEvent("member_home_view", { location: current, hasToken: Boolean(activeToken) });
    if (!activeToken) {
      setLoading(false);
      return;
    }
    fetch(apiUrl(`/api/funnel/member/${encodeURIComponent(activeToken)}`))
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: FunnelMember) => {
        setMember(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Member token not found. Enter a valid token.");
        setLoading(false);
      });
  }, [activeToken, current]);

  useEffect(() => {
    void trackFunnelEvent(`member_${current}_view`, { location: current, hasToken: Boolean(member) });
  }, [current, member]);

  if (loading) {
    return (
      <main className="public-site">
        <section className="public-section">
          <p>Loading your member hub...</p>
        </section>
      </main>
    );
  }

  if (!member) {
    return (
      <main className="public-site">
        <section className="public-section" style={{ maxWidth: 560 }}>
          <h1>Member Access</h1>
          <p>Paste your member token from your checkout email or latest payment confirmation.</p>
          <div className="founder-form">
            <label>
              Member token
              <input
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="member-xxxx-xxxx"
              />
            </label>
            <button
              type="button"
              className="primary-action"
              onClick={() => {
                const next = encodeURIComponent(tokenInput.trim());
                window.location.href = `/member?token=${next}`;
              }}
            >
              Continue to my hub
            </button>
            {error ? <p className="gate-error">{error}</p> : null}
          </div>
        </section>
      </main>
    );
  }

  const navMap = [
    "home",
    "read",
    "watch",
    "web-teller",
    "characters",
    "vote",
    "profile",
  ];

  return (
    <main className="public-site">
      <section className="public-hero">
        <div className="public-copy">
          <p className="section-label">Member Hub</p>
          <h1>Welcome back, {member.email}</h1>
          <p>Plan: {member.plan}</p>
        </div>
        <nav className="member-nav">
          {navMap.map((route) => (
            <a key={route} href={`/member/${route}`}>
              {route}
            </a>
          ))}
        </nav>
      </section>

      <section className="public-section">
        {current === "home" && <p>Your member plan is active. Use the nav above for live pages.</p>}
        {current === "read" && <MemberSectionRead token={member.token} />}
        {current === "watch" && <MemberSectionWatch />}
        {current === "web-teller" && <MemberSectionWebTeller />}
        {current === "characters" && (
          <div className="feature-grid">
            {characters.slice(0, 6).map((character) => (
              <article key={character.id}>
                <h3>{character.name}</h3>
                <p>{character.role}</p>
                <small>{character.power}</small>
              </article>
            ))}
          </div>
        )}
        {current === "vote" && <MemberSectionVote />}
        {current === "profile" && (
          <div>
            <p>Email: {member.email}</p>
            <p>Started: {new Date(member.startedAt).toLocaleDateString()}</p>
            <p>Last active: {new Date(member.lastActiveAt).toLocaleString()}</p>
          </div>
        )}
      </section>
    </main>
  );
}

function MemberSectionRead({ token }: { token: string }) {
  const [issue, setIssue] = useState<{ title?: string; assets?: string[]; hasAccess: boolean; needsMember: boolean } | null>(null);
  const [downloadStatus, setDownloadStatus] = useState("");

  useEffect(() => {
    fetch(apiUrl(`/api/funnel/content/tripwire?token=${encodeURIComponent(token)}`))
      .then((res) => res.json())
      .then((data) => setIssue(data))
      .catch(() => setIssue({ hasAccess: false, needsMember: false }));
  }, [token]);

  async function downloadVault(asset: string) {
    setDownloadStatus("Preparing your protected download...");
    try {
      const response = await fetch(apiUrl(asset), { headers: { "x-member-token": token } });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Download failed.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = "opaija-founder-digital-vault.zip";
      link.click();
      URL.revokeObjectURL(href);
      setDownloadStatus("Vault download started.");
    } catch (error) {
      setDownloadStatus(error instanceof Error ? error.message : "Download failed.");
    }
  }

  return (
    <div>
      <h2>Reader</h2>
      <p>{issue ? `Access: ${issue.hasAccess ? "open" : "closed"}` : "Loading..."}</p>
      {issue?.hasAccess && issue.assets?.length ? (
        <div className="feature-grid" style={{ marginTop: 16 }}>
          {issue.assets.map((asset) => (
            <article key={asset}>
              {asset.startsWith("/api/") ? (
                <button type="button" className="primary-action" onClick={() => void downloadVault(asset)}>
                  Download Founder Digital Vault
                </button>
              ) : asset.endsWith(".mp4") ? (
                <video controls playsInline preload="metadata" src={asset} style={{ width: "100%", borderRadius: 12 }} />
              ) : (
                <img src={asset} alt="OPAIJA Founder Digital Vault asset" style={{ width: "100%", borderRadius: 12 }} />
              )}
              {!asset.startsWith("/api/") ? <a className="ghost-action" href={asset} target="_blank" rel="noreferrer">Open asset</a> : null}
            </article>
          ))}
        </div>
      ) : null}
      {downloadStatus ? <p>{downloadStatus}</p> : null}
      {issue && !issue.hasAccess ? <p>This vault requires a verified Founder Digital Vault purchase.</p> : null}
      <a className="primary-action" href="/read-free">
        Open Founder Preview
      </a>
    </div>
  );
}

function MemberSectionWatch() {
  return (
    <div>
      <h2>Watch Room</h2>
      <p>Watch the released OPAIJA Kai strike motion test.</p>
      <video controls playsInline preload="metadata" poster="/assets/video/opaija-hero-kai-strike-poster.jpg" style={{ width: "100%", maxWidth: 900, borderRadius: 18, marginTop: 12 }}>
        <source src="/assets/video/opaija-hero-kai-strike.mp4" type="video/mp4" />
        Your browser does not support HTML video.
      </video>
    </div>
  );
}

function MemberSectionWebTeller() {
  const [choice, setChoice] = useState("Kai takes the lead scene");
  const [result, setResult] = useState("ready");

  async function castVote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await trackFunnelEvent("web_teller_vote", { choice });
    setResult(`Vote locked for: ${choice}`);
  }

  return (
    <div>
      <h2>Web-Teller Studio</h2>
      <p>Pick the next prompt drop. This choice is recorded in member analytics and used for lore timing.</p>
      <form className="founder-form" onSubmit={castVote}>
        <label>
          Choose the next scene twist
          <select value={choice} onChange={(event) => setChoice(event.target.value)} style={{ marginBottom: 8 }}>
            <option>Kai takes the lead scene</option>
            <option>Gayelle unlocks the tide sigil</option>
            <option>Mother Lall gives the final warning</option>
            <option>Malik tracks the market lead</option>
          </select>
        </label>
        <button type="submit" className="primary-action">
          Submit lore prompt
        </button>
      </form>
      <p>{result}</p>
      <p>
        {result === "ready" ? "Pick one option to submit your fan lore prompt." : "Your vote is now logged in funnel analytics."}
      </p>
    </div>
  );
}

function MemberSectionVote() {
  return (
    <div>
      <h2>Vote Rail</h2>
      <p>Current active tracks:</p>
      <ul>
        <li>Reward comments for your top lore scene vote.</li>
        <li>Bonus art unlocks after first 20 daily voters complete a choice.</li>
      </ul>
      <a className="primary-action" href="/member/web-teller">
        Make your prompt choice
      </a>
    </div>
  );
}

function MemberSectionCollectibles() {
  const upcoming = [
    "Kai strike panel set",
    "Mother Lall tide sigil card",
    "Character stickers in founder wave",
    "Collector badge for launch milestones",
  ];
  return (
    <div>
      <h2>Collectibles</h2>
      <p>Pre-release collectible packs are queued to sync into the shop as soon as PayPal order flow confirms the first payouts.</p>
      <div className="feature-grid">
        {upcoming.map((item) => (
          <article key={item}>
            <strong>{item}</strong>
            <small>Claim window: members only</small>
          </article>
        ))}
      </div>
    </div>
  );
}

async function trackFunnelEvent(
  eventName: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await fetch(apiUrl("/api/funnel/event"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventName,
        metadata,
      }),
    });
  } catch {
    // best effort only
  }
}

type LeaderboardEntry = {
  name: string;
  email: string;
  favoriteCharacter: string;
  referralCode: string;
  referralLink: string;
  referrals: number;
  clicks: number;
  instagramHandle?: string;
  socialActions?: string[];
};

function PublicLanding() {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [favoriteCharacter, setFavoriteCharacter] = useState("Kai");
  const [shirtSize, setShirtSize] = useState("L");
  const [prizeCharacters, setPrizeCharacters] = useState(["Kai", "Mother Lall"]);
  const [instagramHandle, setInstagramHandle] = useState("");
  const [socialActions, setSocialActions] = useState<string[]>([]);
  const [flipPage, setFlipPage] = useState(0);
  const [isFlipbookUnlocked, setIsFlipbookUnlocked] = useState(false);
  const [showFlipbookGate, setShowFlipbookGate] = useState(false);
  const [flipbookEmail, setFlipbookEmail] = useState("");
  const [flipbookName, setFlipbookName] = useState("");
  const [flipbookStatus, setFlipbookStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [referralCode, setReferralCode] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leadStatus, setLeadStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref") ?? "";
    setReferralCode(ref);
    if (ref) {
      fetch(apiUrl(`/api/growth/referrals/${encodeURIComponent(ref)}/click`), { method: "POST" }).catch(() => undefined);
    }
    fetch(apiUrl("/api/growth/leaderboard"))
      .then((response) => response.json())
      .then((data: LeaderboardEntry[]) => setLeaderboard(data.slice(0, 6)))
      .catch(() => undefined);
  }, []);

  async function submitLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeadStatus("saving");

    try {
      const response = await fetch(apiUrl("/api/growth/leads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName,
          favoriteCharacter,
          source: "website",
          consent: true,
          contestOptIn: true,
          shirtSize,
          prizeCharacters,
          referredBy: referralCode,
          instagramHandle,
          socialActions,
          tags: ["founder-list", "opaija.com", "t-shirt-giveaway"],
          interests: ["founder art drop", "pilot", "merch", "books", "viral contest", ...socialActions],
        }),
      });

      if (!response.ok) throw new Error("Lead capture failed");
      const saved = await response.json();
      setLeadStatus("saved");
      setReferralCode(saved.lead.referralCode);
      setEmail("");
      const board = await fetch(apiUrl("/api/growth/leaderboard")).then((res) => res.json());
      setLeaderboard(board.slice(0, 6));
    } catch {
      setLeadStatus("error");
    }
  }

  const featuredCharacters = ["kairo", "nia", "malik", "mother-lall"].map(
    (id) => characters.find((character) => character.id === id)!,
  );
  const flipbookPages = ["cover", ...characters.map((character) => character.id)];
  const currentFlipCharacter =
    flipPage === 0 ? null : characters.find((character) => character.id === flipbookPages[flipPage]);
  const freeFlipbookLimit = 4;
  const canOpenFlipPage = (page: number) => isFlipbookUnlocked || page <= freeFlipbookLimit;
  const openFlipPage = (page: number) => {
    if (!canOpenFlipPage(page)) {
      setShowFlipbookGate(true);
      return;
    }
    setFlipPage(page);
  };
  const nextFlipPage = () => {
    const nextPage = Math.min(flipPage + 1, flipbookPages.length - 1);
    openFlipPage(nextPage);
  };
  const previousFlipPage = () => setFlipPage((current) => Math.max(current - 1, 0));

  async function submitFlipbookUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFlipbookStatus("saving");

    try {
      const response = await fetch(apiUrl("/api/growth/leads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: flipbookEmail,
          firstName: flipbookName,
          favoriteCharacter: currentFlipCharacter?.shortName ?? "Kai",
          source: "website",
          consent: true,
          contestOptIn: true,
          referredBy: referralCode,
          tags: ["founder-list", "flipbook-unlock", "opaija.com"],
          interests: ["flipbook", "character previews", "caribbean anime", "founder contest"],
        }),
      });

      if (!response.ok) throw new Error("Flipbook unlock failed");
      const saved = await response.json();
      setReferralCode(saved.lead.referralCode);
      setIsFlipbookUnlocked(true);
      setShowFlipbookGate(false);
      setFlipbookStatus("saved");
      setFlipPage(Math.max(flipPage, freeFlipbookLimit + 1));
      const board = await fetch(apiUrl("/api/growth/leaderboard")).then((res) => res.json());
      setLeaderboard(board.slice(0, 6));
    } catch {
      setFlipbookStatus("error");
    }
  }

  return (
    <main className="public-site">
      <header className="site-nav">
        <a href="/" className="site-brand" aria-label="Opaija home">
          <img src={`${ASSET_BASE_URL}favicon.svg`} alt="OPAIJA" className="brand-logo-img" />
        </a>
        <nav>
          <a href="/read-free">Read Free</a>
          <a href="#characters">Characters</a>
          <a href="/blog">Dispatches</a>
          <a href="#founders">Join</a>
          <a href="/member">Member</a>
        </nav>
      </header>

      <section className="public-hero">
        <div className="public-copy">
          <p className="section-label">Founder giveaway now open</p>
          <h1>The Caribbean finally gets its anime legend.</h1>
          <p>
            Born in Trinidad and Tobago, Opaija begins a journey through the Caribbean islands,
            where rhythm carries memory, every shore hides a guardian, and one young fighter must
            protect a power his people were never meant to forget.
          </p>
          <div className="public-actions">
            <a href="/read-free" className="primary-action">
              <BookOpen size={18} />
              Read the Founder Preview
            </a>
            <a href="#story" className="ghost-action">
              <Play size={18} />
              Discover the Story
            </a>
          </div>
          <div className="hero-mini-list" aria-label="Founder list rewards">
            <span>Free founder art drops</span>
            <span>Share link + live leaderboard</span>
            <span>Island-by-island story drops</span>
          </div>
        </div>
        <div className="hero-video-stage" aria-label="Opaija cinematic hero video">
          <video
            src="/assets/video/opaija-hero-kai-strike.mp4"
            poster="/assets/video/opaija-hero-kai-strike-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
          />
        </div>
        <div className="hero-proof-strip" aria-label="Opaija world highlights">
          {["Caribbean anime", "Cinematic stick fighting", "Founder rewards"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section id="story" className="public-band">
        <div className="band-copy">
          <span className="signal">The story</span>
          <h2>A rhythm wakes in Trinidad. The call travels island to island.</h2>
          <p>
            Opaija is built for the whole Caribbean: Trinidad and Tobago first, then the wider
            islands, each with its own warriors, songs, food, folklore, rival crews, and hidden
            powers. This is a coming-of-age battle saga about remembering who we are before the
            world tells us to forget.
          </p>
        </div>
        <div className="feature-grid">
          {[
            ["Trinidad and Tobago", "The first spark: stick fighting, rhythm, doubles, chantwell power, and ancestral memory."],
            ["Across the Islands", "Every new chapter opens another Caribbean shore, guardian, fighting style, and secret."],
            ["The One Drum", "A dangerous force wants to flatten every island into one command and one silence."],
          ].map(([title, copy]) => (
            <article key={title}>
              <Check size={19} />
              <strong>{title}</strong>
              <span>{copy}</span>
            </article>
          ))}
        </div>
      </section>

      <section id="characters" className="public-section">
        <div className="public-section-header">
          <span className="signal">First character reveals</span>
          <h2>Meet the warriors, rivals, and guardians shaping the first season.</h2>
        </div>
        <div className="public-character-grid">
          {featuredCharacters.map((character) => (
            <article key={character.id}>
              <div className="public-character-image">
                {character.image ? <img src={character.image} alt={`${character.name} character sheet`} /> : null}
              </div>
              <h3>{character.name}</h3>
              <p>{character.role}</p>
              <span>{character.power}</span>
            </article>
          ))}
        </div>
      </section>

      <section id="preview" className="flipbook-section">
        <div className="public-section-header">
          <span className="signal">Free flipbook preview</span>
          <h2>Start with the free flipbook. The full books come through the reader pass.</h2>
          <p>
            Start with the cover and four free character pages. Drop your email to unlock all 10
            character spreads, then get first notice when the longer comic, manga, storybook, and
            coloring-book drops open.
          </p>
        </div>
        <div className="flipbook-shell">
          <div className="flipbook-cta-strip">
            <div>
              <strong>Want the full book?</strong>
              <span>Unlock the complete 10-character preview and join the early list for the longer reader drops.</span>
            </div>
            <button type="button" className="primary-action" onClick={() => setShowFlipbookGate(true)}>
              <Mail size={18} />
              Unlock the Flipbook
            </button>
          </div>
          <div className="flipbook-stage" aria-live="polite">
            {currentFlipCharacter ? (
              <article className="flipbook-page character-page">
                <div className="flipbook-copy facts-page">
                  <span>Page {flipPage} / 10</span>
                  <h3>{currentFlipCharacter.name}</h3>
                  <p>{currentFlipCharacter.role}</p>
                  <ul className="fact-list">
                    {[
                      `Island origin: ${currentFlipCharacter.island}`,
                      `Signature power: ${currentFlipCharacter.power}`,
                      `Weapon: ${currentFlipCharacter.weapon}`,
                      ...currentFlipCharacter.strengths.slice(0, 2).map((fact) => `Strength: ${fact}`),
                    ].map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                  <dl>
                    <div>
                      <dt>Story clue</dt>
                      <dd>{currentFlipCharacter.pipeline[0]}</dd>
                    </div>
                    <div>
                      <dt>Founder action</dt>
                      <dd>Share the book, tag @opa_ija, and bring one more fan into the tribe.</dd>
                    </div>
                  </dl>
                  <a href="#founders" className="ghost-action">Join the Founder Giveaway</a>
                </div>
                <div className="flipbook-image protected-art" onContextMenu={(event) => event.preventDefault()}>
                  {currentFlipCharacter.image ? (
                    <img
                      src={currentFlipCharacter.image}
                      alt={`${currentFlipCharacter.name} character sheet preview`}
                      draggable={false}
                      onDragStart={(event) => event.preventDefault()}
                    />
                  ) : null}
                </div>
              </article>
            ) : (
              <article className="flipbook-page cover-page protected-art" onContextMenu={(event) => event.preventDefault()}>
                <img
                  src="/assets/flipbook/opaija-flipbook-cover.png"
                  alt="Opaija flipbook cover"
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                />
                <a href="#founders" className="primary-action">
                  <Gift size={18} />
                  Get the Founder Drop
                </a>
              </article>
            )}
          </div>
          <div className="flipbook-controls">
            <button type="button" onClick={previousFlipPage} disabled={flipPage === 0}>
              Previous
            </button>
            <div className="flipbook-dots" aria-label="Flipbook pages">
              {flipbookPages.map((page, index) => (
                <button
                  key={page}
                  type="button"
                  className={flipPage === index ? "active" : ""}
                  onClick={() => openFlipPage(index)}
                  aria-label={index === 0 ? "Cover" : `Character page ${index}`}
                />
              ))}
            </div>
            <button type="button" onClick={nextFlipPage} disabled={flipPage === flipbookPages.length - 1}>
              Next
            </button>
          </div>
          <div className="flipbook-share-bar">
            <strong>{isFlipbookUnlocked ? "Full preview unlocked" : "Cover + four character pages free"}</strong>
            <span>Share the preview, tag @opa_ija, and invite fans into the first Caribbean anime reader list.</span>
            <div>
              <a href="https://www.instagram.com/opa_ija/" target="_blank" rel="noreferrer">Instagram</a>
              <a href="https://www.youtube.com/@Opaija" target="_blank" rel="noreferrer">YouTube</a>
            </div>
          </div>
        </div>
      </section>

      {showFlipbookGate ? (
        <div className="gate-backdrop" role="dialog" aria-modal="true" aria-labelledby="flipbook-gate-title">
          <form className="gate-modal" onSubmit={submitFlipbookUnlock}>
            <button type="button" className="gate-close" onClick={() => setShowFlipbookGate(false)} aria-label="Close">
              x
            </button>
            <span className="signal">Unlock the full preview</span>
            <h2 id="flipbook-gate-title">Get all 10 Opaija character pages.</h2>
            <p>
              Enter your email to unlock the full flipbook, join the founder list, and get early
              art drops from the first Caribbean anime saga.
            </p>
            <label>
              Name
              <input value={flipbookName} onChange={(event) => setFlipbookName(event.target.value)} placeholder="Your name" />
            </label>
            <label>
              Email
              <input
                type="text"
                inputMode="email"
                autoComplete="email"
                required
                value={flipbookEmail}
                onChange={(event) => setFlipbookEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <button type="submit" className="primary-action" disabled={flipbookStatus === "saving"}>
              <Mail size={18} />
              {flipbookStatus === "saving" ? "Unlocking..." : "Unlock the Flipbook"}
            </button>
            <small>
              Preview images are protected with watermarking and copy controls. Founder emails get release updates only.
            </small>
            {flipbookStatus === "error" ? <small className="gate-error">Could not unlock yet. Check the email and try again.</small> : null}
          </form>
        </div>
      ) : null}

      <section id="founders" className="founder-section">
        <div>
          <span className="signal">Early-bird founder list</span>
          <h2>Win the first Opaija prize pack.</h2>
          <p>
            Join the email list for free story and art drops. Share your personal link to climb
            the leaderboard. Tag us, repost us, and help carry the first Caribbean island-spanning
            anime movement into the world.
          </p>
          <div className="giveaway-prize">
            <strong>Main prize</strong>
            <span>Two Opaija character shirts in your size, two characters of your choice, plus hand-signed original artwork by Ray.</span>
          </div>
          <div className="social-boost">
            <strong>Boost your entry</strong>
            <a href="https://www.instagram.com/opa_ija/" target="_blank" rel="noreferrer">
              Follow, tag, and repost @opa_ija on Instagram
            </a>
            <a href="https://www.youtube.com/@Opaija" target="_blank" rel="noreferrer">
              Subscribe and share Opaija on YouTube
            </a>
            <span>Use #OpaijaFounders so we can spot and verify your posts.</span>
          </div>
        </div>
        <form className="founder-form" onSubmit={submitLead}>
          <label>
            Name
            <input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              placeholder="Your name"
            />
          </label>
          <label>
            Email
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Favorite character
            <select value={favoriteCharacter} onChange={(event) => setFavoriteCharacter(event.target.value)}>
              {characters.map((character) => (
                <option key={character.id}>{character.shortName}</option>
              ))}
            </select>
          </label>
          <label>
            Shirt size
            <select value={shirtSize} onChange={(event) => setShirtSize(event.target.value)}>
              {["XS", "S", "M", "L", "XL", "2XL", "3XL"].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <label>
            Prize character picks
            <select
              value={prizeCharacters.join("|")}
              onChange={(event) => setPrizeCharacters(event.target.value.split("|"))}
            >
              <option value="Kai|Mother Lall">Kai + Mother Lall</option>
              <option value="Kai|Nia">Kai + Nia</option>
              <option value="Malik|Selah">Malik + Selah</option>
              <option value="Jabari|Tariq">Jabari + Tariq</option>
              <option value="Marius|Papa Etienne">Marius + Papa Etienne</option>
            </select>
          </label>
          <label>
            Instagram handle
            <input
              value={instagramHandle}
              onChange={(event) => setInstagramHandle(event.target.value)}
              placeholder="@yourhandle"
            />
          </label>
          <div className="social-checklist" aria-label="Social contest actions">
            {[
              ["follow-instagram", "I followed @opa_ija"],
              ["repost-instagram", "I reposted or tagged @opa_ija"],
              ["subscribe-youtube", "I subscribed on YouTube"],
              ["share-youtube", "I shared the Opaija YouTube channel"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={socialActions.includes(value)}
                  onChange={(event) =>
                    setSocialActions((current) =>
                      event.target.checked ? [...current, value] : current.filter((item) => item !== value),
                    )
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <button type="submit" className="primary-action" disabled={leadStatus === "saving"}>
            <Mail size={18} />
            {leadStatus === "saving" ? "Joining..." : "Join + Get My Share Link"}
          </button>
          {leadStatus === "saved" && referralCode ? (
            <div className="referral-box">
              <strong>Your share link</strong>
              <span>{`${window.location.origin}/?ref=${referralCode}#founders`}</span>
            </div>
          ) : null}
          <p>
            {leadStatus === "saved"
              ? "You are in. Share your link to climb the leaderboard."
              : leadStatus === "error"
                ? "The form could not save locally. Try again once the API is live."
                : "No spam. Just founder drops, contest updates, and early access."}
          </p>
        </form>
      </section>

      <section className="public-section leaderboard-section">
        <div className="public-section-header">
          <span className="signal">Live contest leaderboard</span>
          <h2>Bring the tribe. Move up the board.</h2>
        </div>
        <div className="leaderboard-list">
          {(leaderboard.length ? leaderboard : [null, null, null]).map((entry: LeaderboardEntry | null, index) => (
            <article key={entry?.referralCode ?? index}>
              <strong>#{index + 1}</strong>
              <div>
                <span>{entry?.name ?? "Founder spot open"}</span>
                <small>
                  {entry ? `${entry.referrals} verified referrals / ${entry.clicks} clicks` : "Join to claim this spot"}
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="books" className="public-band">
        <div className="band-copy">
          <span className="signal">Books and digital chapters</span>
          <h2>The OPAIJA publishing roadmap starts with approved character and motion assets.</h2>
          <p>
            Full comic, manga, coloring-book, and storybook releases remain in production.
            They will only open for sale after their complete page files pass visual and lettering QA.
          </p>
        </div>
        <div className="feature-grid">
          {[
            ["32-page comic chapters", "Full digital chapters with battle pages, lore beats, and character moments."],
            ["48-64 page manga drops", "Black-and-white action chapters built from the same story canon."],
            ["KDP coloring books", "Longer printable books for fans, families, schools, and events."],
          ].map(([title, copy]) => (
            <article key={title}>
              <BookOpen size={19} />
              <strong>{title}</strong>
              <span>{copy}</span>
            </article>
          ))}
        </div>
      </section>

      <section id="pass" className="public-section reader-pass-section">
        <div className="public-section-header">
          <span className="signal">Founder Digital Vault</span>
          <h2>Start free, then unlock the approved production vault for $7.</h2>
          <p>
            The paid vault contains only files that exist now: ten character dossiers, two motion
            tests, the flipbook cover, and member voting access. No unfinished comic is advertised as complete.
          </p>
        </div>
        <div className="pass-tier-grid">
          {digitalPassTiers.map((tier) => (
            <article key={tier.name}>
              <span>{tier.price}</span>
              <h3>{tier.name}</h3>
              <p>{tier.access}</p>
              <a
                href={tier.name === "Founder Digital Vault" ? "/checkout?product=tripwire-pass&source=homepage" : "/read-free"}
                className={tier.name === "Founder Digital Vault" ? "primary-action" : "ghost-action"}
              >
                {tier.name === "Founder Digital Vault" ? <Gift size={18} /> : <BookOpen size={18} />}
                {tier.name === "Founder Digital Vault" ? "Unlock with PayPal" : "Open Preview"}
              </a>
            </article>
          ))}
        </div>
        <div className="reader-feature-strip">
          {paidReaderFeatures.slice(0, 4).map((feature) => (
            <span key={feature}>{feature}</span>
          ))}
        </div>
      </section>

      <section id="shop" className="public-section">
        <div className="public-section-header">
          <span className="signal">Design vote</span>
          <h2>Help choose the first OPAIJA character collection.</h2>
          <p>These are design candidates, not products for sale. Join the founder list to vote before production opens.</p>
        </div>
        <div className="feature-grid merch-preview">
          {merchProducts.slice(0, 6).map((product) => (
            <article key={product.name}>
              <Shirt size={19} />
              <strong>{product.name}</strong>
              <span>{product.character} / {product.type}</span>
            </article>
          ))}
        </div>
      </section>

      <footer className="public-footer">
        <img src={`${ASSET_BASE_URL}favicon.svg`} alt="OPAIJA" className="brand-logo-img" />
        <span>This is Opaija. Rhythm. Roots. Resistance.</span>
      </footer>
    </main>
  );
}




