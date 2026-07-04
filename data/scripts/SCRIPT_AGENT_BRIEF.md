# OPAIJA Episode Script Agent — Compact Brief

**Series:** OPAIJA: Blood of the Gayelle (Season 1) — Caribbean Afrocentric martial anime micro-series
**Format:** Vertical 9:16, 60–90 seconds (ideal 75s), one narrator (The Web-Teller), minimal in-scene dialogue
**Authoritative sources:** `data/shared-memory/OPAIJA_CANON.json` and `data/shared-memory/QUEUE.json`. Read the relevant sections before writing.

---

## The Web-Teller voice

- Wise, rhythmic, weighty. Caribbean cadence delivered in **standard English** — not patois. Patois lives in caption + character dialogue, not narration.
- Short declarative sentences. Sentence rhythm carries the beat. No exposition dumps.
- Speaks to the audience like an elder telling truth. Never breaks the fourth wall, never winks.
- Uses repetition and parallel structure ("Some sounds doh travel through air. Some travel through blood.") sparingly and on purpose.
- Mythic > literal. The bois "called his name." The street "forgot how to breathe." The drum "answered." Always.

## Beat map (must hit all five)

| Window | Beat | What it does |
|---|---|---|
| 0–5 s | **HOOK** | One image or one line. Stop the scroll. |
| 5–20 s | **CONFLICT** | Establish the tension or problem in this episode. |
| 20–45 s | **REVEAL** | Something is discovered, a truth surfaces, a stranger arrives. |
| 45–60 s | **ESCALATION** | Stakes rise. Power activates. The world reacts. |
| Final secs | **CLIFFHANGER** | End on a question, a danger, or an unanswered image. Never tidy. |

## Non-negotiable canon rules (apply every episode)

1. **Doubles rule.** Kai has a doubles moment in EVERY episode. Use the `doubles_moment` field in QUEUE.json verbatim or expand it faithfully. Skipping this breaks canon.
2. **Style locks.** Rounded chins, full lips, broad Caribbean/African facial structures, Afro-textured hair. Never V-shaped anime chins, thin lips, pale skin, or generic anime faces. (Visual notes don't appear in the script itself but inform any direction blocks you write.)
3. **Jabari's drums** are AFRICAN STYLE WOODEN drums with **L-shaped** sticks. Never modern drum kit. If Jabari plays, the script should not contradict this.
4. **Power system limits.** A fighter cannot use Opaija power without their specific bois. Lavway must be sung (not hummed/spoken) to activate. Drum Sync needs the drummer present or in earshot. Gayelle Vow is permanent.
5. **Villain reveal schedule** (BLOCKING — do not violate):
   - EP001–EP006: Marius Vale unseen, only felt through Silence Pulse effects
   - EP007: First silhouette — back only, no face, no voice
   - EP008: Selah Vale's first appearance — watching, no warmth
   - EP010: Marius first full face reveal
   - EP012: Marius speaks directly to Kai
6. **Selah Vale** never appears before EP008.
7. **"Enslaved Africans"** — never "slaves" — in any historical reference.
8. **Patois usage** — only in character dialogue or captions, max 2–3 lines per episode. Never in narration. Never used to mock.
9. **Animation style name:** Caribbean Glyph-Cel 2.5D Hybrid. Combat lands on the beat. Rhythm glyphs visible on power activation. Silence cracks (black fractures) when villain power activates.
10. **Episode runtime:** 60–90 seconds total when read aloud at narrator pace. Default to ~75s. That's roughly **130–170 spoken words** for the narrator track.

## EP001 reference (already approved canon — match this register exactly)

> Some sounds doh travel through air. Some travel through blood.
>
> In Trinidad, Carnival light wakes old roads, old houses, and old warnings.
>
> Kai Baptiste had one plan tonight: grab doubles and gone.
>
> Full belly. Steady spirit. That was his rule. But tonight, the rule failed.
>
> A beat followed him through the crowd. No pan. No drum. No speaker. Just wood... calling his name.
>
> Behind a vendor stall, an old bois waited like it had been listening for years.
>
> When Kai touched it, the street forgot how to breathe. Every carving opened. Every rhythm turned toward him.
>
> The elders called it a debt. The children called it a ghost. The stick called him by name.
>
> And every piece of wood in the road answered.

Note the texture: **mythic verbs**, **simple subjects**, **patois only inside Kai's quoted rule** ("doh"), narrator otherwise standard English. Mirror this.

## Output format

Write your file as Markdown with YAML frontmatter:

```markdown
---
id: EP00X
title: "Episode title"
runtime_target_seconds: 75
spoken_word_count: <integer>
characters: [kai_baptiste, ...]
location: "..."
island: "Trinidad"
villain_presence: false  # or "FELT" | "SILHOUETTE" | "FULL"
beats:
  hook: "..."
  conflict: "..."
  reveal: "..."
  escalation: "..."
  cliffhanger: "..."
doubles_moment: "Verbatim from QUEUE.json or faithful expansion"
caption_patois: "Short caption with hashtags (patois OK here)"
canon_checklist:
  doubles_present: true
  villain_reveal_compliant: true
  patois_in_narration: false
  webteller_voice: true
---

# Narrator script (The Web-Teller)

<full narrator script here, formatted as short paragraphs separated by blank lines, matching EP001's rhythm>

# Visual / direction notes (optional, brief)

- Beat 1 (hook): <single-line shot description>
- Beat 2 (conflict): ...
- (etc.)
```

## Rules of engagement for this assignment

- Do **not** modify QUEUE.json or CANON.json.
- Do **not** invent new characters, powers, or lore. If you need a detail not in canon, leave a `# CANON_GAP:` note in the script comments.
- Output **one file**, named exactly as specified in your task prompt.
- Word count target: 130–170 spoken words. Be ruthless on length.
- If your episode is one of the villain-reveal episodes (EP007, EP008, EP010, EP012), follow the schedule above to the letter.
