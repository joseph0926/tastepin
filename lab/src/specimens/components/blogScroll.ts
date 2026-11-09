import { useEffect, useRef, type RefObject } from "react";
import {
  animate,
  useReducedMotion,
  type AnimationPlaybackControls,
} from "motion/react";
import { EASE_OUT_CUBIC, useSeconds } from "../stage";

// 시연 스크롤은 느리게 보기와 저감 설정을 따르고, 사람이 조작하면 즉시 멈춘다.
export function useSpecimenScroll(ref: RefObject<HTMLDivElement | null>) {
  const animation = useRef<AnimationPlaybackControls | null>(null);
  const seconds = useSeconds();
  const reduced = useReducedMotion();
  useEffect(() => () => animation.current?.stop(), []);

  const stop = () => {
    animation.current?.stop();
    animation.current = null;
  };
  const move = (top: number) => {
    const box = ref.current;
    if (!box) return;
    stop();
    const destination = Math.max(
      0,
      Math.min(top, box.scrollHeight - box.clientHeight),
    );
    if (reduced) box.scrollTop = destination;
    else
      animation.current = animate(box.scrollTop, destination, {
        duration: seconds(700),
        ease: EASE_OUT_CUBIC,
        onUpdate: (value) => {
          box.scrollTop = value;
        },
      });
  };
  return { move, stop };
}
