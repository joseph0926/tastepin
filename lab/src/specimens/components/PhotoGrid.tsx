import { useState } from "react";
import { ChevronLeft, ChevronRight, Grid2x2, X } from "lucide-react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { StayArt, stayPhotos } from "./StayArt";
import "./PhotoGrid.css";

// params: layout(mosaic | strip | carousel), all(button | overlay, layout이 carousel이 아닐 때만)
// 숙소 상세 맨 위의 사진 12장. 모두 보기를 누르면 무대 안에 전체 사진 목록을 연다

const MOSAIC_SHOWN = 5;
const STRIP_SHOWN = 5;

export default function PhotoGrid({ params }: SpecimenProps) {
  const { layout, all } = params;
  const [current, setCurrent] = useState(0);
  const [open, setOpen] = useState(false);
  const total = stayPhotos.length;
  const shownCount = layout === "mosaic" ? MOSAIC_SHOWN : STRIP_SHOWN;
  const hidden = total - shownCount;

  // 사진 하나 넘기기(또는 썸네일 고르기), 모두 보기, 닫고 처음으로
  useDemo((tick) => {
    const step = (tick - 1) % 3;
    if (step === 0) setCurrent(layout === "strip" ? 2 : 1);
    if (step === 1) {
      if (layout === "carousel") setCurrent(2);
      else setOpen(true);
    }
    if (step === 2) {
      setOpen(false);
      setCurrent(0);
    }
  });

  const showAll = (label: string, className: string) => (
    <button type="button" className={className} onClick={() => setOpen(true)}>
      {label}
    </button>
  );
  const allButton = all === "button" && (
    <button
      type="button"
      className="pg-all-button"
      onClick={() => setOpen(true)}
    >
      <Grid2x2 size={14} strokeWidth={1.75} aria-hidden />
      사진 모두 보기
    </button>
  );

  return (
    <div className="pg">
      {layout === "mosaic" && (
        <div className="pg-mosaic">
          {stayPhotos.slice(0, MOSAIC_SHOWN).map((photo, index) => (
            <div key={index} className="pg-cell">
              <StayArt photo={photo} label={`숙소 사진 ${index + 1}`} />
              {all === "overlay" &&
                index === MOSAIC_SHOWN - 1 &&
                showAll(`+${hidden}`, "pg-more-overlay")}
            </div>
          ))}
          {allButton}
        </div>
      )}

      {layout === "strip" && (
        <div className="pg-strip">
          <div className="pg-main">
            <StayArt
              photo={stayPhotos[current]}
              label={`숙소 사진 ${current + 1}`}
            />
            {allButton}
          </div>
          <div className="pg-thumbs">
            {stayPhotos.slice(0, STRIP_SHOWN).map((photo, index) => {
              const last = index === STRIP_SHOWN - 1;
              return (
                <div key={index} className="pg-thumb">
                  <button
                    type="button"
                    aria-label={`사진 ${index + 1} 보기`}
                    aria-pressed={index === current}
                    onClick={() => setCurrent(index)}
                  >
                    <StayArt photo={photo} />
                  </button>
                  {all === "overlay" &&
                    last &&
                    showAll(`+${hidden}`, "pg-more-overlay")}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {layout === "carousel" && (
        <div className="pg-main pg-carousel">
          <StayArt
            photo={stayPhotos[current]}
            label={`숙소 사진 ${current + 1}`}
          />
          <button
            type="button"
            className="pg-arrow is-prev"
            aria-label="이전 사진"
            disabled={current === 0}
            onClick={() => setCurrent(current - 1)}
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="pg-arrow is-next"
            aria-label="다음 사진"
            disabled={current === total - 1}
            onClick={() => setCurrent(current + 1)}
          >
            <ChevronRight size={16} strokeWidth={2} />
          </button>
          <span className="pg-count">
            {current + 1} / {total}
          </span>
        </div>
      )}

      <div className="pg-body" aria-hidden>
        <span />
        <span />
      </div>

      {open && (
        <div
          className="pg-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={`사진 ${total}장`}
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        >
          <header>
            <b>사진 {total}장</b>
            <button
              type="button"
              aria-label="닫기"
              onClick={() => setOpen(false)}
              autoFocus
            >
              <X size={16} strokeWidth={2} />
            </button>
          </header>
          <div className="pg-sheet-grid">
            {stayPhotos.map((photo, index) => (
              <div key={index} className="pg-sheet-cell">
                <StayArt photo={photo} label={`숙소 사진 ${index + 1}`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
