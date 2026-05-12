import { Composition, Folder } from "remotion";
import { OpaijaTeaser } from "./compositions/OpaijaTeaser";

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
    </Folder>
  );
};
