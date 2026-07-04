# OPAIJA — Midjourney Background Reference Generation

Use Midjourney V8.1 in Discord or web (`midjourney.com`) to generate the 12 canonical scene backgrounds. Save each to `C:\Users\Banjo\Opaija\public\assets\backgrounds\` with the EXACT filename listed.

---

## Critical setup — do this FIRST (one-time, 2 minutes)

Before generating any background, lock the OPAIJA art style as a reusable Style Reference (`--sref`):

1. **Upload your Kai sheet to Midjourney** — drag `C:\Users\Banjo\Opaija\public\assets\characters\kairo-kai-baptiste.png` into a Discord DM with the Midjourney bot, OR upload via the Reference panel on midjourney.com.
2. **Get the image URL** — right-click the uploaded image → "Copy Link" (Discord) or click the image to open it and copy the URL from the address bar.
3. **Save that URL** somewhere — you'll paste it after every prompt as `--sref <url>`. This locks every background to your OPAIJA aesthetic.

**Alternative**: instead of `--sref <url>`, you can use `--sref random` for random-but-consistent style (less precise) or `--sref <numeric_id>` if you've created a Style Pack.

---

## Universal prompt suffix (append to EVERY prompt below)

```
--ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human, kid, child --chaos 0 --sref <YOUR_KAI_URL_HERE>
```

**What each flag does:**
- `--ar 9:16` — vertical aspect ratio matching OPAIJA shorts format
- `--v 8.1` — latest model (4-5× faster than V7, better detail)
- `--style raw` — less Midjourney-default stylization, more faithful to your prompt
- `--no people, characters, …` — keep humans OUT of backgrounds (we composite character refs in via Seedance later)
- `--chaos 0` — minimum variation, maximum canon-consistency across the 4 generated tiles
- `--sref <url>` — STYLE LOCK. Forces the OPAIJA Caribbean Glyph-Cel 2.5D painterly aesthetic on every gen
- *Optional*: add `--ow 60` if using Omni-Reference for additional anchoring

**Optional flag:**
- `--sw 100` — style weight (0-1000, default 100). Bump higher (`--sw 500`) if backgrounds aren't matching style strongly enough.

---

## 1. Old Gayelle Ground — East Trinidad (DAWN)
**Save as:** `gayelle-east-trinidad-dawn.png`

```
old gayelle stick-fighting arena east Trinidad at dawn, packed red earth ring 20 feet across, weathered wooden fence posts, tall sugarcane grass swaying in morning breeze, hazy rolling hills with palm tree silhouettes, golden hour sunlight cutting through dust motes, long shadows across the empty ring, painterly Caribbean Glyph-Cel 2.5D anime style, warm earth-tone palette, cinematic depth, hand-drawn aesthetic --ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human --chaos 0 --sref <YOUR_KAI_URL>
```

---

## 2. Mother Lall's Doubles Stall (DAY)
**Save as:** `mother-lall-doubles-stall.png`

```
Trinidad street-side doubles vendor stall mid-morning, weathered wooden cart with bright striped umbrella in red yellow orange, stainless steel pans of curried channa, stacks of folded bara wrapped in food paper, hand-painted sign reading "LALL'S DOUBLES" with OPAIJA star symbol, jars of pepper sauce and tamarind chutney, gingerbread architecture buildings in background with palm trees and distant sea, warm welcoming morning light, painterly Caribbean anime style --ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human --chaos 0 --sref <YOUR_KAI_URL>
```

---

## 3. Community Gayelle (AFTERNOON)
**Save as:** `gayelle-community-afternoon.png`

```
community gayelle stick-fighting ring Trinidad afternoon, packed earth ring with white-painted boundary, empty wooden bleachers around the circumference, Trinidadian flags hanging from poles, strong afternoon sun overhead with humidity haze, palm shadows stretching across the ring, distant Trinidad town gingerbread architecture and church steeple, hot afternoon palette warm yellow sienna deep orange slate blue sky, painterly Caribbean anime style --ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human --chaos 0 --sref <YOUR_KAI_URL>
```

---

## 4. Nia's Family Yard (EVENING)
**Save as:** `nia-family-yard-evening.png`

```
Trinidadian family yard at golden-hour evening, modest single-story wooden gingerbread house with intricate teal and cream fretwork trim, mango tree dominating foreground with hanging fruit, hand-woven hammock strung between posts, small altar with cowries and indigo cloth, traditional iron bell hanging from low branch, sunset sky in oranges and deep indigo, distant Trinidad hills, fireflies appearing, intimate quiet sunset palette deep indigo gold teal cream, painterly Caribbean anime style --ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human --chaos 0 --sref <YOUR_KAI_URL>
```

---

## 5. Tobago Coastline (DUSK)
**Save as:** `tobago-coast-dusk.png`

```
Tobago coastal scene at dusk, dark teal sea meeting pale shore, gentle waves with scattered driftwood and shells, limestone cliffs with sea grass and small palms, wooden fishing pier extending into water, distant fishing boat silhouettes against fading sunset, sky in deep blue with coral pink and pale gold streaks, empty patient watchful sea, painterly Caribbean anime style, deep teal ocean navy coral pink shell white palette --ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human, boats with people --chaos 0 --sref <YOUR_KAI_URL>
```

---

## 6. Asha's Archive Room (LATE AFTERNOON)
**Save as:** `asha-archive-room.png`

```
Trinidad gingerbread house study room late afternoon, wooden desk covered in old sepia photographs and hand-drawn maps of Trinidad, leather-bound notebooks with margin sketches, bookshelves with bound archives and old newspapers tied with twine, brass kerosene lamp glowing softly, photograph dated 1885 pinned to corkboard, marigold flowers in clay vase, teal headscarf draped over chair, late afternoon light through louvered shutters with dust motes, indo-Caribbean palette teal saffron copper sepia cream, painterly anime style --ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human --chaos 0 --sref <YOUR_KAI_URL>
```

---

## 7. Hilltop Overlooking Port of Spain (NIGHT)
**Save as:** `hilltop-port-of-spain-night.png`

```
hilltop overlooking Port of Spain Trinidad at night, distant city lights twinkling in the harbor, anchored boats visible, mountains framing the bay, foreground rocky outcrop with sparse hardy grass, single weathered ceremonial drum sitting on flat stone, deep midnight blue sky with scattered clouds and faint moonlight, ominous quiet watchful atmosphere, cold villain palette deep midnight blue near-black silver faint gold city lights, painterly Caribbean anime style --ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human, silhouette --chaos 0 --sref <YOUR_KAI_URL>
```

---

## 8. Carnival Masquerade Street (NIGHT)
**Save as:** `carnival-masquerade-street.png`

```
Trinidad Carnival street scene at night, empty cobblestone street lined with colorful wooden stalls, abandoned masquerade costumes draped on fences (Pierrot Grenade Jab Jab Moko Jumbie), strings of bulb-lights swaying overhead between gingerbread buildings, discarded feathers beads confetti on the ground, distant glow of bonfires with smoke drifting upward, evidence of celebration just ended, Canboulay tradition atmosphere, carnival palette carnival red gold deep purple midnight blue white string lights, painterly Caribbean anime style --ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human --chaos 0 --sref <YOUR_KAI_URL>
```

---

## 9. Public Music Event Stage (NIGHT)
**Save as:** `public-music-event-stage.png`

```
outdoor Trinidad community music event stage at night, wooden stage platform with bunting in red gold green, banner reading "RHYTHM ROOTS RESISTANCE" tagline, empty microphone stand center stage, traditional African Kalinda drums to one side with L-shaped curved drumsticks, iron bell on small table, string lights overhead, bonfire pits glowing in wings with smoke rising, empty audience plaza foreground, distant Trinidad town and hills, faint moon, anticipation before the storm atmosphere, warm festival palette gold deep red midnight blue fire orange, painterly Caribbean anime style --ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human --chaos 0 --sref <YOUR_KAI_URL>
```

---

## 10. Drum Circle / Training Ground (DAY)
**Save as:** `drum-circle-training-ground.png`

```
Trinidad outdoor drum circle and fighter training ground late morning, half-moon arrangement of weathered traditional African Kalinda wooden drums with L-shaped curved drumsticks resting beside each, woven straw practice mats on packed earth, training sticks bois leaning against low wall, Trinidad jungle and cane field backdrop, dappled sunlight through tropical foliage, bright tropical sky, community gathering space atmosphere, warm earth and green palette sienna gold deep green sky blue, painterly Caribbean anime style --ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human, drummer, fighter --chaos 0 --sref <YOUR_KAI_URL>
```

---

## 11. Official Gayelle Arena (EVENING)
**Save as:** `gayelle-official-evening.png`

```
official formal stick-fighting gayelle arena at evening, raised wooden platform stage with 30-foot ring and painted boundary, tiered wooden bleacher seating around three sides, ceremonial banners hanging from poles (Trinidadian flag and OPAIJA crest), low judge's table with iron bell and ceremonial bois, floodlights on poles switching on as twilight falls, distant Port of Spain skyline, deep blue evening sky, ceremonial weighty atmosphere, palette deep red gold midnight blue warm wood white painted lines, painterly Caribbean anime style --ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human, fighter --chaos 0 --sref <YOUR_KAI_URL>
```

---

## 12. Roadside Doubles Vendor at Dusk (Web-Teller atmosphere)
**Save as:** `roadside-doubles-dusk.png`

```
quiet Trinidad roadside doubles vendor at dusk, worn wooden cart with single hanging kerosene lamp casting warm yellow glow, folded paper-wrapped doubles stacked neatly, empty wooden bench in foreground, palm trees swaying in distance, ocean horizon visible between buildings, sunset sky deep oranges fading to indigo, long shadows stretching across road, mosquitoes hovering in lamp light, faint smoke from nearby cooking fire, mythic stillness atmosphere, twilight palette deep orange indigo warm yellow lamp glow charcoal silhouettes, painterly Caribbean anime style --ar 9:16 --v 8.1 --style raw --no people, characters, person, figure, human, vendor --chaos 0 --sref <YOUR_KAI_URL>
```

---

## Workflow

1. **One-time setup**: Upload `kairo-kai-baptiste.png` to MJ → copy URL → keep handy.
2. For each background:
   - Replace `<YOUR_KAI_URL>` with the actual URL
   - Paste prompt into `/imagine` in Discord OR web
   - Wait ~30s for the 4-tile grid to generate
   - Pick the best variant → click `U1`/`U2`/`U3`/`U4` to upscale
   - Click the upscaled image → "Save Image" → save to `public/assets/backgrounds/` with the canonical filename (single `.png`, no `.png.png`)
3. **Don't worry about perfect first try** — MJ generates 4 variants per call. If none nail it, hit the `🔄` re-roll button or adjust prompt slightly.

## Cost

- Each `/imagine` call = 1 fast GPU minute (Standard plan = 15 fast hours/mo = ~900 generations)
- Plus 1 minute for upscale
- 12 backgrounds × ~2-3 attempts each × 2 minutes = **~60 minutes of fast GPU**
- Well within the **$30/mo Standard tier** allocation
- If you hit the fast cap, you can use **Relax mode** (slower but unlimited at Standard tier+)

## After all 12 are saved

Tell me **"backgrounds ready"** and I'll dispatch the agent to wire them into the pipeline:
1. Map each beat's `location:` field to its background filename
2. Update `scripts/produce.ts` stagePrompts to load `backgrounds/<location>.png` as second reference
3. Update `server/seedance.ts` to either pass two ref images OR pre-composite character-over-background via `sharp` before submitting to fal.ai
4. Re-render EP002 with locked characters AND locked backgrounds — this should finally kill the style drift problem entirely

---

## Bonus: Style-locking everything in OPAIJA's universe

Once you have the `--sref <kai-url>` workflow nailed, use the SAME `--sref` for:
- All future character generations (drag `--sref` URL after the character description = guaranteed visual consistency with existing cast)
- Promotional posters (campaign art for new episode releases)
- Merch art (shirt designs, sticker packs, enamel pins)
- Social media post images (Instagram square posts, Twitter banners)
- The opaija.com website hero art

The `--sref` is OPAIJA's brand DNA in URL form. Treat it like a logo — never change it once locked.

---

*Generated 2026-05-15. Update if your `--sref` Kai URL changes (re-upload to refresh).*
