# OPAIJA Book Engine for Amazon KDP

## Goal

Every Opaija episode should produce reusable artwork that can become:

- Full-color episode comics
- Manga-style black-and-white chapters
- Coloring books and activity pages
- Narrated storybooks
- Collector artbooks and pitch-book excerpts

Amazon KDP is the default print and distribution target.

## Source-of-Truth Workflow

1. Episode script locks.
2. Shot list and Seedance prompts lock.
3. Approved character sheets, props, backgrounds, keyframes, captions, and narration are archived into an episode asset packet.
4. Book Engine converts the same packet into page plans, panel scripts, page prompts, and KDP specs.
5. OpenAI Style Brain checks all prompts against `ops/memory/opaija-style-god-memory.json`.
6. Paperclip Publisher prepares KDP interior PDF and cover PDF manifests.
7. Franchise Ops exports social previews, sample pages, merch tie-ins, and KDP upload checklist.

## Default KDP Product Presets

| Product | Trim | Bleed Page Size | Interior |
|---|---:|---:|---|
| Episode comic / manga | 6.625 x 10.25 in | 6.75 x 10.5 in | Premium color or black-and-white |
| Coloring book | 8.5 x 11 in | 8.625 x 11.25 in | Black-and-white white paper |
| Storybook | 8.5 x 8.5 in | 8.625 x 8.75 in | Premium color |
| Artbook | 8.5 x 11 in | 8.625 x 11.25 in | Premium color |

## KDP Guardrails

Current KDP guidance says paperback projects need two files: an interior manuscript and a cover file. KDP accepts cover PDFs, and print interiors should be sized correctly for trim, bleed, and margins.

For full bleed interiors, KDP says to format the PDF manuscript `0.25"` higher and `0.125"` wider than the selected trim size. Covers always need bleed and should be generated from the KDP cover calculator/template because spine width depends on trim, paper, ink, binding, and page count.

KDP’s current minimum gutter margins increase by page count:

| Page count | Inside gutter | Outside no bleed | Outside with bleed |
|---:|---:|---:|---:|
| 24-150 | 0.375 in | at least 0.25 in | at least 0.375 in |
| 151-300 | 0.5 in | at least 0.25 in | at least 0.375 in |
| 301-500 | 0.625 in | at least 0.25 in | at least 0.375 in |
| 501-700 | 0.75 in | at least 0.25 in | at least 0.375 in |
| 701-828 | 0.875 in | at least 0.25 in | at least 0.375 in |

## Book Packet Output

Each packet should produce:

- `asset-manifest.json`
- `page-plan.md`
- `panel-script.md`
- `art-prompts.md`
- `dialogue-and-captions.md`
- `kdp-spec.json`
- `cover-brief.md`
- `export-checklist.md`

## First Commercial Targets

1. Pilot 4-page teaser comic
2. Kai character coloring page
3. Mother Lall doubles activity page
4. Tariq Tobago coast coloring page
5. 24-page Opaija Season 1 coloring book
6. 32-page collector character artbook

## Official References

- [KDP Format Your Paperback](https://kdp.amazon.com/en_US/help/topic/G201834190)
- [KDP Set Trim Size, Bleed, and Margins](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6/)
- [KDP Paperback Submission Guidelines](https://kdp.amazon.com/help/topic/G201857950)
