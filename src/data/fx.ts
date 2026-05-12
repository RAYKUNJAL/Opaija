import { Flame, Gauge, Spline, Sparkles, Zap } from "lucide-react";

export const fxAgents = [
  {
    name: "Anime Action Art Director",
    role: "Sets the visual standard for action poses, manga speed lines, impact frames, and readable combat silhouettes.",
    owns: ["pose language", "impact-frame rules", "manga action panels", "hero action references"],
    icon: Flame,
  },
  {
    name: "Cinematic FX Director",
    role: "Designs power effects, impact frames, particles, shockwaves, glow language, and camera energy.",
    owns: ["effect bible", "Seedance FX prompts", "impact frame style", "power readability"],
    icon: Sparkles,
  },
  {
    name: "Action Choreographer",
    role: "Builds kung-fu/staff-fighting inspired beats, camera moves, spacing, anticipation, contact, and recovery.",
    owns: ["fight thumbnails", "shot rhythm", "staff arcs", "pose transitions", "stunt continuity"],
    icon: Zap,
  },
  {
    name: "Weapon Pose Coach",
    role: "Designs safe comic-book weapon pose packets for bois, staffs, batons, drums, scarves, and training guards.",
    owns: ["guard positions", "strike paths", "defense poses", "recovery poses"],
    icon: Gauge,
  },
  {
    name: "Compositing Supervisor",
    role: "Keeps special effects mixed into the Opaija style without covering faces, props, or story beats.",
    owns: ["layer order", "color grade", "motion blur rules", "Remotion composite passes"],
    icon: Spline,
  },
  {
    name: "Reference Rights Curator",
    role: "Keeps action training based on owned artwork, public-domain study, original choreography notes, and properly licensed references.",
    owns: ["reference log", "copyright guardrails", "training notes", "approval checklist"],
    icon: Spline,
  },
];

export const fxPillars = [
  {
    name: "Pulse Energy",
    visual: "gold/orange rhythm rings, sigil sparks, drumwave ripples, controlled glow",
    use: "Kai, Jabari, Mother Lall, gayelle awakenings",
  },
  {
    name: "Voice/Lavway Command",
    visual: "gold script ribbons, soundwave arcs, breath-light particles, bell pulses",
    use: "Nia and chantwell moments",
  },
  {
    name: "Rootbreaker Force",
    visual: "red-black percussion cracks, heavy impact smears, vibration fractures",
    use: "Malik and rival action beats",
  },
  {
    name: "Memory Echo",
    visual: "teal/gold ghost frames, map-line overlays, paper-sigil trails",
    use: "Asha, archives, ancestral memory reveals",
  },
  {
    name: "Tidewatch Motion",
    visual: "sea-teal arcs, water flecks, wind cloth trails, coastal dust",
    use: "Tariq and Tobago expansion scenes",
  },
];

export const actionSceneStandard = [
  "Every action shot needs a readable silhouette before effects are added.",
  "Effects should amplify rhythm and power, not hide face, weapon, hands, or body mechanics.",
  "Use anime timing: anticipation, smear/impact, hold frame, recovery, reaction.",
  "Use kung-fu, staff, pole, Kalinda, and stick-fighting principles as movement vocabulary, then make original Opaija choreography.",
  "Do not scrape or train on copyrighted movie footage without rights; log every external reference source before it enters the prompt library.",
  "Seedance prompts should specify camera lens, action path, power layer, and what must remain on-model.",
  "Remotion should handle final speed ramps, captions, light hits, camera shake, overlays, and cut timing.",
];

export const fxMetrics = [
  { label: "FX Pillars", value: "5", detail: "power systems with visual rules" },
  { label: "Action Agents", value: "5", detail: "art, choreography, weapons, composite, rights" },
  { label: "Shot Rule", value: "pose first", detail: "silhouette before spectacle" },
  { label: "Finish Layer", value: "Remotion", detail: "speed ramps, captions, final glow" },
];

export const fxIcons = { Flame, Gauge };
