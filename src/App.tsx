import { useEffect, useState } from "react";
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
  Search,
  Shirt,
  Sparkles,
} from "lucide-react";
import { characters, type Character } from "./data/characters";
import { digitalPassTiers, paidReaderFeatures } from "./data/books";
import { merchProducts } from "./data/merch";
import { OpaijaMotionHero } from "./components/OpaijaMotionHero";
import { EpisodesView } from "./components/EpisodesView";
import { CanonGuardView } from "./components/CanonGuardView";
import { PublishingView } from "./components/PublishingView";
import { MasterDashboard } from "./components/MasterDashboard";
import { AssetBrowser } from "./components/AssetBrowser";
import { WorkReview } from "./components/WorkReview";

type View =
  | "command"
  | "episodes"
  | "canon"
  | "storage"
  | "review"
  | "publishing";

const navItems: Array<{ id: View; label: string; icon: typeof Command }> = [
  { id: "command", label: "Dashboard", icon: Command },
  { id: "episodes", label: "Episodes", icon: Clapperboard },
  { id: "canon", label: "Canon Guard", icon: CheckCircle2 },
  { id: "storage", label: "Storage", icon: Archive },
  { id: "review", label: "Review", icon: Sparkles },
  { id: "publishing", label: "Publishing", icon: Radio },
];

export function App() {
  if (window.location.pathname.startsWith("/hero-prototype")) {
    return <OpaijaMotionHero />;
  }

  const isAdminRoute = window.location.pathname.startsWith("/command") || window.location.pathname.startsWith("/admin");
  return isAdminRoute ? <CommandCenter /> : <PublicSite />;
}

function CommandCenter() {
  const [activeView, setActiveView] = useState<View>("command");

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Opaija command navigation">
        <div className="brand-lockup">
          <span className="brand-mark">O</span>
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
                onClick={() => setActiveView(item.id)}
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
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="section-label">OPAIJA Studios — Season 1</p>
            <h1>{navItems.find((n) => n.id === activeView)?.label ?? "Command Center"}</h1>
          </div>
          <div className="search-control">
            <Search size={17} />
            <span>Canon, agents, bibles, releases</span>
          </div>
        </header>

        {activeView === "command" && <MasterDashboard onNavigate={(v) => setActiveView(v as View)} />}
        {activeView === "episodes" && <EpisodesView />}
        {activeView === "canon" && <CanonGuardView />}
        {activeView === "publishing" && <PublishingView />}
        {activeView === "storage" && <AssetBrowser />}
        {activeView === "review" && <WorkReview />}
      </section>
    </main>
  );
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

function PublicSite() {
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
      fetch(`/api/growth/referrals/${encodeURIComponent(ref)}/click`, { method: "POST" }).catch(() => undefined);
    }
    fetch("/api/growth/leaderboard")
      .then((response) => response.json())
      .then((data: LeaderboardEntry[]) => setLeaderboard(data.slice(0, 6)))
      .catch(() => undefined);
  }, []);

  async function submitLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeadStatus("saving");

    try {
      const response = await fetch("/api/growth/leads", {
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
      const board = await fetch("/api/growth/leaderboard").then((res) => res.json());
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
      const response = await fetch("/api/growth/leads", {
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
      const board = await fetch("/api/growth/leaderboard").then((res) => res.json());
      setLeaderboard(board.slice(0, 6));
    } catch {
      setFlipbookStatus("error");
    }
  }

  return (
    <main className="public-site">
      <header className="site-nav">
        <a href="/" className="site-brand" aria-label="Opaija home">
          <span className="brand-mark">O</span>
          <strong>OPAIJA</strong>
        </a>
        <nav>
          <a href="#story">Story</a>
          <a href="#characters">Characters</a>
          <a href="#preview">Flipbook</a>
          <a href="#founders">Giveaway</a>
          <a href="#books">Books</a>
          <a href="#pass">Pass</a>
          <a href="#shop">Merch</a>
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
            <a href="#founders" className="primary-action">
              <Gift size={18} />
              Enter the Giveaway
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
          <h2>Not tiny samples. Full chapters, coloring books, manga drops, and storybooks.</h2>
          <p>
            Opaija is being built so every episode can become a longer book product: digital
            comic chapters, manga-style reads, KDP coloring books, narrated storybooks, and
            collector artbooks.
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
          <span className="signal">Digital comic pass</span>
          <h2>Free previews first. Paid digital books after the library opens.</h2>
          <p>
            Founder emails get the first samples. The paid reader will unlock longer Opaija books,
            bonus pages, manga drops, and collector previews once the first chapters are ready.
          </p>
        </div>
        <div className="pass-tier-grid">
          {digitalPassTiers.map((tier) => (
            <article key={tier.name}>
              <span>{tier.price}</span>
              <h3>{tier.name}</h3>
              <p>{tier.access}</p>
              <a href="#founders" className={tier.name === "Digital Comic Pass" ? "primary-action" : "ghost-action"}>
                <Mail size={18} />
                Get on the List
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
          <span className="signal">Merch coming soon</span>
          <h2>Character shirts, posters, stickers, and founder-only drops.</h2>
          <p>Join the early-bird list to vote on the first character shirts and get first access when the store opens.</p>
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
        <strong>OPAIJA</strong>
        <span>This is Opaija. Rhythm. Roots. Resistance.</span>
      </footer>
    </main>
  );
}

