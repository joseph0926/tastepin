import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
} from "react";

// 느리게 보기에서 모든 시편의 시간을 같은 배수로 늘린다. 시편은 ms 값을 직접 쓰지 않고 seconds()로 바꾼다
export const SpeedContext = createContext(1);

// 같이 재생을 누를 때마다 1씩 오른다. 시편은 값이 바뀔 때 다음 시연 동작을 한 번 한다
export const DemoContext = createContext(0);

export const EASE_OUT = [0.2, 0, 0, 1] as const;

// 전역 시편 '모션 성격'에서 고른 곡선(ease-out-cubic). 2026-10-19 이후 시편은 비교하지 않는 곡선으로 이 값을 쓴다
export const EASE_OUT_CUBIC = [0.215, 0.61, 0.355, 1] as const;

export function useSeconds() {
  const speed = useContext(SpeedContext);
  return useCallback((ms: number) => (ms * speed) / 1000, [speed]);
}

export function useDemo(step: (tick: number) => void) {
  const tick = useContext(DemoContext);
  const onTick = useEffectEvent(step);

  useEffect(() => {
    if (tick > 0) onTick(tick);
  }, [tick]);
}
