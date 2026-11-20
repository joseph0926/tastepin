import { useState } from "react";
import { ChevronLeft, ChevronRight, Heart, Star } from "lucide-react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { StayArt, stayPhotos, type StayPhoto } from "./StayArt";
import "./PhotoCard.css";

// params: browse(dots | count | single), price(both | night | total), save(photo | title)
// 검색 결과의 사진 중심 숙소 카드 두 장. 사진 넘기기 버튼과 찜 버튼은 카드 열기와 따로 눌린다

const NIGHTS = 2;

const stays: {
  id: string;
  name: string;
  area: string;
  rating: number;
  night: number;
  photos: StayPhoto[];
}[] = [
  {
    id: "seochon",
    name: "서촌 마당집",
    area: "종로구 체부동",
    rating: 4.92,
    night: 128000,
    photos: stayPhotos.slice(0, 6),
  },
  {
    id: "mangwon",
    name: "망원 강가 스튜디오",
    area: "마포구 망원동",
    rating: 4.81,
    night: 96000,
    photos: stayPhotos.slice(6, 12),
  },
];

const won = (value: number) => `₩${value.toLocaleString("ko-KR")}`;

function Card({
  stay,
  index,
  saved,
  onIndex,
  onSave,
  params,
}: {
  stay: (typeof stays)[number];
  index: number;
  saved: boolean;
  onIndex: (index: number) => void;
  onSave: () => void;
  params: SpecimenProps["params"];
}) {
  const { browse, price, save } = params;
  const count = stay.photos.length;
  const canBrowse = browse !== "single";
  const shown = canBrowse ? index : 0;
  const saveButton = (
    <button
      type="button"
      className="pc-save"
      aria-pressed={saved}
      aria-label={`${stay.name} 찜하기`}
      onClick={onSave}
    >
      <Heart
        size={save === "photo" ? 20 : 18}
        strokeWidth={1.75}
        fill={saved ? "currentColor" : "none"}
      />
    </button>
  );

  return (
    <article className="pc-card" data-save={save}>
      <div className="pc-photo">
        <StayArt
          photo={stay.photos[shown]}
          label={`${stay.name} 사진 ${shown + 1}`}
        />
        {save === "photo" && saveButton}
        {canBrowse && (
          <>
            <button
              type="button"
              className="pc-arrow is-prev"
              aria-label="이전 사진"
              disabled={index === 0}
              onClick={() => onIndex(index - 1)}
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="pc-arrow is-next"
              aria-label="다음 사진"
              disabled={index === count - 1}
              onClick={() => onIndex(index + 1)}
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </>
        )}
        {browse === "dots" && (
          <span className="pc-dots" aria-hidden>
            {stay.photos.map((_, dot) => (
              <span key={dot} data-active={dot === index || undefined} />
            ))}
          </span>
        )}
        {browse === "count" && (
          <span className="pc-count">
            {index + 1} / {count}
          </span>
        )}
      </div>
      <div className="pc-title-row">
        <h4>{stay.name}</h4>
        {save === "title" ? (
          saveButton
        ) : (
          <span className="pc-rating">
            <Star size={12} fill="currentColor" strokeWidth={0} aria-hidden />
            {stay.rating.toFixed(2)}
          </span>
        )}
      </div>
      <p className="pc-meta">
        {stay.area}
        {save === "title" && ` / 평점 ${stay.rating.toFixed(2)}`}
      </p>
      <p className="pc-price">
        {price !== "total" && (
          <span>
            <b>{won(stay.night)}</b> /박
          </span>
        )}
        {price === "both" && (
          <span className="pc-total">
            {NIGHTS}박 총액 {won(stay.night * NIGHTS)}
          </span>
        )}
        {price === "total" && (
          <span>
            <b>{won(stay.night * NIGHTS)}</b> {NIGHTS}박 총액
          </span>
        )}
      </p>
    </article>
  );
}

export default function PhotoCard({ params }: SpecimenProps) {
  const [indexes, setIndexes] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<string[]>([]);

  const setIndex = (id: string, index: number) =>
    setIndexes({ ...indexes, [id]: index });
  const toggleSave = (id: string) =>
    setSaved(
      saved.includes(id) ? saved.filter((item) => item !== id) : [...saved, id],
    );

  // 첫 카드의 사진을 넘기고, 찜했다가, 사진을 처음으로 돌리고 찜을 푼다
  useDemo((tick) => {
    const step = (tick - 1) % 4;
    if (step === 0) setIndex(stays[0].id, 1);
    if (step === 1) setIndex(stays[0].id, 2);
    if (step === 2) toggleSave(stays[0].id);
    if (step === 3) {
      setIndexes({});
      setSaved([]);
    }
  });

  return (
    <div className="pc-grid">
      {stays.map((stay) => (
        <Card
          key={stay.id}
          stay={stay}
          index={indexes[stay.id] ?? 0}
          saved={saved.includes(stay.id)}
          onIndex={(index) => setIndex(stay.id, index)}
          onSave={() => toggleSave(stay.id)}
          params={params}
        />
      ))}
    </div>
  );
}
