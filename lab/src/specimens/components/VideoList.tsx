import { ChevronLeft } from "lucide-react";
import type { SpecimenProps } from "../types";
import { clips, formatTime, VideoScene } from "./VideoScene";
import "./Phone.css";

// params: layout(thumb | grid | title), progress(bar | remain | none), duration(badge | text, layout이 thumb와 grid일 때만)
// 한 폴더의 영상 목록을 그린다. 움직임이 없어 같이 재생을 숨긴다.

// 본 위치. 0은 아직 보지 않은 영상이다
const watched: Record<string, number> = {
  harbor: 12 * 60_000 + 34_000,
  forest: 0,
  market: 11 * 60_000,
  snow: 25 * 60_000,
  desert: 0,
  river: 3 * 60_000,
};

function remainingLabel(durationMs: number, positionMs: number) {
  const minutes = Math.max(1, Math.round((durationMs - positionMs) / 60_000));
  return `${minutes}분 남음`;
}

export default function VideoList({ params }: SpecimenProps) {
  const { layout, progress } = params;
  const hasThumb = layout !== "title";
  // 썸네일이 없으면 길이를 얹을 자리가 없어 글자로 쓴다
  const duration = hasThumb ? params.duration : "text";

  return (
    <div className="ph-frame">
      <div className="ph-head">
        <button type="button" className="ph-icon" aria-label="폴더 목록">
          <ChevronLeft size={20} strokeWidth={1.75} />
        </button>
        <h3>여행 영상</h3>
      </div>
      <ul className="ph-body vls-list" data-layout={layout}>
        {clips.map((clip) => {
          const positionMs = watched[clip.id];
          const started = positionMs > 0;
          const share = `${(positionMs / clip.durationMs) * 100}%`;
          const meta = [
            duration === "text" && formatTime(clip.durationMs),
            progress === "remain" &&
              started &&
              remainingLabel(clip.durationMs, positionMs),
          ].filter(Boolean);
          return (
            <li key={clip.id}>
              <button type="button" className="vls-item">
                {hasThumb && (
                  <span className="vls-thumb">
                    <VideoScene
                      clip={clip}
                      positionMs={clip.durationMs * 0.3}
                    />
                    {duration === "badge" && (
                      <span className="vls-badge">
                        {formatTime(clip.durationMs)}
                      </span>
                    )}
                    {progress === "bar" && started && (
                      <span className="vls-progress" aria-hidden>
                        <span style={{ width: share }} />
                      </span>
                    )}
                  </span>
                )}
                <span className="vls-text">
                  <b>{clip.title}</b>
                  {meta.length > 0 && (
                    <span className="vls-meta">
                      {meta.map((item) => (
                        <span key={String(item)}>{item}</span>
                      ))}
                    </span>
                  )}
                  {progress === "bar" && started && (
                    <span className="ph-sr-only">
                      {remainingLabel(clip.durationMs, positionMs)}
                    </span>
                  )}
                </span>
                {!hasThumb && progress === "bar" && started && (
                  <span className="vls-progress is-row" aria-hidden>
                    <span style={{ width: share }} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
