import { useEffect, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { clips, formatTime, VideoScene, type Clip } from "./VideoScene";
import { VideoFilePicker, VideoLibraryPlayer } from "./VideoFileShared";

// params: entry(center | header), after(direct | review)
type Phase =
  | { kind: "home" }
  | { kind: "picking" }
  | { kind: "review" | "playing"; clip: Clip };

export default function VideoFile({ params }: SpecimenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "home" });
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (phase.kind === "home") triggerRef.current?.focus();
  }, [phase.kind]);
  const home = () => {
    setPhase({ kind: "home" });
  };
  const select = (clip: Clip) =>
    setPhase({ kind: params.after === "review" ? "review" : "playing", clip });
  useDemo((tick) => {
    const step = tick % 5;
    if (step === 1) setPhase({ kind: "picking" });
    if (step === 2) select(clips[0]);
    if (step === 3 && phase.kind === "review")
      setPhase({ kind: "playing", clip: phase.clip });
    if (step === 0) home();
  });
  const layered = phase.kind === "picking" || phase.kind === "playing";
  const openButton = (
    <button
      ref={triggerRef}
      type="button"
      className={
        params.entry === "header" ? "ph-text-button" : "ph-button is-primary"
      }
      onClick={() => setPhase({ kind: "picking" })}
    >
      파일 선택
    </button>
  );
  return (
    <div className="ph-frame">
      <div className="vlib-base" inert={layered}>
        <div className="ph-head">
          <h3>동영상</h3>
          {params.entry === "header" && openButton}
        </div>
        <div className="ph-body">
          {phase.kind === "review" ? (
            <div className="vlib-empty">
              <div className="vd-screen">
                <VideoScene clip={phase.clip} positionMs={0} />
              </div>
              <b>{phase.clip.title}.mp4</b>
              <span className="vd-time">
                {formatTime(phase.clip.durationMs)}
              </span>
              <button
                type="button"
                className="ph-button is-primary"
                onClick={() => setPhase({ kind: "playing", clip: phase.clip })}
              >
                재생
              </button>
              <button
                type="button"
                className="ph-button"
                onClick={() => setPhase({ kind: "picking" })}
              >
                다른 파일 선택
              </button>
            </div>
          ) : (
            <div className="vlib-empty">
              <FolderOpen size={32} strokeWidth={1.5} />
              <b>영상을 열어 보세요</b>
              <p>기기에 있는 영상 파일을 선택해 재생합니다.</p>
              {params.entry === "center" && openButton}
            </div>
          )}
        </div>
      </div>
      {phase.kind === "picking" && (
        <VideoFilePicker onSelect={select} onCancel={home} />
      )}
      {phase.kind === "playing" && (
        <VideoLibraryPlayer clip={phase.clip} onClose={home} />
      )}
    </div>
  );
}
