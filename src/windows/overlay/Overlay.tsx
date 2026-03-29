import { AnimationPlayer } from "./AnimationPlayer";
import { ProgressText } from "./ProgressText";

type Props = {
  animationName: string;
  progressText: string;
};

export function Overlay({ animationName, progressText }: Props) {
  return (
    <div className="overlay-container" data-tauri-drag-region>
      <AnimationPlayer name={animationName} />
      <ProgressText text={progressText} />
    </div>
  );
}
