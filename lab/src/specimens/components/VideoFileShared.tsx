import { useEffect, useRef } from "react";
import { ChevronLeft, Pause, Play } from "lucide-react";
import {
  clips,
  formatTime,
  usePlayback,
  VideoScene,
  type Clip,
} from "./VideoScene";
import "./Phone.css";
import "./VideoLibrary.css";

// OS의 파일 창은 기기마다 달라 예시 파일 목록으로 대체한다. 실제 파일에는 접근하지 않는다.
export function VideoFilePicker({
  onSelect,
  onCancel,
}: {
  onSelect: (clip: Clip) => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <section className="vlib-layer" aria-label="영상 파일 선택">
      <div className="ph-head">
        <h3>영상 파일 선택</h3>
        <button
          ref={cancelRef}
          type="button"
          className="ph-text-button"
          onClick={onCancel}
        >
          취소
        </button>
      </div>
      <div className="ph-body">
        <p className="vlib-description">내 기기 / 여행</p>
        <ul className="vlib-list">
          {clips.slice(0, 3).map((clip) => (
            <li key={clip.id}>
              <button
                type="button"
                className="vrs-row"
                onClick={() => onSelect(clip)}
              >
                <VideoScene clip={clip} positionMs={0} className="vrs-thumb" />
                <span className="vrs-text">
                  <b>{clip.title}.mp4</b>
                  <span>{formatTime(clip.durationMs)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// 재생과 위치 이동은 예시 영상으로 시연하고, 목록으로 돌아갈 때 현재 위치를 전달한다.
export function VideoLibraryPlayer({
  clip,
  savedMs = 0,
  onClose,
}: {
  clip: Clip;
  savedMs?: number;
  onClose: (positionMs: number) => void;
}) {
  const playback = usePlayback(clip, savedMs, true);
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => backRef.current?.focus(), []);
  return (
    <section className="vlib-layer" aria-label={`${clip.title} 재생`}>
      <div className="ph-head">
        <button
          ref={backRef}
          type="button"
          className="ph-icon"
          aria-label="목록으로"
          onClick={() => onClose(playback.positionMs)}
        >
          <ChevronLeft size={20} />
        </button>
        <h3>{clip.title}</h3>
      </div>
      <div className="ph-body">
        <div className="vd-screen">
          <VideoScene clip={clip} positionMs={playback.positionMs} />
        </div>
        <div className="vlib-controls">
          <input
            type="range"
            aria-label="재생 위치"
            min={0}
            max={clip.durationMs}
            step={1000}
            value={playback.positionMs}
            aria-valuetext={formatTime(playback.positionMs)}
            onChange={(event) => playback.seek(Number(event.target.value))}
          />
          <div className="vlib-actions">
            <span className="vd-time">
              {formatTime(playback.positionMs)} / {formatTime(clip.durationMs)}
            </span>
            <button
              type="button"
              className="ph-icon"
              aria-label={playback.playing ? "일시정지" : "재생"}
              onClick={() => playback.setPlaying(!playback.playing)}
            >
              {playback.playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
