import { useState } from "react";
import { X } from "lucide-react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { clips, formatTime, VideoScene, type Clip } from "./VideoScene";
import { VideoLibraryPlayer } from "./VideoFileShared";

// params: group(day | flat), remove(undo | confirm)
// 기록은 이 시편을 보는 동안만 유지한다. 목록으로 돌아오면 영상별 위치와 최근 순서를 갱신한다.
type Recent = { clip: Clip; savedMs: number; day: "오늘" | "어제" };
const initial: Recent[] = [
  { clip: clips[0], savedMs: 754_000, day: "오늘" },
  { clip: clips[1], savedMs: 480_000, day: "어제" },
  { clip: clips[2], savedMs: 120_000, day: "어제" },
];

export default function VideoRecent({ params }: SpecimenProps) {
  const [recent, setRecent] = useState(initial);
  const [opened, setOpened] = useState<Recent | null>(null);
  const [pending, setPending] = useState<Recent | null>(null);
  const [removed, setRemoved] = useState<{
    item: Recent;
    index: number;
  } | null>(null);
  const remove = (item: Recent) => {
    setRemoved({
      item,
      index: recent.findIndex((row) => row.clip.id === item.clip.id),
    });
    setRecent((rows) => rows.filter((row) => row.clip.id !== item.clip.id));
    setPending(null);
  };
  const requestRemove = (item: Recent) =>
    params.remove === "confirm" ? setPending(item) : remove(item);
  const restore = () => {
    if (!removed) return;
    setRecent((rows) => {
      const next = [...rows];
      next.splice(removed.index, 0, removed.item);
      return next;
    });
    setRemoved(null);
  };
  const closePlayer = (savedMs: number) => {
    if (!opened) return;
    const updated: Recent = { ...opened, savedMs, day: "오늘" };
    setRecent((rows) => [
      updated,
      ...rows.filter((row) => row.clip.id !== opened.clip.id),
    ]);
    setOpened(null);
  };
  useDemo((tick) => {
    const step = tick % 6;
    if (step === 1) setOpened(recent[recent.length - 1] ?? null);
    if (step === 2 && opened) closePlayer(opened.savedMs + 30_000);
    if (step === 3 && recent[0]) requestRemove(recent[0]);
    if (step === 4 && pending) remove(pending);
    if (step === 0) {
      setRecent(initial);
      setOpened(null);
      setPending(null);
      setRemoved(null);
    }
  });
  return (
    <div className="ph-frame">
      <div className="vlib-base" inert={opened !== null}>
        <div className="ph-head">
          <h3>최근 영상</h3>
        </div>
        <div className="ph-body">
          <p className="vlib-description">최근 본 순서</p>
          <ul className="vlib-list">
            {recent.map((item, index) => (
              <li key={item.clip.id}>
                {params.group === "day" &&
                  (index === 0 || recent[index - 1].day !== item.day) && (
                    <h4 className="vlib-day">{item.day}</h4>
                  )}
                <div className="vlib-recent-row">
                  <button
                    type="button"
                    className="vrs-row"
                    onClick={() => {
                      setRemoved(null);
                      setOpened(item);
                    }}
                  >
                    <VideoScene
                      clip={item.clip}
                      positionMs={item.savedMs}
                      className="vrs-thumb"
                    />
                    <span className="vrs-text">
                      <b>{item.clip.title}</b>
                      <span>
                        {formatTime(item.savedMs)} /{" "}
                        {formatTime(item.clip.durationMs)}
                      </span>
                      {params.group === "flat" && <span>{item.day}</span>}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="ph-icon"
                    aria-label={`${item.clip.title} 기록 지우기`}
                    onClick={() => requestRemove(item)}
                  >
                    <X size={18} />
                  </button>
                </div>
                {pending?.clip.id === item.clip.id && (
                  <div
                    className="vlib-confirm"
                    role="group"
                    aria-label="기록 지우기 확인"
                  >
                    <p>최근 목록에서 지울까요? 파일은 남아 있습니다.</p>
                    <div className="vlib-actions">
                      <button
                        type="button"
                        className="ph-button"
                        onClick={() => setPending(null)}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        className="ph-button is-primary"
                        onClick={() => remove(item)}
                      >
                        기록 지우기
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {recent.length === 0 && (
            <p className="vlib-description">최근 본 영상이 없습니다.</p>
          )}
          {removed && params.remove === "undo" && (
            <div className="vlib-confirm" role="status">
              <p>최근 목록에서 지웠습니다. 파일은 남아 있습니다.</p>
              <button type="button" className="ph-button" onClick={restore}>
                되돌리기
              </button>
            </div>
          )}
        </div>
      </div>
      {opened && (
        <VideoLibraryPlayer
          key={opened.clip.id}
          clip={opened.clip}
          savedMs={opened.savedMs}
          onClose={closePlayer}
        />
      )}
    </div>
  );
}
