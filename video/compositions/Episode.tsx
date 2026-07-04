import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useEffect, useMemo, useState } from "react";

// --- Types -----------------------------------------------------------------

export type EpisodeBeat = {
  idx: number;
  prompt: string;
  clipPath?: string;
  startSec: number;
  durSec: number;
  characters?: string[];
};

export type EpisodeManifest = {
  episodeId: string;
  aspectRatio: "9:16" | "16:9";
  runtimeSeconds: number;
  narrationPath?: string;
  alignmentPath?: string;
  beats: EpisodeBeat[];
};

export type AlignmentWord = { word: string; startMs: number; endMs: number };
export type AlignmentFile = { words: AlignmentWord[] };

export type EpisodeProps = {
  manifestPath?: string;
  manifest?: EpisodeManifest;
  alignment?: AlignmentFile;
};

// --- Caribbean palette (canon) --------------------------------------------

const AMBER_GOLD = "#E4A700";
const WARM_BROWN = "#7A4A2B";
const DEEP_BROWN = "#3B2415";
const CARNIVAL_RED = "#C6281E";
const SEA_TEAL = "#0E6B6B";
const SAND_BEIGE = "#E5D1A6";
const MIDNIGHT = "#0F0F10";

// --- Helpers ---------------------------------------------------------------

// === Bug-3 defensive === staticFile() resolves paths relative to the Remotion
// `public/` folder. Legacy manifests stored paths INCLUDING a "public/" prefix,
// which caused every staticFile lookup to 404. Strip the prefix defensively so
// both new and old manifests work.
const stripPublicPrefix = (p: string | undefined | null): string => {
  if (!p) return "";
  return p.replace(/^public[\\/]/, "");
};

const fetchJSON = async <T,>(path: string): Promise<T> => {
  const url = staticFile(stripPublicPrefix(path));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return (await res.json()) as T;
};

const pickActiveWords = (
  words: AlignmentWord[] | undefined,
  currentMs: number,
  windowSize = 2,
): string => {
  if (!words || words.length === 0) return "";
  // Find the word whose [startMs, endMs] contains currentMs
  let activeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (currentMs >= w.startMs && currentMs <= w.endMs) {
      activeIdx = i;
      break;
    }
    if (w.startMs > currentMs) {
      // we passed the active region; use previous if very close
      if (i > 0 && currentMs - words[i - 1].endMs < 120) activeIdx = i - 1;
      break;
    }
  }
  if (activeIdx === -1) return "";
  const start = Math.max(0, activeIdx - Math.floor((windowSize - 1) / 2));
  const slice = words.slice(start, start + windowSize);
  return slice.map((w) => w.word).join(" ").trim();
};

// --- Sub-components --------------------------------------------------------

const PlaceholderBeat = ({ prompt, idx }: { prompt: string; idx: number }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.06]);
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${DEEP_BROWN} 0%, ${WARM_BROWN} 55%, ${CARNIVAL_RED} 100%)`,
        transform: `scale(${scale})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
      }}
    >
      <div
        style={{
          color: SAND_BEIGE,
          fontSize: 44,
          fontWeight: 800,
          lineHeight: 1.2,
          textAlign: "center",
          textShadow: "0 6px 24px rgba(0,0,0,0.7)",
          maxWidth: "85%",
        }}
      >
        <div style={{ color: AMBER_GOLD, fontSize: 28, marginBottom: 16, letterSpacing: 4 }}>
          BEAT {String(idx).padStart(2, "0")}
        </div>
        {prompt}
      </div>
    </AbsoluteFill>
  );
};

const RhythmGlyphPulse = ({
  beatStartFrame,
  fps,
  size,
}: {
  beatStartFrame: number;
  fps: number;
  size: number;
}) => {
  const frame = useCurrentFrame();
  const rel = frame - beatStartFrame;
  // 200ms pulse window
  const pulseFrames = Math.round((200 / 1000) * fps);
  if (rel < 0 || rel > pulseFrames) return null;
  const t = rel / pulseFrames; // 0..1
  const scale = interpolate(t, [0, 1], [0.8, 1.4]);
  const opacity = interpolate(t, [0, 1], [0.9, 0]);
  const stroke = 8;
  const radius = size / 2 - stroke;
  return (
    <svg
      width={size}
      height={size}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        pointerEvents: "none",
      }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={AMBER_GOLD}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius * 0.55}
        fill="none"
        stroke={AMBER_GOLD}
        strokeWidth={stroke / 2}
        opacity={0.6}
      />
    </svg>
  );
};

const CaptionOverlay = ({
  alignment,
  vertical,
}: {
  alignment?: AlignmentFile;
  vertical: boolean;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;
  const text = useMemo(
    () => pickActiveWords(alignment?.words, currentMs, 2),
    [alignment, Math.floor(currentMs / 50)],
  );
  if (!text) return null;
  const fontSize = vertical ? 96 : 72;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: vertical ? "12%" : "10%",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          color: "#FFFFFF",
          fontSize,
          fontWeight: 900,
          letterSpacing: 1,
          textTransform: "uppercase",
          textAlign: "center",
          padding: "10px 28px",
          textShadow:
            "0 0 8px rgba(0,0,0,0.95), 0 6px 18px rgba(0,0,0,0.85), 0 0 22px rgba(228,167,0,0.35)",
          WebkitTextStroke: "2px rgba(0,0,0,0.85)",
          lineHeight: 1.05,
          maxWidth: "92%",
        }}
      >
        {text}
      </div>
    </div>
  );
};

const VignetteAndGrade = () => (
  <>
    {/* Warm Caribbean grade */}
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 45%, rgba(228,167,0,0.10), transparent 55%), linear-gradient(180deg, rgba(192,40,30,0.06) 0%, rgba(14,107,107,0.05) 100%)",
        mixBlendMode: "overlay",
        pointerEvents: "none",
      }}
    />
    {/* Vignette */}
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
        pointerEvents: "none",
      }}
    />
  </>
);

// --- Main composition ------------------------------------------------------

export const Episode = ({ manifestPath, manifest: inlineManifest, alignment: inlineAlignment }: EpisodeProps) => {
  const { fps, width, height } = useVideoConfig();
  const [manifest, setManifest] = useState<EpisodeManifest | undefined>(inlineManifest);
  const [alignment, setAlignment] = useState<AlignmentFile | undefined>(inlineAlignment);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (!inlineManifest && manifestPath) {
          const m = await fetchJSON<EpisodeManifest>(manifestPath);
          if (!cancelled) setManifest(m);
          if (m.alignmentPath && !inlineAlignment) {
            try {
              const a = await fetchJSON<AlignmentFile>(m.alignmentPath);
              if (!cancelled) setAlignment(a);
            } catch {
              // alignment optional
            }
          }
        } else if (inlineManifest?.alignmentPath && !inlineAlignment) {
          try {
            const a = await fetchJSON<AlignmentFile>(inlineManifest.alignmentPath);
            if (!cancelled) setAlignment(a);
          } catch {
            // optional
          }
        }
      } catch (e) {
        // swallow — placeholder will show
        // eslint-disable-next-line no-console
        console.error("Episode manifest load failed:", e);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [manifestPath, inlineManifest, inlineAlignment]);

  const vertical = height >= width;

  if (!manifest) {
    return (
      <AbsoluteFill style={{ background: MIDNIGHT, color: SAND_BEIGE, fontSize: 36, padding: 80 }}>
        Loading manifest...
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: MIDNIGHT }}>
      {/* Single narration spanning the whole composition */}
      {manifest.narrationPath ? <Audio src={staticFile(stripPublicPrefix(manifest.narrationPath))} /> : null}

      {/* Beats */}
      {manifest.beats.map((beat) => {
        const from = Math.round(beat.startSec * fps);
        const dur = Math.max(1, Math.round(beat.durSec * fps));
        return (
          <Sequence key={`beat-${beat.idx}`} from={from} durationInFrames={dur}>
            {beat.clipPath ? (
              <OffthreadVideo
                src={staticFile(stripPublicPrefix(beat.clipPath))}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
                muted
              />
            ) : (
              <PlaceholderBeat prompt={beat.prompt} idx={beat.idx} />
            )}
          </Sequence>
        );
      })}

      {/* Color grade + vignette */}
      <VignetteAndGrade />

      {/* Rhythm-glyph pulses at the start of each beat */}
      {manifest.beats.map((beat) => {
        const startFrame = Math.round(beat.startSec * fps);
        const pulseWindow = Math.round((200 / 1000) * fps) + 2;
        return (
          <Sequence
            key={`pulse-${beat.idx}`}
            from={startFrame}
            durationInFrames={pulseWindow}
          >
            <AbsoluteFill style={{ pointerEvents: "none" }}>
              <RhythmGlyphPulse
                beatStartFrame={0}
                fps={fps}
                size={vertical ? Math.round(width * 0.55) : Math.round(height * 0.55)}
              />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* TikTok-style captions */}
      <CaptionOverlay alignment={alignment} vertical={vertical} />
    </AbsoluteFill>
  );
};
