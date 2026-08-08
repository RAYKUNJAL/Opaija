import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type OpaijaTeaserProps = {
  title: string;
  subtitle: string;
  characterImage: string;
  audioPath?: string;
};

const gold = "#f3a712";
const orange = "#e85d04";
const cream = "#fff7e9";

function remotionPublicPath(value: string) {
  return value.replace(/^\\/+/, "").replace(/^public\\//, "");
}

export const OpaijaTeaser = ({ title, subtitle, characterImage, audioPath }: OpaijaTeaserProps) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const imageScale = interpolate(frame, [0, durationInFrames], [1.05, 1.19]);
  const titleY = interpolate(frame, [18, 70], [60, 0], { extrapolateRight: "clamp" });
  const pulse = interpolate(frame % 90, [0, 45, 90], [0.72, 1, 0.72]);

  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #050505 0%, #16100a 54%, #062120 100%)" }}>
      {audioPath ? <Audio src={staticFile(remotionPublicPath(audioPath))} /> : null}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 38%, rgba(232, 93, 4, 0.36), transparent 34%), radial-gradient(circle at 50% 72%, rgba(11, 111, 111, 0.28), transparent 31%)",
        }}
      />
      <Sequence from={0} durationInFrames={durationInFrames}>
        <Img
          src={staticFile(remotionPublicPath(characterImage))}
          style={{
            position: "absolute",
            left: -460,
            top: 305,
            width: 2000,
            height: 1125,
            objectFit: "cover",
            transform: `scale(${imageScale})`,
            filter: "saturate(1.08) contrast(1.04)",
            border: `4px solid rgba(243, 167, 18, ${pulse})`,
          }}
        />
      </Sequence>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,.35), transparent 34%, rgba(0,0,0,.86) 76%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 66,
          right: 66,
          top: 92,
          transform: `translateY(${titleY}px)`,
        }}
      >
        <div style={{ color: gold, fontSize: 104, fontWeight: 950, lineHeight: 0.9, letterSpacing: 0 }}>
          {title}
        </div>
        <div
          style={{
            width: 260,
            height: 8,
            marginTop: 30,
            background: `linear-gradient(90deg, ${orange}, ${gold})`,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 66,
          right: 66,
          bottom: 118,
          color: cream,
          fontSize: 54,
          fontWeight: 850,
          lineHeight: 1.08,
          letterSpacing: 0,
          textShadow: "0 8px 32px rgba(0,0,0,.68)",
        }}
      >
        {subtitle}
      </div>
      <div
        style={{
          position: "absolute",
          left: 66,
          right: 66,
          bottom: 58,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: gold,
          fontSize: 24,
          fontWeight: 800,
          textTransform: "uppercase",
        }}
      >
        <span>Rhythm. Roots. Resistance.</span>
        <span>This is Opaija.</span>
      </div>
    </AbsoluteFill>
  );
};
