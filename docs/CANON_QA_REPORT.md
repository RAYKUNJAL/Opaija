# OPAIJA Canon QA Report — Season 1 Narrator Scripts

**Audit date:** 2026-05-12
**Auditor:** Canon QA Agent (re-run)
**Scripts audited:** 12 (EP001 from `data/shared-memory/QUEUE.json`; EP002–EP012 from `data/scripts/EP00X-narrator-script.md`)
**Canon source:** `data/shared-memory/OPAIJA_CANON.json` v1.0.0

---

## 1. Executive Summary

**Overall verdict:** **PASS WITH NOTES**

The 11 newly generated scripts (EP002–EP012) are tightly canon-aligned. Doubles, villain reveal schedule, character lock, beat structure, runtime, and Jabari's drum styling all check out. The single recurring tension is the use of patois in Web-Teller narration — a pattern inherited from user-approved EP001 — which one new script (EP010) extends explicitly into the narrator track. EP002, EP004, EP006 contain patois only inside quoted character dialogue, which is permitted by canon. All caption_patois fields use patois (permitted — captions are exempt per `OPAIJA_CANON.json` `patois_phrase_bank.usage_rule`).

| Canon rule | Result | Notes |
|---|---|---|
| 1. Doubles in every episode | PASS | 12 / 12 episodes have a doubles moment |
| 2. Visual style locks (chins, lips, nose, hair) | PASS | Visual notes explicitly enforce in EP002, EP003, EP004, EP008 |
| 3. Jabari's drums (wooden Kalinda, L-shaped sticks) | PASS | Correctly described in EP003, EP004, EP008, EP012; no modern kit anywhere |
| 4. Power system limits | PASS | No premature powers; Drum Sync first introduced EP004 ("first true"), Memory Sight EP005 (subtle), Silent Beat EP006, Silence Pulse felt EP004 then named EP007 |
| 5. Villain reveal schedule | PASS | Marius unseen EP002–EP006, back-only EP007, full face EP010, direct address EP012; Selah first appears EP008 |
| 6. "Enslaved Africans" not "slaves" | PASS | Zero occurrences of "slaves"/"slave"; EP011 origin retelling avoids the word entirely ("They thought they took every weapon...") |
| 7. Patois only in dialogue / captions, not narration | **PASS WITH NOTES** | EP010 narrator opens with "Some men doh want to win" — matches EP001's "Some sounds doh travel through air" pattern. See section 4. |
| 8. Runtime 60–90s, ideal 75s (130–170 words) | PASS | All 11 in 158–168-word range; EP002 75s, EP008 78s, EP010 75s, EP012 80s |
| 9. Web-Teller voice (mythic, rhythmic, standard English) | PASS | Voice is consistent and on-brand throughout |
| 10. Beat-map adherence (hook / conflict / reveal / escalation / cliffhanger) | PASS | All 5 beats hit in every script; frontmatter explicitly maps them |

---

## 2. Per-Episode Scorecard

| Episode | Doubles | Words | Patois (narration) | Beats hit | Villain compliance | Overall |
|---|---|---|---|---|---|---|
| EP001 | YES (Mother Lall, opening) | ~155 | "doh" in hook + L7 narration | 5/5 | n/a (no villain) | PASS (user-approved) |
| EP002 | YES (roadside stall) | 158 | clean (patois only in Nia quote L37) | 5/5 | n/a | PASS |
| EP003 | YES (eating across gayelle) | 158 | clean (no patois in narration) | 5/5 | n/a | PASS |
| EP004 | YES (bara/channa comedy beat) | 158 | clean (patois only in Nia quote L35) | 5/5 | Silence Pulse FELT only — compliant | PASS |
| EP005 | YES (Asha's vendor map) | 158 | clean | 5/5 | n/a | PASS |
| EP006 | YES (Tariq's first doubles) | 158 | clean (patois only in Tariq quote L43) | 5/5 | n/a | PASS |
| EP007 | YES (Mother Lall wraps it) | 168 | clean | 5/5 | Marius BACK-ONLY silhouette — compliant | PASS |
| EP008 | YES (eats Mother Lall's doubles before fight) | 159 | clean | 5/5 | Selah first appearance, watching only — compliant | PASS |
| EP009 | YES (alone with Mother Lall) | 162 | clean | 5/5 | Selah dialogue, no Marius — compliant | PASS |
| EP010 | YES (closed stalls = inverse doubles beat) | 168 | **"doh" in hook + narration L27** | 5/5 | Marius FULL FACE REVEAL — compliant | PASS WITH NOTE |
| EP011 | YES (Etienne brings doubles) | 158 | clean | 5/5 | Lore episode, no on-screen villain — compliant | PASS |
| EP012 | YES (six orders for the team) | 161 | clean | 5/5 | Marius full scene, Selah present — compliant | PASS |

---

## 3. Violations / Notes Found

### 3.1 Patois in narration (notes, not hard violations)

**EP010 narrator hook + opening line**
- File: `C:\Users\Banjo\Opaija\data\scripts\EP010-narrator-script.md:11` (frontmatter hook) and `:27` (narrator track)
- Rule potentially in tension: Rule 7 (`patois_phrase_bank.usage_rule`: "The Web-Teller narrator uses standard English with Caribbean rhythm.")
- Quoted offending text:
  > Line 11: `hook: "Some men doh want to win. They want to erase."`
  > Line 27: `Some men doh want to win. They want to erase.`
- Suggested fix (if treating EP001's `doh` as a bug):
  > `Some men don't want to win. They want to erase.`
- Suggested fix (if treating EP001's `doh` as a canonical Web-Teller signature): **leave as-is.** EP010 mirrors EP001's pattern exactly — single patois word `doh` only, in the opening hook line, for rhythmic punch.

### 3.2 Patois in caption_patois fields (NOT violations)

All 11 caption_patois strings (EP002–EP012) use patois ("Doh ask it twice", "Allyuh feel that", "Gyul serious", "Some gyul doh need to shout", etc.). Per `patois_phrase_bank.usage_rule` captions are permitted. No fixes required.

### 3.3 Patois in character dialogue (NOT violations)

- EP002 L37 — Nia: `"Doh sing it unless yuh mean it"` — her canon signature line
- EP004 L35 — Nia: `"Doh sing it unless yuh mean it"` — same signature
- EP006 L43 — Tariq: `"That doh mean allyuh own the whole sea"` — his canon signature
- EP003 frontmatter L16 — Malik (in doubles_moment description): `"He eating before training? Dotish."` — character dialogue beat

All four are explicit in-character quoted dialogue. Canon-clean.

### 3.4 Other rule sweeps

- **"slaves" search:** zero hits in any narrator script. EP011 handles the origin story by implication only ("They thought they took every weapon. They counted every blade. They missed the drum pegs..."). Correct.
- **Jabari's drums:** EP003 ("Wooden. African. The L-shaped sticks finding their old, old shape"), EP004 ("African wood. L-shaped strike"), EP008 ("Jabari raised the L-stick"), EP012 visual notes ("Jabari's wooden Kalinda drums with L-shaped sticks"). Compliant in every episode he appears.
- **Marius reveal cadence:** EP004 villain_presence "FELT", EP007 "SILHOUETTE" / back only, EP008 villain_presence is Selah (compliant — Marius still off-screen), EP010 villain_presence "FULL" / full face, EP012 direct address to Kai. Schedule honored.
- **Selah first appearance:** EP008 cliffhanger only ("In the back row, a girl watched"); never earlier. Compliant.
- **Powers used before unlocked:** none. Memory Sight is shown subtly first time in EP005 (canon allows). Drum Sync first true alignment in EP004 (canon allows). Silent Beat introduced with Tariq's arrival EP006 (canon allows).
- **Visual style locks:** EP002 visual notes explicitly call out "rounded chin, full lips, locs with red and gold wraps" for Kai. EP008 specifies "deep silver and midnight blue, pale-gold cuffs" for Selah matching her canon palette. No contradictions found.

---

## 4. The EP001 "doh" Question — Verdict

**The line:** `Some sounds doh travel through air. Some travel through blood.` (QUEUE.json line 25 / line 30 narrator_script field, repeated in EP010 as `Some men doh want to win`.)

**Strict reading:** `patois_phrase_bank.usage_rule` says "The Web-Teller narrator uses standard English with Caribbean rhythm." Under that rule, `doh` in narration is a violation.

**Practical reading:** EP001 is user-approved canon and the line is structurally exceptional — it's the very first words of the entire series, the Web-Teller's signature opener, designed for rhythmic impact. A single patois word (`doh`) deployed only at the hook beat, with the rest of the narration in standard English, reads as an intentional Caribbean cadence accent — not a creep of dialect into the whole narrator track. EP010 picked up that pattern faithfully: one `doh` in the hook, standard English everywhere else.

**Recommendation: TREAT AS CANONICAL WEB-TELLER SIGNATURE — but constrain it.**

Update the canon and the script-agent brief with an explicit rule:

> **Web-Teller patois exception:** The Web-Teller may use exactly one patois word — `doh` — and only in the episode's opening hook line, never elsewhere in the narration. This preserves the Caribbean rhythmic punch established by EP001 without diluting the standard-English narrator voice.

Under that rule:
- EP001 — compliant (user-approved canon, sets the precedent)
- EP010 — compliant (exactly one `doh` in the hook, nowhere else)
- EP002–EP009, EP011, EP012 — compliant (no patois in narration)

This is preferable to (a) editing EP001, which is locked, or (b) flagging EP010 as a bug when it correctly mirrored EP001. Codify the pattern; don't fight it.

---

## 5. Recommended Next Actions (Top 5, by Severity)

1. **[CANON UPDATE — P1]** Add the "Web-Teller patois exception" rule (see section 4) to `data/shared-memory/OPAIJA_CANON.json` under `patois_phrase_bank.usage_rule` and to `data/scripts/SCRIPT_AGENT_BRIEF.md` rule 7. This resolves the EP001 / EP010 ambiguity permanently and gives future episode agents a clear ceiling.

2. **[OPTIONAL POLISH — P3]** Decide whether the rule allows `doh` ONLY, or any single one-word patois flavor (e.g., `nah`, `wha`) at the hook. Recommend `doh` only — it's the established signature.

3. **[FRONTMATTER FIX — P3]** EP010 frontmatter L11 mirrors the narration `doh`; leave once exception rule is codified, otherwise rewrite to `Some men don't want to win.` (Same call as EP001's narrator field.)

4. **[NICE-TO-HAVE — P4]** Visual notes for EP005, EP006, EP007, EP009, EP010, EP011, EP012 don't explicitly restate "rounded chin / full lips / broad nose" face locks. Currently relies on character-sheet enforcement at render time. Consider adding a single line to `SCRIPT_AGENT_BRIEF.md` instructing future agents to put the face-lock reminder in at least one beat note per script — cheap insurance against generative-render drift.

5. **[VERIFICATION — P4]** Cross-check Asha's "Memory Sight" debut (EP005 narrator: "for one second her eyes went somewhere else. Memory Sight.") against character arc gating. Canon does not explicitly state Memory Sight is locked until EP005 — confirm with showrunner whether it's allowed to surface earlier (e.g., EP004 group dynamic) or whether EP005 is the locked first reveal. Currently treating as compliant.

---

**End of report. All 12 scripts cleared for production hand-off contingent on action item 1.**
