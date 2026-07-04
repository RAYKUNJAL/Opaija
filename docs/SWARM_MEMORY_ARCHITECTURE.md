# OPAIJA Swarm Memory Architecture

### The nervous system connecting all agents across every episode

---

## 1. The three memory layers

```
/OPAIJA/memory/
  MESSAGE_BUS.jsonl          <- how agents "talk" (append-only, durable, replayable)
  LEARNINGS.jsonl            <- how the swarm "learns" (outcomes feed forward)
  CANON_MEMORY.json          <- long-term shared knowledge (facts every agent trusts)
/OPAIJA/episodes/epNN/
  EPISODE_STATE.json         <- working memory, per-episode
```

**Working memory** (EPISODE_STATE.json) is short-lived — one episode's production state. **Long-term memory** (CANON_MEMORY.json + LEARNINGS.jsonl) persists across every episode forever. This split matters: an agent working on Episode 7 should never have to re-learn a lesson from Episode 2.

---

## 2. MESSAGE_BUS.jsonl — how agents talk

Every agent, instead of calling another agent directly, posts a structured message to one shared append-only log. Any agent can read the whole history; any agent can filter by topic.

```json
{"ts":"2026-07-03T14:02:11Z","from":"Canon Guardian","to":"Script Writer","topic":"ep01.canon_violation","body":"Line 88 uses 'slaves' — must be 'enslaved Africans' per CANON_ADDENDUM_2.","episode":"ep01","severity":"blocker"}
{"ts":"2026-07-03T14:04:55Z","from":"Script Writer","to":"Canon Guardian","topic":"ep01.canon_violation","body":"Fixed, resubmitting script v2.","episode":"ep01","severity":"resolved"}
```

Every agent's turn follows the same loop:
1. Read new messages addressed to it (or its topic) since its last checkpoint.
2. Do its job.
3. Post a message describing what it did and who's next.

---

## 3. LEARNINGS.jsonl — how the swarm learns

After every episode, every rejected Seedance generation, every Canon Guardian catch, and every real audience metric gets written here as a structured lesson:

```json
{"ts":"2026-07-10T09:00:00Z","source":"Animation Agent","type":"seedance_rejection","detail":"Prompts describing 'stick' alone generate generic weapons — must always specify 'wooden bois, hand-carved, Trinidad kalinda style' or Seedance defaults to a generic staff.","apply_to":["Seedance Packager"]}
```

**The mechanism that makes this actually work:** every agent's prompt template includes a step that queries LEARNINGS.jsonl filtered to `apply_to` containing its own name, and injects the last ~10 relevant lessons into its context before it starts work. This is retrieval-augmented memory — you don't need to fine-tune anything.

---

## 4. CANON_MEMORY.json — long-term shared facts

Stable knowledge every agent can trust without re-deriving it. Keep `data/shared-memory/OPAIJA_CANON.json` as the human-authored source of truth. The script `scripts/generate-canon-memory.ts` regenerates `memory/CANON_MEMORY.json` from it (flattened, keyed by topic) every time you edit canon. Agents read the generated file; you edit the human one.

---

## 5. How the orchestrator runs this as a loop

Concretely, each agent's invocation follows this shape every single time it runs:

1. **Load context**: read CANON_MEMORY.json, read LEARNINGS.jsonl filtered to this agent, read new MESSAGE_BUS entries addressed to this agent, read the current EPISODE_STATE.json.
2. **Do the job** (write the script, package the shots, call Seedance, whatever this agent's role is).
3. **Write outputs** to the episode folder.
4. **Post to MESSAGE_BUS.jsonl**: what was done, what's next, who's next.
5. **If something went wrong or was corrected**, also write an entry to LEARNINGS.jsonl.
6. **Update EPISODE_STATE.json** stage/flags so the next agent's gate condition is met.

Orchestrator's only job is a polling loop: check EPISODE_STATE.json's `stage` field, and fire the next agent whose gate condition is now true. That's the entire swarm — independent runs, each stateless in itself, made coherent purely by three shared files.

---

## 6. Files

| File | Purpose |
|------|---------|
| `memory/MESSAGE_BUS.jsonl` | Append-only agent communication log |
| `memory/LEARNINGS.jsonl` | Cross-episode lessons (retrieval-augmented memory) |
| `memory/CANON_MEMORY.json` | Flattened canon for fast agent lookup |
| `scripts/generate-canon-memory.ts` | Regenerates CANON_MEMORY.json from OPAIJA_CANON.json |
| `episodes/epNN/EPISODE_STATE.json` | Per-episode working memory |
| `ops/agents/AGENT_ROSTER.yaml` | 15 core agents with 6-step memory loop prompts |
| `scripts/swarm-orchestrator.ts` | Polling loop that fires agents based on EPISODE_STATE |
| `OPAIJA_CANON_ADDENDUM_2.md` | Five-Part Power System draft (pending Ray's approval) |
| `docs/EPISODE_1_AGENTIC_PIPELINE.md` | Episode 1 pipeline stage mapping |

---

## 7. Regeneration

After editing `data/shared-memory/OPAIJA_CANON.json`:

```bash
npx tsx scripts/generate-canon-memory.ts
```

This regenerates `memory/CANON_MEMORY.json` with the latest canon, flattened and keyed for agent lookup.
