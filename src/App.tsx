import { ProductionStudio } from "./components/ProductionStudio";
import { DropSignup } from "./components/DropSignup";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Command,
  Download,
  FolderKanban,
  Gift,
  Gauge,
  Image,
  Layers3,
  Megaphone,
  KeyRound,
  Play,
  Shirt,
  Radio,
  RefreshCw,
  Search,
  ServerCog,
  Sparkles,
  WandSparkles,
  Trash2,
  Users,
  Mail,
} from "lucide-react";
import { agents } from "./data/agents";
import {
  bookEngineStages,
  bookFormats,
  bookMetrics,
  digitalPassTiers,
  episodeBookProducts,
  kdpPresets,
  kdpRules,
  paidReaderFeatures,
  reuseRules,
} from "./data/books";
import { characters, type Character } from "./data/characters";
import { actionSceneStandard, fxAgents, fxMetrics, fxPillars } from "./data/fx";
import {
  complianceRules,
  contentPillars,
  growthAgents,
  growthLoops,
  growthMetrics,
  launchPlan,
  leadMagnets,
} from "./data/growth";
import { merchAgents, merchMetrics, merchPipeline, merchProducts, storeSections } from "./data/merch";
import { memoryRules, pipeline, releaseTargets } from "./data/workflows";
import { OpaijaMotionHero } from "./components/OpaijaMotionHero";

type View =
  | "command"
  | "setup"
  | "assets"
  | "characters"
  | "agents"
  | "pipeline"
  | "books"
  | "fx"
  | "merch"
  | "growth";

const navItems: Array<{ id: View; label: string; icon: typeof Command }> = [
  { id: "command", label: "Command", icon: Command },
  { id: "setup", label: "Setup", icon: ServerCog },
  { id: "assets", label: "Files", icon: Archive },
  { id: "characters", label: "Characters", icon: Users },
  { id: "agents", label: "Agents", icon: Brain },
  { id: "pipeline", label: "Pipeline", icon: FolderKanban },
  { id: "growth", label: "Growth", icon: Megaphone },
  { id: "fx", label: "FX", icon: WandSparkles },
  { id: "books", label: "Books", icon: BookOpen },
  { id: "merch", label: "Merch", icon: Shirt },
];

const statusLabels: Record<Character["status"], string> = {
  locked: "Sheet loaded",
  "needs-bible": "Needs bible",
  "needs-model-sheet": "Needs model sheet",
};

export function App() {
  if (window.location.pathname === "/studio") return <ProductionStudio />;
  if (window.location.pathname.startsWith("/hero-prototype")) {
    return <OpaijaMotionHero />;
  }

  const isAdminRoute = window.location.pathname.startsWith("/command") || window.location.pathname.startsWith("/admin");
  return isAdminRoute ? <CommandCenter /> : <PublicSite />;
}

function CommandCenter() {
  const [activeView, setActiveView] = useState<View>("command");
  const [selectedCharacter, setSelectedCharacter] = useState<Character>(characters[0]);
  const [agentFilter, setAgentFilter] = useState("All");
  const [queueMode, setQueueMode] = useState("Bible Build");

  const filteredAgents = useMemo(() => {
    if (agentFilter === "All") return agents;
    return agents.filter((agent) => agent.team === agentFilter);
  }, [agentFilter]);

  const lockedCount = characters.filter((character) => character.status === "locked").length;
  const bibleQueue = characters.filter((character) => character.status !== "locked").length;

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
            <p className="section-label">Rhythm. Roots. Resistance.</p>
            <h1>Build the commercial content machine.</h1>
          </div>
          <div className="search-control">
            <Search size={17} />
            <span>Canon, agents, bibles, releases</span>
          </div>
        </header>

        {activeView === "command" && (
          <CommandView
            lockedCount={lockedCount}
            bibleQueue={bibleQueue}
            selectedCharacter={selectedCharacter}
            setSelectedCharacter={setSelectedCharacter}
          />
        )}
        {activeView === "setup" && <SetupView />}
        {activeView === "assets" && <AssetLibraryView />}
        {activeView === "characters" && (
          <CharactersView selectedCharacter={selectedCharacter} setSelectedCharacter={setSelectedCharacter} />
        )}
        {activeView === "agents" && (
          <AgentsView agentFilter={agentFilter} setAgentFilter={setAgentFilter} filteredAgents={filteredAgents} />
        )}
        {activeView === "pipeline" && <PipelineView queueMode={queueMode} setQueueMode={setQueueMode} />}
        {activeView === "growth" && <GrowthView />}
        {activeView === "fx" && <FxView />}
        {activeView === "books" && <BookEngineView />}
        {activeView === "merch" && <MerchView />}
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
          <a href="#drops">Drop list</a>
          <a href="#books">Books</a>
          <a href="#pass">Pass</a>
          <a href="#shop">Merch</a>
        </nav>
      </header>

      <section className="public-hero">
        <div className="public-copy">
          <p className="section-label">OPAIJA · Written and created by Ray Kunjal</p>
          <h1>Born in Trinidad & Tobago. Built for the Caribbean.</h1>
          <p>
            Born in Trinidad and Tobago, Opaija begins a journey through the Caribbean islands,
            where rhythm carries memory, every shore hides a guardian, and one young fighter must
            protect a power his people were never meant to forget.
          </p>
          <div className="public-actions">
            <a href="#preview" className="primary-action">
              <Play size={18} />
              Explore the Free Preview
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

      <DropSignup />
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
          <h2>Meet the characters in the free preview.</h2>
          <p>
            Start with the cover and four free character pages. Drop your email to unlock all 10
            character spreads, then get first notice when the longer comic, manga, storybook, and
            coloring-book drops open.
          </p>
        </div>
        <div className="flipbook-shell">
          <div className="flipbook-cta-strip">
            <div>
              <strong>Explore all 10 character spreads?</strong>
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

function CommandView({
  lockedCount,
  bibleQueue,
  selectedCharacter,
  setSelectedCharacter,
}: {
  lockedCount: number;
  bibleQueue: number;
  selectedCharacter: Character;
  setSelectedCharacter: (character: Character) => void;
}) {
  return (
    <div className="view-grid command-grid">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="signal">Season 1 operating room</span>
          <h2>Opaija runs from one shared source of truth.</h2>
          <p>
            The system starts with character bibles, model sheets, agent ownership, repeatable video
            packets, and launch assets tied to revenue from day one.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-action">
              <Clapperboard size={18} />
              Start content sprint
            </button>
            <button type="button" className="ghost-action">
              <Archive size={18} />
              Open canon memory
            </button>
          </div>
        </div>
        <div className="hero-art">
          <img src={selectedCharacter.image} alt={`${selectedCharacter.name} model sheet`} />
        </div>
      </section>

      <section className="metric-row" aria-label="Command metrics">
        <MetricCard icon={Image} label="Sheets loaded" value={`${lockedCount}/10`} detail="P1 cast reference library" />
        <MetricCard icon={Layers3} label="Bible queue" value={`${bibleQueue}`} detail="Characters awaiting full canon" />
        <MetricCard icon={Brain} label="Agents" value={`${agents.length}`} detail="Brain, Goose, Paperclip, revenue" />
        <MetricCard icon={CalendarDays} label="Launch buffer" value="34" detail="Planned assets before pilot" />
      </section>

      <section className="split-layout">
        <div className="panel">
          <PanelHeader icon={Users} title="Priority Cast" action="Character room" />
          <div className="character-strip">
            {characters.slice(0, 10).map((character) => (
              <button
                type="button"
                key={character.id}
                className={selectedCharacter.id === character.id ? "mini-character active" : "mini-character"}
                onClick={() => setSelectedCharacter(character)}
              >
                {character.image ? <img src={character.image} alt="" /> : <span>{character.shortName.slice(0, 2)}</span>}
                <strong>{character.shortName}</strong>
                <small>{statusLabels[character.status]}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <PanelHeader icon={Activity} title="Live Pipeline" action="Ops board" />
          <div className="pipeline-list">
            {pipeline.map((stage) => (
              <article key={stage.id} className={`pipeline-item ${stage.status}`}>
                <div>
                  <strong>{stage.name}</strong>
                  <span>{stage.owner}</span>
                </div>
                <p>{stage.metric}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

type HealthStatus = {
  ok: boolean;
  provider: string;
  voiceProvider: string;
  keys: Record<string, boolean>;
  seedance: string;
  publicSiteUrl?: string;
  email?: {
    provider: string;
    configured: boolean;
    from: string;
  };
};

function SetupView() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [summary, setSummary] = useState<{ leadCount: number; contestOptIns: number } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((data: HealthStatus) => setHealth(data))
      .catch(() => undefined);
    fetch("/api/growth/summary")
      .then((response) => response.json())
      .then((data) => setSummary(data))
      .catch(() => undefined);
  }, []);

  const providerRows = [
    ["OpenAI Brain", health?.keys.openai, "OPENAI_API_KEY"],
    ["Seedance / fal.ai", health?.keys.fal, "FAL_KEY"],
    ["ElevenLabs Voice", health?.keys.elevenlabs, "ELEVENLABS_API_KEY"],
    ["Resend Email", health?.keys.resend, "RESEND_API_KEY + RESEND_AUDIENCE_ID"],
    ["Print-on-demand", Boolean(health?.keys.printful || health?.keys.printify), "PRINTFUL_API_KEY or PRINTIFY_API_KEY"],
  ] as const;

  return (
    <div className="view-grid setup-room">
      <section className="book-hero setup-hero">
        <div>
          <span className="signal">Admin setup</span>
          <h2>Connect the content machine, email list, and AI production team.</h2>
          <p>
            Put provider keys in the local `.env` file while building. On the live server, the same variables go in
            the server project `.env` or hosting secret manager. Never paste API keys into public pages or commits.
          </p>
        </div>
        <div className="book-metrics">
          <article>
            <span>Site</span>
            <strong>{health?.ok ? "Live local" : "Checking"}</strong>
            <small>{health?.publicSiteUrl || "PUBLIC_SITE_URL not loaded"}</small>
          </article>
          <article>
            <span>Founder leads</span>
            <strong>{summary?.leadCount ?? 0}</strong>
            <small>{summary?.contestOptIns ?? 0} contest opt-ins</small>
          </article>
        </div>
      </section>

      <section className="split-layout">
        <div className="panel">
          <PanelHeader icon={KeyRound} title="Provider Keys" action="Readiness" />
          <div className="setup-checklist">
            {providerRows.map(([label, ready, variable]) => (
              <article key={label} className={ready ? "ready" : "missing"}>
                <span>{ready ? "Connected" : "Missing"}</span>
                <div>
                  <strong>{label}</strong>
                  <small>{variable}</small>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <PanelHeader icon={Mail} title="Resend Email Setup" action="Founder list" />
          <div className="env-instructions">
            <p>Local key file:</p>
            <code>C:\Users\RAY\OneDrive\Documents\Opaija\.env</code>
            <p>Add or update these lines:</p>
            <pre>{`RESEND_API_KEY=re_...
RESEND_AUDIENCE_ID=...
RESEND_FROM_EMAIL=Opaija <founders@opaija.com>
PUBLIC_SITE_URL=https://opaija.com`}</pre>
            <small>After saving `.env`, restart the Node/API process so Resend is picked up.</small>
          </div>
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={Brain} title="AI Team Command" action="Brain + Goose + Paperclip" />
        <div className="agent-grid">
          {agents.slice(0, 9).map((agent) => {
            const Icon = agent.icon;
            return (
              <article key={agent.id} className="agent-card">
                <div className="agent-topline">
                  <span className={`agent-state ${agent.status}`}>{agent.status}</span>
                  <Icon size={22} />
                </div>
                <h3>{agent.name}</h3>
                <p>{agent.role}</p>
                <div className="agent-output">
                  <strong>{agent.cadence}</strong>
                  <span>{agent.output}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="split-layout">
        <div className="panel">
          <PanelHeader icon={Sparkles} title="Open-Generative-AI Fit" action="Reference, not core" />
          <ul className="memory-list">
            <li><ChevronRight size={16} /><span>Use it as a model-provider/studio reference, not as the Opaija source of truth.</span></li>
            <li><ChevronRight size={16} /><span>Keep Opaija canon, character memory, prompts, and approvals inside this command center.</span></li>
            <li><ChevronRight size={16} /><span>Add selected provider patterns later behind our existing `/api/video`, `/api/voice`, and `/api/brain` adapters.</span></li>
          </ul>
        </div>
        <div className="panel">
          <PanelHeader icon={ServerCog} title="Live Deploy Blocker" action="SSH" />
          <div className="env-instructions">
            <p>The current SSH key did not authenticate to `root@5.78.105.83`.</p>
            <p>To take `opaija.com` live from here, add this key to the server user or give the correct user/path:</p>
            <code>C:\Users\RAY\.ssh\codex_nextbagchaser_hetzner.pub</code>
          </div>
        </div>
      </section>
    </div>
  );
}

type AssetFile = {
  id: string;
  name: string;
  relativePath: string;
  category: string;
  size: number;
  updatedAt: string;
  downloadable: boolean;
  deletable: boolean;
  downloadUrl: string;
};

function AssetLibraryView() {
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [deletingId, setDeletingId] = useState("");

  async function loadAssets() {
    setStatus("loading");
    try {
      const response = await fetch("/api/assets");
      if (!response.ok) throw new Error("Unable to load asset library");
      const data = (await response.json()) as { assets: AssetFile[] };
      setAssets(data.assets);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    loadAssets();
  }, []);

  async function deleteAsset(asset: AssetFile) {
    if (!asset.deletable) return;
    setDeletingId(asset.id);
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to delete asset");
      setAssets((current) => current.filter((item) => item.id !== asset.id));
    } catch {
      setStatus("error");
    } finally {
      setDeletingId("");
    }
  }

  const totals = assets.reduce(
    (acc, asset) => {
      acc.bytes += asset.size;
      acc.categories.add(asset.category);
      if (asset.deletable) acc.generated += 1;
      return acc;
    },
    { bytes: 0, generated: 0, categories: new Set<string>() },
  );

  return (
    <div className="view-grid asset-room">
      <section className="book-hero asset-hero">
        <div>
          <span className="signal">Production file room</span>
          <h2>See what the machine has made, download finished assets, and remove bad outputs.</h2>
          <p>
            Generated videos, voiceovers, book packets, flipbook files, and locked reference assets are tracked from one
            dashboard. Only generated outputs can be deleted here; source character art stays protected.
          </p>
        </div>
        <div className="book-metrics">
          <article>
            <span>Files</span>
            <strong>{assets.length}</strong>
            <small>{totals.categories.size} asset groups</small>
          </article>
          <article>
            <span>Generated</span>
            <strong>{totals.generated}</strong>
            <small>safe to delete</small>
          </article>
          <article>
            <span>Storage</span>
            <strong>{formatBytes(totals.bytes)}</strong>
            <small>tracked locally</small>
          </article>
        </div>
      </section>

      <section className="panel asset-library-panel">
        <PanelHeader icon={Archive} title="Asset Library" action={status === "loading" ? "Scanning files" : "Download / delete"} />
        <div className="asset-toolbar">
          <p>
            Books in <code>out/books</code>, rendered videos in <code>out</code>, and voiceovers in <code>public/voiceover</code>
            are managed outputs. Character sheets and site media are locked for brand safety.
          </p>
          <button type="button" className="ghost-action" onClick={loadAssets}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {status === "error" ? (
          <div className="empty-state">
            <Archive size={28} />
            <strong>Could not load the asset library.</strong>
            <span>Check the API server, then refresh this panel.</span>
          </div>
        ) : null}

        <div className="asset-table" aria-label="Generated asset library">
          <div className="asset-row asset-row-head">
            <span>File</span>
            <span>Group</span>
            <span>Size</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>
          {assets.map((asset) => (
            <article key={asset.id} className="asset-row">
              <div>
                <strong>{asset.name}</strong>
                <small>{asset.relativePath}</small>
              </div>
              <span className="asset-chip">{asset.category}</span>
              <span>{formatBytes(asset.size)}</span>
              <span>{formatDate(asset.updatedAt)}</span>
              <div className="asset-actions">
                {asset.downloadable ? (
                  <a className="icon-action" href={asset.downloadUrl}>
                    <Download size={16} />
                    <span>Download</span>
                  </a>
                ) : null}
                <button
                  type="button"
                  className="icon-action danger"
                  disabled={!asset.deletable || deletingId === asset.id}
                  onClick={() => deleteAsset(asset)}
                >
                  <Trash2 size={16} />
                  <span>{asset.deletable ? (deletingId === asset.id ? "Deleting" : "Delete") : "Locked"}</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value: string) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );
}

function CharactersView({
  selectedCharacter,
  setSelectedCharacter,
}: {
  selectedCharacter: Character;
  setSelectedCharacter: (character: Character) => void;
}) {
  return (
    <div className="view-grid character-room">
      <section className="character-gallery" aria-label="Season 1 character list">
        {characters.map((character) => (
          <button
            type="button"
            key={character.id}
            className={selectedCharacter.id === character.id ? "character-card active" : "character-card"}
            onClick={() => setSelectedCharacter(character)}
          >
            <div className="thumb-frame">
              {character.image ? (
                <img src={character.image} alt={`${character.name} reference sheet`} />
              ) : (
                <div className="empty-thumb">
                  <Sparkles size={24} />
                </div>
              )}
            </div>
            <div className="card-copy">
              <span>{character.priority}</span>
              <strong>{character.name}</strong>
              <small>{character.role}</small>
            </div>
          </button>
        ))}
      </section>

      <aside className="detail-panel">
        <div className="detail-media">
          {selectedCharacter.image ? (
            <img src={selectedCharacter.image} alt={`${selectedCharacter.name} full model sheet`} />
          ) : (
            <div className="empty-reference">
              <Sparkles size={42} />
              <strong>Reference sheet pending</strong>
            </div>
          )}
        </div>
        <div className="detail-copy">
          <span className={`status-pill ${selectedCharacter.status}`}>{statusLabels[selectedCharacter.status]}</span>
          <h2>{selectedCharacter.name}</h2>
          <p>{selectedCharacter.role}</p>
          <dl className="profile-grid">
            <div>
              <dt>Island</dt>
              <dd>{selectedCharacter.island}</dd>
            </div>
            <div>
              <dt>Power</dt>
              <dd>{selectedCharacter.power}</dd>
            </div>
            <div>
              <dt>Weapon</dt>
              <dd>{selectedCharacter.weapon}</dd>
            </div>
          </dl>
          <InfoList title="Next build packet" items={selectedCharacter.pipeline} />
          <InfoList title="Brand hooks" items={selectedCharacter.merchHooks} />
        </div>
      </aside>
    </div>
  );
}

function AgentsView({
  agentFilter,
  setAgentFilter,
  filteredAgents,
}: {
  agentFilter: string;
  setAgentFilter: (team: string) => void;
  filteredAgents: typeof agents;
}) {
  const teams = ["All", "Brain", "Goose", "Paperclip", "Revenue", "Guardrail"];

  return (
    <div className="view-grid">
      <section className="panel">
        <PanelHeader icon={Brain} title="AI Team Roster" action="Shared ownership" />
        <div className="segmented-control" aria-label="Filter agents by team">
          {teams.map((team) => (
            <button
              type="button"
              key={team}
              className={agentFilter === team ? "active" : ""}
              onClick={() => setAgentFilter(team)}
            >
              {team}
            </button>
          ))}
        </div>
        <div className="agent-grid">
          {filteredAgents.map((agent) => {
            const Icon = agent.icon;
            return (
              <article key={agent.id} className="agent-card">
                <div className="agent-topline">
                  <span className={`agent-state ${agent.status}`}>{agent.status}</span>
                  <Icon size={22} />
                </div>
                <h3>{agent.name}</h3>
                <p>{agent.role}</p>
                <InfoList title="Owns" items={agent.owns} />
                <div className="agent-output">
                  <strong>{agent.cadence}</strong>
                  <span>{agent.output}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PipelineView({
  queueMode,
  setQueueMode,
}: {
  queueMode: string;
  setQueueMode: (mode: string) => void;
}) {
  return (
    <div className="view-grid pipeline-room">
      <section className="panel">
        <PanelHeader icon={Gauge} title="Production Workflow" action="Repeatable content machine" />
        <div className="mode-row" aria-label="Pipeline queue mode">
          {["Bible Build", "Video Packets", "Launch Calendar"].map((mode) => (
            <button
              type="button"
              key={mode}
              className={queueMode === mode ? "mode-button active" : "mode-button"}
              onClick={() => setQueueMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="stage-board">
          {pipeline.map((stage) => (
            <article key={stage.id} className={`stage-column ${stage.status}`}>
              <div className="stage-header">
                <span>{stage.status}</span>
                <h3>{stage.name}</h3>
                <p>{stage.owner}</p>
              </div>
              <ul>
                {stage.tasks.map((task) => (
                  <li key={task}>
                    <CheckCircle2 size={16} />
                    <span>{task}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="split-layout">
        <div className="panel">
          <PanelHeader icon={Archive} title="Memory Rules" action="Canon guardrails" />
          <ul className="memory-list">
            {memoryRules.map((rule) => (
              <li key={rule}>
                <ChevronRight size={16} />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <PanelHeader icon={CalendarDays} title="Release Targets" action="Launch runway" />
          <div className="target-list">
            {releaseTargets.map((target) => (
              <article key={target.label}>
                <strong>{target.count}</strong>
                <div>
                  <span>{target.label}</span>
                  <small>
                    {target.format} / {target.timing}
                  </small>
                </div>
                <ArrowRight size={17} />
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function BookEngineView() {
  return (
    <div className="view-grid book-room">
      <section className="panel">
        <PanelHeader icon={BookOpen} title="Book Engine" action="Amazon KDP-ready reuse system" />
        <div className="book-hero">
          <div>
            <span className="signal">Episode art becomes products</span>
            <h2>Comics, manga, coloring books, storybooks, and artbooks from one asset bank.</h2>
            <p>
              Each episode creates a reusable asset packet first. The book engine adapts approved model sheets,
              keyframes, props, backgrounds, narration, and captions into KDP-ready page manifests.
            </p>
          </div>
          <div className="book-metrics">
            {bookMetrics.map((metric) => (
              <article key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </article>
            ))}
          </div>
        </div>

        <div className="book-format-grid">
          {bookFormats.map((format) => {
            const Icon = format.icon;
            return (
              <article key={format.id} className={`book-format ${format.status}`}>
                <div className="agent-topline">
                  <Icon size={23} />
                  <span className={`agent-state ${format.status === "ready" ? "online" : "building"}`}>
                    {format.status}
                  </span>
                </div>
                <h3>{format.name}</h3>
                <p>{format.format}</p>
                <div className="book-source">
                  <strong>Reuse source</strong>
                  <span>{format.reuseSource}</span>
                </div>
                <InfoList title="Outputs" items={format.outputs} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="split-layout">
        <div className="panel">
          <PanelHeader icon={Layers3} title="Engine Stages" action="Asset reuse workflow" />
          <div className="book-stage-list">
            {bookEngineStages.map((stage, index) => (
              <article key={stage.id}>
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                <div>
                  <h3>{stage.name}</h3>
                  <span>{stage.owner}</span>
                  <p>{stage.task}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <PanelHeader icon={Archive} title="Reuse Rules" action="Keep art on brand" />
          <ul className="memory-list">
            {reuseRules.map((rule) => (
              <li key={rule}>
                <ChevronRight size={16} />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="split-layout">
        <div className="panel">
          <PanelHeader icon={BookOpen} title="KDP Presets" action="Default print targets" />
          <div className="target-list">
            {kdpPresets.map((preset) => (
              <article key={preset.name}>
                <strong>KDP</strong>
                <div>
                  <span>{preset.name}</span>
                  <small>
                    {preset.trim} / {preset.bleedPage} / {preset.use}
                  </small>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <PanelHeader icon={CheckCircle2} title="KDP Rules" action="Upload guardrails" />
          <ul className="memory-list">
            {kdpRules.map((rule) => (
              <li key={rule}>
                <ChevronRight size={16} />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={CalendarDays} title="First Book Products" action="Built from episodes" />
        <div className="episode-product-grid">
          {episodeBookProducts.map((episode) => (
            <article key={episode.episode}>
              <h3>{episode.episode}</h3>
              <InfoList title="Products" items={episode.products} />
              <InfoList title="Source assets" items={episode.sourceAssets} />
            </article>
          ))}
        </div>
      </section>

      <section className="split-layout">
        <div className="panel">
          <PanelHeader icon={KeyRound} title="Digital Reader Pass" action="Paid library roadmap" />
          <div className="target-list">
            {digitalPassTiers.map((tier) => (
              <article key={tier.name}>
                <strong>{tier.price}</strong>
                <div>
                  <span>{tier.name}</span>
                  <small>{tier.access}</small>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <PanelHeader icon={CheckCircle2} title="Reader Rules" action="Free sample to paid book" />
          <ul className="memory-list">
            {paidReaderFeatures.map((feature) => (
              <li key={feature}>
                <ChevronRight size={16} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function FxView() {
  return (
    <div className="view-grid book-room">
      <section className="panel">
        <PanelHeader icon={WandSparkles} title="Cinematic FX Engine" action="Anime action plus Opaija power language" />
        <div className="book-hero fx-hero">
          <div>
            <span className="signal">World-class action standard</span>
            <h2>Pose-first anime action with Caribbean rhythm effects layered in post.</h2>
            <p>
              We do not need to train a model first. The right move is an FX agent with a strict effects bible,
              reference packs, Seedance prompts, and Remotion compositing. Train or fine-tune later only if
              consistency breaks at scale.
            </p>
          </div>
          <div className="book-metrics">
            {fxMetrics.map((metric) => (
              <article key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </article>
            ))}
          </div>
        </div>

        <div className="agent-grid">
          {fxAgents.map((agent) => {
            const Icon = agent.icon;
            return (
              <article key={agent.name} className="agent-card">
                <div className="agent-topline">
                  <span className="agent-state online">active</span>
                  <Icon size={22} />
                </div>
                <h3>{agent.name}</h3>
                <p>{agent.role}</p>
                <InfoList title="Owns" items={agent.owns} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="split-layout">
        <div className="panel">
          <PanelHeader icon={Sparkles} title="FX Pillars" action="Power language" />
          <div className="book-stage-list">
            {fxPillars.map((pillar, index) => (
              <article key={pillar.name}>
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                <div>
                  <h3>{pillar.name}</h3>
                  <span>{pillar.visual}</span>
                  <p>{pillar.use}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <PanelHeader icon={CheckCircle2} title="Action Rules" action="Shot QC" />
          <ul className="memory-list">
            {actionSceneStandard.map((rule) => (
              <li key={rule}>
                <ChevronRight size={16} />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function GrowthView() {
  return (
    <div className="view-grid book-room">
      <section className="panel">
        <PanelHeader icon={Megaphone} title="Tribe Growth Engine" action="Organic, paid, email, blog, founder list" />
        <div className="book-hero growth-hero">
          <div>
            <span className="signal">Owned audience first</span>
            <h2>Build the fan tribe fast, then scale winners with paid ads.</h2>
            <p>
              The growth engine turns characters, lore, art drops, story blogs, and founder collectibles into
              email capture, retargeting pools, social momentum, and early revenue signals.
            </p>
          </div>
          <div className="book-metrics">
            {growthMetrics.map((metric) => (
              <article key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </article>
            ))}
          </div>
        </div>

        <div className="agent-grid">
          {growthAgents.map((agent) => {
            const Icon = agent.icon;
            return (
              <article key={agent.name} className="agent-card">
                <div className="agent-topline">
                  <span className="agent-state online">{agent.channel}</span>
                  <Icon size={22} />
                </div>
                <h3>{agent.name}</h3>
                <p>{agent.role}</p>
                <InfoList title="Owns" items={agent.owns} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="split-layout">
        <div className="panel">
          <PanelHeader icon={Radio} title="Growth Loops" action="Agents feed each other" />
          <div className="book-stage-list">
            {growthLoops.map((loop, index) => (
              <article key={loop.name}>
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                <div>
                  <h3>{loop.name}</h3>
                  <span>
                    {loop.target} / {loop.cadence}
                  </span>
                  <p>{loop.steps.join(" -> ")}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <PanelHeader icon={Gift} title="Lead Magnets" action="Email capture assets" />
          <div className="target-list">
            {leadMagnets.map((magnet) => (
              <article key={magnet.name}>
                <strong>Lead</strong>
                <div>
                  <span>{magnet.name}</span>
                  <small>
                    {magnet.type} / {magnet.capture}
                  </small>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="split-layout">
        <div className="panel">
          <PanelHeader icon={CalendarDays} title="Fast Launch Plan" action="5-week sprint" />
          <div className="book-stage-list">
            {launchPlan.map((week) => (
              <article key={week.week}>
                <strong>{week.week.replace("Week ", "W")}</strong>
                <div>
                  <h3>{week.focus}</h3>
                  <p>{week.output}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <PanelHeader icon={CheckCircle2} title="Growth Guardrails" action="Business-safe growth" />
          <ul className="memory-list">
            {complianceRules.map((rule) => (
              <li key={rule}>
                <ChevronRight size={16} />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={BookOpen} title="Story Blog Pillars" action="Lead-gen content system" />
        <div className="episode-product-grid">
          {contentPillars.map((pillar) => (
            <article key={pillar}>
              <h3>{pillar}</h3>
              <p>Turn this pillar into shorts, blog posts, email drops, ad angles, and book/KDP previews.</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MerchView() {
  return (
    <div className="view-grid book-room">
      <section className="panel">
        <PanelHeader icon={Shirt} title="Merch and Store Engine" action="Print-on-demand plus Opaija website" />
        <div className="book-hero merch-hero">
          <div>
            <span className="signal">Brand products from every episode</span>
            <h2>Approved artwork becomes tees, hoodies, posters, stickers, books, and storefront drops.</h2>
            <p>
              Printful and Printify both expose APIs. The engine creates draft products first, generates mockups,
              and only publishes after approval so the brand stays tight.
            </p>
          </div>
          <div className="book-metrics">
            {merchMetrics.map((metric) => (
              <article key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </article>
            ))}
          </div>
        </div>

        <div className="agent-grid">
          {merchAgents.map((agent) => {
            const Icon = agent.icon;
            return (
              <article key={agent.name} className="agent-card">
                <div className="agent-topline">
                  <span className="agent-state building">building</span>
                  <Icon size={22} />
                </div>
                <h3>{agent.name}</h3>
                <p>{agent.role}</p>
                <InfoList title="Owns" items={agent.owns} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="split-layout">
        <div className="panel">
          <PanelHeader icon={Shirt} title="First Drops" action="Product ideas" />
          <div className="target-list">
            {merchProducts.map((product) => (
              <article key={product.name}>
                <strong>{product.status === "needs-cutout" ? "PNG" : "SKU"}</strong>
                <div>
                  <span>{product.name}</span>
                  <small>
                    {product.character} / {product.type} / {product.providerFit}
                  </small>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <PanelHeader icon={FolderKanban} title="POD Pipeline" action="Draft before publish" />
          <ul className="memory-list">
            {merchPipeline.map((step) => (
              <li key={step}>
                <ChevronRight size={16} />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={Archive} title="Opaija Website" action="Domain-ready structure" />
        <div className="episode-product-grid">
          {storeSections.map((section) => (
            <article key={section}>
              <h3>{section.split(":")[0]}</h3>
              <p>{section}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Command;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function PanelHeader({ icon: Icon, title, action }: { icon: typeof Command; title: string; action: string }) {
  return (
    <div className="panel-header">
      <div>
        <Icon size={20} />
        <h2>{title}</h2>
      </div>
      <span>{action}</span>
    </div>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="info-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
