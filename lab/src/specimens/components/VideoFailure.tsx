import { useState } from "react";
import { FileWarning } from "lucide-react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { clips, VideoScene, type Clip } from "./VideoScene";
import { VideoFilePicker, VideoLibraryPlayer } from "./VideoFileShared";

// params: place(player | page), detail(short | path)
// 파일이 이동한 상황이다. 같은 경로 재시도로 성공시키지 않고 파일을 다시 고르게 한다.
type Phase =
  { kind: "list" | "failed" | "picking" } | { kind: "playing"; clip: Clip };

export default function VideoFailure({ params }: SpecimenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "list" });
  const close = () => setPhase({ kind: "list" });
  useDemo((tick) => {
    const step = tick % 5;
    if (step === 1) setPhase({ kind: "failed" });
    if (step === 2) setPhase({ kind: "picking" });
    if (step === 3) setPhase({ kind: "playing", clip: clips[0] });
    if (step === 0) close();
  });
  const failure = (
    <div className="vlib-empty" role="alert">
      <FileWarning size={32} strokeWidth={1.5} />
      <b>파일을 찾을 수 없습니다</b>
      <p>파일이 이동했거나 삭제되었을 수 있습니다. 다시 선택해 주세요.</p>
      {params.detail === "path" && (
        <p className="vlib-path">내 기기 / 여행 / {clips[0].title}.mp4</p>
      )}
      <button
        type="button"
        className={
          params.place === "player"
            ? "vd-chip is-primary"
            : "ph-button is-primary"
        }
        onClick={() => setPhase({ kind: "picking" })}
      >
        파일 다시 선택
      </button>
      <button
        type="button"
        className={params.place === "player" ? "vd-chip" : "ph-button"}
        onClick={close}
      >
        목록으로
      </button>
    </div>
  );
  return (
    <div className="ph-frame">
      <div
        className="vlib-base"
        inert={phase.kind === "picking" || phase.kind === "playing"}
      >
        <div className="ph-head">
          <h3>{phase.kind === "failed" ? clips[0].title : "최근 영상"}</h3>
        </div>
        <div className="ph-body">
          {phase.kind === "failed" ? (
            params.place === "player" ? (
              <div className="vlib-failed-player">{failure}</div>
            ) : (
              failure
            )
          ) : (
            <button
              type="button"
              className="vrs-row"
              onClick={() => setPhase({ kind: "failed" })}
            >
              <VideoScene
                clip={clips[0]}
                positionMs={754_000}
                className="vrs-thumb"
              />
              <span className="vrs-text">
                <b>{clips[0].title}</b>
                <span>12:34 / 45:00</span>
              </span>
            </button>
          )}
        </div>
      </div>
      {phase.kind === "picking" && (
        <VideoFilePicker
          onSelect={(clip) => setPhase({ kind: "playing", clip })}
          onCancel={() => setPhase({ kind: "failed" })}
        />
      )}
      {phase.kind === "playing" && (
        <VideoLibraryPlayer clip={phase.clip} onClose={close} />
      )}
    </div>
  );
}
