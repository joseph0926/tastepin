import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import { ChevronLeft, Pause, Play } from "lucide-react";
import { useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import { clips, formatTime, usePlayback, VideoScene } from "./VideoScene";
import "./Phone.css";

// params: preview(bubble | center | none), thickness(grow | fixed), apply(live | release)
// 영상 아래 탐색 막대를 끄는 동안의 표시를 비교한다. 막대를 직접 끌거나 화살표 키로 10초씩 옮길 수 있다.

const clip = clips[3];
const KEY_STEP_MS = 10_000;
// 시연에서 손잡이를 끄는 구간과 시간
const DEMO_FROM = 0.2;
const DEMO_TO = 0.62;
const DEMO_DRAG_MS = 900;

export default function VideoSeek({ params }: SpecimenProps) {
  const { preview, thickness, apply } = params;
  const playback = usePlayback(clip, clip.durationMs * DEMO_FROM);
  // 끄는 중인 위치. null이면 끌지 않는 중이다
  const [dragMs, setDragMs] = useState<number | null>(null);
  const [demoDrag, setDemoDrag] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const seconds = useSeconds();

  const msAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const share = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return share * clip.durationMs;
  };
  const release = (ms: number | null) => {
    if (ms !== null) playback.seek(ms);
    setDragMs(null);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragMs(msAt(event.clientX));
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragMs !== null) setDragMs(msAt(event.clientX));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: playback.positionMs - KEY_STEP_MS,
      ArrowRight: playback.positionMs + KEY_STEP_MS,
      Home: 0,
      End: clip.durationMs,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    playback.seek(moves[event.key]);
  };

  // 시연: 손잡이를 잡고 끌기, 놓기, 쉬기
  useDemo((tick) => {
    const step = tick % 3;
    if (step === 1) {
      playback.seek(clip.durationMs * DEMO_FROM);
      setDemoDrag((value) => value + 1);
    }
    if (step === 2) release(dragMs);
  });

  useEffect(() => {
    if (demoDrag === 0) return;
    let frame = 0;
    const startedAt = performance.now();
    const length = seconds(DEMO_DRAG_MS) * 1000;
    const step = (now: number) => {
      const share = Math.min(1, (now - startedAt) / Math.max(1, length));
      setDragMs(clip.durationMs * (DEMO_FROM + (DEMO_TO - DEMO_FROM) * share));
      if (share < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [demoDrag, seconds]);

  const dragging = dragMs !== null;
  const shownMs = dragMs ?? playback.positionMs;
  const sceneMs = dragging && apply === "live" ? dragMs : playback.positionMs;
  const share = `${(shownMs / clip.durationMs) * 100}%`;

  return (
    <div className="ph-frame">
      <div className="ph-head">
        <button type="button" className="ph-icon" aria-label="목록으로">
          <ChevronLeft size={20} strokeWidth={1.75} />
        </button>
        <h3>{clip.title}</h3>
      </div>
      <div className="ph-body vsk-body">
        <div className="vd-screen">
          <VideoScene clip={clip} positionMs={sceneMs} />
          {dragging && preview === "center" && (
            <div className="vsk-center" aria-hidden>
              <b>{formatTime(shownMs)}</b>
              <span>/ {formatTime(clip.durationMs)}</span>
            </div>
          )}
        </div>
        <div
          className="vsk-seek"
          data-thickness={thickness}
          data-dragging={dragging || undefined}
        >
          <div
            ref={trackRef}
            className="vsk-track"
            role="slider"
            tabIndex={0}
            aria-label="재생 위치"
            aria-valuemin={0}
            aria-valuemax={Math.round(clip.durationMs / 1000)}
            aria-valuenow={Math.round(shownMs / 1000)}
            aria-valuetext={`${formatTime(shownMs)} / ${formatTime(clip.durationMs)}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => release(dragMs)}
            onPointerCancel={() => setDragMs(null)}
            onKeyDown={onKeyDown}
          >
            <span className="vsk-rail">
              <span className="vsk-fill" style={{ width: share }} />
            </span>
            <span className="vsk-thumb" style={{ left: share }} />
            {dragging && preview === "bubble" && (
              <span className="vsk-bubble" style={{ left: share }} aria-hidden>
                {formatTime(shownMs)}
              </span>
            )}
          </div>
          <div className="vsk-row">
            <span className="vd-time">
              {formatTime(shownMs)} / {formatTime(clip.durationMs)}
            </span>
            <button
              type="button"
              className="ph-icon"
              aria-label={playback.playing ? "일시정지" : "재생"}
              onClick={() => playback.setPlaying(!playback.playing)}
            >
              {playback.playing ? (
                <Pause size={20} strokeWidth={1.75} />
              ) : (
                <Play size={20} strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
