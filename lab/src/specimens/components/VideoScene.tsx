import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import "./Video.css";

// 동영상 시편이 함께 쓰는 가짜 영상. 공개 저장소라 실제 영상 대신 재생 위치에 따라 바뀌는 그림을 그린다.
// 색은 채도를 낮춘 두 톤이고, 해가 재생 위치만큼 왼쪽에서 오른쪽으로 지나가 위치가 바뀐 것을 눈으로 알 수 있다.

export interface Clip {
  id: string;
  title: string;
  durationMs: number;
  // 장면의 바탕 색상(hue). 영상마다 다르게 둬 목록에서 구분되게 한다
  hue: number;
}

export const clips: Clip[] = [
  {
    id: "harbor",
    title: "항구의 아침, 배가 들어오는 시간",
    durationMs: 45 * 60_000,
    hue: 205,
  },
  {
    id: "forest",
    title: "숲길 걷기 3편",
    durationMs: 28 * 60_000 + 30_000,
    hue: 140,
  },
  {
    id: "market",
    title: "야시장 기록",
    durationMs: 12 * 60_000 + 5_000,
    hue: 25,
  },
  {
    id: "snow",
    title: "눈 내리는 산장에서 보낸 이틀",
    durationMs: 1 * 3_600_000 + 52 * 60_000,
    hue: 220,
  },
  {
    id: "desert",
    title: "사막 횡단 마지막 날",
    durationMs: 33 * 60_000,
    hue: 40,
  },
  {
    id: "river",
    title: "강변 자전거",
    durationMs: 8 * 60_000 + 40_000,
    hue: 175,
  },
];

export function formatTime(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

export function VideoScene({
  clip,
  positionMs,
  className,
}: {
  clip: Clip;
  positionMs: number;
  className?: string;
}) {
  const progress = Math.min(1, Math.max(0, positionMs / clip.durationMs));
  const style = {
    "--vd-hue": clip.hue,
    "--vd-sun-x": `${8 + progress * 84}%`,
    "--vd-sun-y": `${40 - Math.sin(progress * Math.PI) * 22}%`,
  } as CSSProperties;
  return (
    <div className={`vd-scene ${className ?? ""}`} style={style} aria-hidden>
      <span className="vd-sun" />
      <span className="vd-ground" />
    </div>
  );
}

// 재생 위치를 실제 시간으로 흘린다. 느리게 보기는 조작의 움직임만 늘리고 영상 시간은 늘리지 않는다
export function usePlayback(
  clip: Clip,
  initialMs = 0,
  initiallyPlaying = false,
) {
  const [positionMs, setPositionMs] = useState(initialMs);
  const [playing, setPlaying] = useState(initiallyPlaying);
  // 프레임마다 다음 위치를 계산하려고 렌더와 별도로 지금 위치를 들고 있는다
  const positionRef = useRef(initialMs);

  const seek = useCallback(
    (ms: number) => {
      const next = Math.min(clip.durationMs, Math.max(0, ms));
      positionRef.current = next;
      setPositionMs(next);
    },
    [clip.durationMs],
  );

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last: number | null = null;
    const step = (now: number) => {
      const next = positionRef.current + (last === null ? 0 : now - last);
      last = now;
      if (next >= clip.durationMs) {
        seek(clip.durationMs);
        setPlaying(false);
        return;
      }
      seek(next);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, clip.durationMs, seek]);

  return { positionMs, playing, setPlaying, seek };
}
