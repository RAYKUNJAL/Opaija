import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { canonRules, qaChecklist } from "../data/episodes";

type CheckState = Record<string, boolean>;

function ChecklistSection({
  title,
  items,
  sectionKey,
  checks,
  onToggle,
}: {
  title: string;
  items: string[];
  sectionKey: string;
  checks: CheckState;
  onToggle: (key: string) => void;
}) {
  const passed = items.filter((_, i) => checks[`${sectionKey}-${i}`]).length;
  const total = items.length;
  const allPassed = passed === total;

  return (
    <div className="qa-section">
      <div className="qa-section-header">
        <h3>{title}</h3>
        <span className={`qa-score ${allPassed ? "pass" : passed > 0 ? "partial" : "fail"}`}>
          {passed}/{total}
        </span>
      </div>
      <ul className="qa-list">
        {items.map((item, i) => {
          const key = `${sectionKey}-${i}`;
          return (
            <li key={key} className={checks[key] ? "checked" : ""}>
              <button type="button" className="qa-check-btn" onClick={() => onToggle(key)} aria-pressed={checks[key]}>
                {checks[key] ? <CheckCircle2 size={16} /> : <span className="unchecked-circle" />}
              </button>
              <span>{item}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type BrainResult = { status: string; output?: string; prompt?: string };

export function CanonGuardView() {
  const [checks, setChecks] = useState<CheckState>({});
  const [brainInput, setBrainInput] = useState("");
  const [brainTask, setBrainTask] = useState<"style-check" | "canon-check" | "marketing-hook" | "narration">(
    "style-check",
  );
  const [brainResult, setBrainResult] = useState<BrainResult | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);

  function toggleCheck(key: string) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function resetAll() {
    setChecks({});
  }

  const totalItems =
    qaChecklist.characterFace.length +
    qaChecklist.jabari.length +
    qaChecklist.episodeScript.length +
    qaChecklist.videoExport.length +
    qaChecklist.socialCaption.length +
    qaChecklist.visualStyle.length;

  const totalPassed = Object.values(checks).filter(Boolean).length;
  const overallPercent = Math.round((totalPassed / totalItems) * 100);

  async function runBrainTask(e: React.FormEvent) {
    e.preventDefault();
    if (!brainInput.trim()) return;
    setBrainLoading(true);
    setBrainResult(null);
    try {
      const res = await fetch("/api/claude/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: brainTask, brief: brainInput }),
      });
      const data = (await res.json()) as BrainResult;
      setBrainResult(data);
    } catch {
      setBrainResult({ status: "error", output: "Request failed. Check server." });
    } finally {
      setBrainLoading(false);
    }
  }

  return (
    <div className="view-grid canon-view">
      {/* Canon Rules */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <ShieldCheck size={20} />
            <h2>Canon Guard</h2>
          </div>
          <span>Non-negotiable rules — enforced on every asset</span>
        </div>
        <div className="canon-rules-grid">
          {canonRules.map((rule) => (
            <article key={rule.rule} className={`canon-rule ${rule.critical ? "critical" : "standard"}`}>
              {rule.critical ? <AlertTriangle size={15} /> : <ChevronRight size={15} />}
              <span>{rule.rule}</span>
            </article>
          ))}
        </div>
      </section>

      {/* Power System Quick Ref */}
      <section className="split-layout">
        <div className="panel">
          <div className="panel-header">
            <div>
              <Zap size={20} />
              <h2>Power System</h2>
            </div>
          </div>
          <div className="power-grid">
            {[
              { name: "Bois Memory", desc: "The stick stores ancestral combat knowledge. Older sticks = deeper memory. A stick chooses its fighter." },
              { name: "Inner Pulse", desc: "The fighter's own spiritual rhythm — their unique beat. Must be discovered, not taught." },
              { name: "Lavway Command", desc: "Call-and-response chants that activate specific abilities. Must be sung correctly — intent matters." },
              { name: "Drum Sync", desc: "Alignment with a drummer partner amplifies all powers. Jabari is Kai's drum sync partner." },
              { name: "Gayelle Vow", desc: "A sacred oath taken in the gayelle circle. Binds fighter to their bois permanently. Cannot be undone." },
            ].map((part) => (
              <article key={part.name} className="power-card">
                <h4>{part.name}</h4>
                <p>{part.desc}</p>
              </article>
            ))}
          </div>
          <div className="villain-system">
            <h4>Villain: Silence Pulse</h4>
            <p>Marius Vale's system. Suppresses rhythm, erases memory, disconnects fighters from their bois. Visual: silence cracks (not rhythm glyphs) — black void spreads where activated.</p>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <Users size={20} />
              <h2>Villain Reveal Schedule</h2>
            </div>
            <span>ENFORCED</span>
          </div>
          <ul className="villain-schedule">
            {qaChecklist.villainSchedule.map((rule) => (
              <li key={rule}>
                <AlertTriangle size={14} />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* QA Checklist */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <CheckCircle2 size={20} />
            <h2>QA Master Checklist</h2>
          </div>
          <div className="qa-header-controls">
            <span className={`qa-total ${overallPercent === 100 ? "pass" : overallPercent > 50 ? "partial" : "fail"}`}>
              {totalPassed}/{totalItems} ({overallPercent}%)
            </span>
            <button type="button" className="icon-btn" onClick={resetAll} title="Reset checklist">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="qa-checklist-grid">
          <ChecklistSection
            title="Character Face QA"
            items={qaChecklist.characterFace}
            sectionKey="face"
            checks={checks}
            onToggle={toggleCheck}
          />
          <ChecklistSection
            title="Jabari-Specific QA"
            items={qaChecklist.jabari}
            sectionKey="jabari"
            checks={checks}
            onToggle={toggleCheck}
          />
          <ChecklistSection
            title="Episode Script QA"
            items={qaChecklist.episodeScript}
            sectionKey="script"
            checks={checks}
            onToggle={toggleCheck}
          />
          <ChecklistSection
            title="Video Export QA"
            items={qaChecklist.videoExport}
            sectionKey="video"
            checks={checks}
            onToggle={toggleCheck}
          />
          <ChecklistSection
            title="Social Caption QA"
            items={qaChecklist.socialCaption}
            sectionKey="caption"
            checks={checks}
            onToggle={toggleCheck}
          />
          <ChecklistSection
            title="Visual Style QA"
            items={qaChecklist.visualStyle}
            sectionKey="style"
            checks={checks}
            onToggle={toggleCheck}
          />
        </div>
      </section>

      {/* Live Claude Brain */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <Sparkles size={20} />
            <h2>Live Claude Brain</h2>
          </div>
          <span>Canon-locked AI tasks</span>
        </div>
        <form className="brain-form" onSubmit={(e) => void runBrainTask(e)}>
          <div className="brain-controls">
            <label>
              Task type
              <select
                value={brainTask}
                onChange={(e) => setBrainTask(e.target.value as typeof brainTask)}
              >
                <option value="style-check">Style &amp; Canon Check</option>
                <option value="marketing-hook">Marketing Hooks</option>
                <option value="narration">Web-Teller Narration</option>
                <option value="canon-check">Canon Review</option>
              </select>
            </label>
          </div>
          <label>
            Input / Content to review
            <textarea
              rows={5}
              value={brainInput}
              onChange={(e) => setBrainInput(e.target.value)}
              placeholder={
                brainTask === "style-check"
                  ? "Paste content to check for canon and style compliance…"
                  : brainTask === "marketing-hook"
                    ? "Describe the episode or character to create hooks for…"
                    : brainTask === "narration"
                      ? "Describe the scene for The Web-Teller to narrate…"
                      : "Describe what you want to check against canon…"
              }
            />
          </label>
          <button type="submit" className="ep-btn primary" disabled={brainLoading || !brainInput.trim()}>
            {brainLoading ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}
            {brainLoading ? "Running…" : "Run Task"}
          </button>
        </form>

        {brainResult && (
          <div className="brain-result">
            <div className="brain-result-header">
              <span className={`brain-status ${brainResult.status}`}>
                {brainResult.status === "completed" ? "✓ Completed" : brainResult.status === "dry_run" ? "Dry Run" : "Error"}
              </span>
            </div>
            {brainResult.output ? (
              <pre className="brain-output">{brainResult.output}</pre>
            ) : brainResult.prompt ? (
              <div className="brain-dry-run">
                <strong>Dry run prompt (add ANTHROPIC_API_KEY to enable):</strong>
                <pre>{brainResult.prompt}</pre>
              </div>
            ) : null}
          </div>
        )}

        <div className="brain-presets">
          <strong>Quick tasks</strong>
          <div className="preset-btns">
            {[
              { label: "Check Jabari drums", task: "style-check" as const, brief: "Jabari plays modern drum kit with straight sticks in Episode 3." },
              { label: "Hook for EP001", task: "marketing-hook" as const, brief: "EP001: The Stick That Sang. Kai discovers the Listening Bois at Carnival in Trinidad." },
              { label: "Web-Teller intro", task: "narration" as const, brief: "Opening of Season 1. Night Carnival in Port of Spain. A magical bois calls to Kai from behind a vendor stall." },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="preset-btn"
                onClick={() => { setBrainTask(preset.task); setBrainInput(preset.brief); }}
              >
                <BookOpen size={13} />
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
