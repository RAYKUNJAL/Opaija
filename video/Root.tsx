import { Composition, Folder, staticFile } from "remotion";
import { OpaijaTeaser } from "./compositions/OpaijaTeaser";
import { Episode, EpisodeManifest, EpisodeProps } from "./compositions/Episode";
import * as fs from "node:fs";
import * as path from "node:path";

const FPS = 30;

// calculateMetadata runs in Node at render time. It reads the manifest from
// public/<manifestPath> (or accepts an inline manifest) and returns the right
// durationInFrames. Falls back to 30s if anything goes wrong.
const episodeMetadata =
  ({ defaultWidth, defaultHeight }: { defaultWidth: number; defaultHeight: number }) =>
  async ({ props }: { props: EpisodeProps }) => {
    let runtimeSeconds = 30;
    try {
      let manifest: EpisodeManifest | undefined = props.manifest;
      if (!manifest && props.manifestPath) {
        // Resolve against the Remotion `public/` folder (where staticFile points)
        // === Bug-3 === manifestPath is RELATIVE TO public/ (post-fix).
        // Tolerate the legacy "public/..." prefix.
        const publicDir = path.resolve(process.cwd(), "public");
        const cleaned = props.manifestPath.replace(/^public[\\/]/, "");
        const abs = path.resolve(publicDir, cleaned);
        const raw = fs.readFileSync(abs, "utf-8");
        manifest = JSON.parse(raw) as EpisodeManifest;
      }
      if (manifest?.runtimeSeconds && Number.isFinite(manifest.runtimeSeconds)) {
        runtimeSeconds = manifest.runtimeSeconds;
      } else if (manifest?.beats?.length) {
        const last = manifest.beats[manifest.beats.length - 1];
        runtimeSeconds = (last.startSec ?? 0) + (last.durSec ?? 0);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("calculateMetadata: failed to read manifest, using 30s default:", e);
    }
    return {
      durationInFrames: Math.max(1, Math.round(runtimeSeconds * FPS)),
      fps: FPS,
      width: defaultWidth,
      height: defaultHeight,
    };
  };

const defaultEpisodeProps: EpisodeProps = {
  manifestPath: "episodes/EP002/manifest.json",
};

export const RemotionRoot = () => {
  return (
    <Folder name="Opaija">
      <Composition
        id="OpaijaTeaser"
        component={OpaijaTeaser}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          title: "OPAIJA",
          subtitle: "Every Island Has a Warrior. Every Rhythm Has a Weapon.",
          characterImage: "assets/characters/kairo-kai-baptiste.png",
          audioPath: "",
        }}
      />

      <Composition
        id="EpisodeVertical"
        component={Episode}
        durationInFrames={75 * FPS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={defaultEpisodeProps}
        calculateMetadata={episodeMetadata({ defaultWidth: 1080, defaultHeight: 1920 })}
      />

      <Composition
        id="EpisodeHorizontal"
        component={Episode}
        durationInFrames={75 * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={defaultEpisodeProps}
        calculateMetadata={episodeMetadata({ defaultWidth: 1920, defaultHeight: 1080 })}
      />
    </Folder>
  );
};
