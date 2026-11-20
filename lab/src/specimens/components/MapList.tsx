import { useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { StayArt, stayPhotos } from "./StayArt";
import "./MapList.css";

// params: link(both | marker | none), label(compact | full | dot), cluster(count | stack)
// 왼쪽 지도의 가격 마커와 오른쪽 숙소 목록. 마커를 누르면 목록이 그 숙소로 스크롤한다.
// 가까이 붙은 세 곳은 이 배율에서 마커가 겹친다. 묶음을 누르면 지도를 확대해 풀어 준다

interface Stay {
  id: string;
  name: string;
  night: number;
  // 지도 위 위치(%). spread는 확대해 묶음을 풀었을 때의 위치다
  at: { x: number; y: number };
  spread?: { x: number; y: number };
}

const stays: Stay[] = [
  { id: "a", name: "서촌 마당집", night: 128000, at: { x: 22, y: 30 } },
  { id: "b", name: "망원 강가 스튜디오", night: 96000, at: { x: 30, y: 70 } },
  {
    id: "c",
    name: "연희 숲 오두막",
    night: 142000,
    at: { x: 60, y: 42 },
    spread: { x: 48, y: 16 },
  },
  {
    id: "d",
    name: "연희 계단집",
    night: 88000,
    at: { x: 63, y: 46 },
    spread: { x: 70, y: 46 },
  },
  {
    id: "e",
    name: "연희 다락방",
    night: 74000,
    at: { x: 58, y: 49 },
    spread: { x: 54, y: 60 },
  },
  { id: "f", name: "성수 붉은 벽돌", night: 156000, at: { x: 80, y: 24 } },
  { id: "g", name: "한남 언덕 테라스", night: 210000, at: { x: 78, y: 78 } },
];

const clustered = ["c", "d", "e"];

const compact = (value: number) => {
  const man = value / 10000;
  return `${Number.isInteger(man) ? man : man.toFixed(1)}만`;
};
const full = (value: number) => `₩${value.toLocaleString("ko-KR")}`;

export default function MapList({ params }: SpecimenProps) {
  const { link, label, cluster } = params;
  const [hover, setHover] = useState<{
    id: string;
    from: "card" | "marker";
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const grouped = cluster === "count" && !zoomed;
  const position = (stay: Stay) =>
    zoomed && stay.spread ? stay.spread : stay.at;
  const markerLit = (id: string) =>
    hover?.id === id && (hover.from === "marker" || link !== "none");
  const cardLit = (id: string) =>
    hover?.id === id && (hover.from === "card" || link === "both");

  const select = (id: string) => {
    setSelected(id);
    const list = listRef.current;
    const card = list?.querySelector<HTMLElement>(`[data-stay="${id}"]`);
    if (list && card)
      list.scrollTo({
        top: card.offsetTop - list.offsetTop - 8,
        behavior: "smooth",
      });
  };

  // 카드 하나에 올리기, 묶인 숙소 카드에 올리기, 묶음 누르기(또는 마커 누르기), 처음으로
  useDemo((tick) => {
    const step = (tick - 1) % 4;
    if (step === 0) setHover({ id: "a", from: "card" });
    if (step === 1) setHover({ id: "d", from: "card" });
    if (step === 2) {
      setHover(null);
      if (cluster === "count") setZoomed(true);
      else select("g");
    }
    if (step === 3) {
      setZoomed(false);
      setSelected(null);
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  const markerText = (stay: Stay) => {
    if (label === "full") return full(stay.night);
    if (label === "dot")
      return markerLit(stay.id) || selected === stay.id
        ? compact(stay.night)
        : "";
    return compact(stay.night);
  };

  const singles = grouped
    ? stays.filter((stay) => !clustered.includes(stay.id))
    : stays;
  const groupLit = clustered.some((id) => hover?.id === id && link !== "none");
  const groupCenter = {
    x:
      clustered.reduce(
        (sum, id) => sum + stays.find((stay) => stay.id === id)!.at.x,
        0,
      ) / clustered.length,
    y:
      clustered.reduce(
        (sum, id) => sum + stays.find((stay) => stay.id === id)!.at.y,
        0,
      ) / clustered.length,
  };

  return (
    <div className="ml" data-label={label}>
      <div className="ml-map" aria-label="숙소 지도" role="group">
        <svg
          className="ml-ground"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M0 62 C 25 55, 45 70, 70 60 S 100 52, 100 52 L100 70 C 80 72, 60 80, 35 78 S 0 74, 0 74 Z"
            className="ml-river"
          />
          <circle cx="40" cy="22" r="10" className="ml-park" />
          <circle cx="86" cy="44" r="8" className="ml-park" />
          <path
            d="M0 40 L100 34 M48 0 L52 100 M0 90 L100 86"
            className="ml-road"
          />
        </svg>
        {zoomed && (
          <button
            type="button"
            className="ml-zoom-out"
            onClick={() => setZoomed(false)}
          >
            축소
          </button>
        )}
        {singles.map((stay) => {
          const at = position(stay);
          const lit = markerLit(stay.id) || selected === stay.id;
          return (
            <button
              key={stay.id}
              type="button"
              className="ml-marker"
              data-lit={lit || undefined}
              data-empty={markerText(stay) === "" || undefined}
              style={{ left: `${at.x}%`, top: `${at.y}%` }}
              aria-label={`${stay.name} ${full(stay.night)}`}
              onMouseEnter={() => setHover({ id: stay.id, from: "marker" })}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover({ id: stay.id, from: "marker" })}
              onBlur={() => setHover(null)}
              onClick={() => select(stay.id)}
            >
              {markerText(stay)}
            </button>
          );
        })}
        {grouped && (
          <button
            type="button"
            className="ml-marker is-group"
            data-lit={groupLit || undefined}
            style={{ left: `${groupCenter.x}%`, top: `${groupCenter.y}%` }}
            aria-label={`숙소 ${clustered.length}곳, 눌러서 확대`}
            onClick={() => setZoomed(true)}
          >
            {clustered.length}곳
          </button>
        )}
      </div>

      <ul className="ml-list" ref={listRef} aria-label="숙소 목록">
        {stays.map((stay, index) => (
          <li
            key={stay.id}
            data-stay={stay.id}
            data-lit={cardLit(stay.id) || undefined}
            data-selected={selected === stay.id || undefined}
            onMouseEnter={() => setHover({ id: stay.id, from: "card" })}
            onMouseLeave={() => setHover(null)}
          >
            <span className="ml-thumb">
              <StayArt photo={stayPhotos[(index * 2) % stayPhotos.length]} />
            </span>
            <span className="ml-text">
              <b>{stay.name}</b>
              <span>{full(stay.night)} /박</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
