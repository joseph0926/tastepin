import { useState } from "react";
import { ChevronRight, ListFilter, X } from "lucide-react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import "./PageHead.css";

// params: trail(crumb | inline | none), controls(below | right), meta(live | time | none)
// 분석 대시보드의 페이지 머리. 필터 버튼은 준비된 조건을 차례로 더하고, 칩의 ×로 지운다

const periods = [
  { id: "24h", label: "최근 24시간" },
  { id: "7d", label: "최근 7일" },
  { id: "30d", label: "최근 30일" },
];

const presets = ["유입처: 검색", "국가: 대한민국", "페이지: /시작하기"];

const parent = "사이트";
const title = "팀 문서 사이트";

export default function PageHead({ params }: SpecimenProps) {
  const [period, setPeriod] = useState("7d");
  const [filters, setFilters] = useState<string[]>([presets[0]]);
  const { trail, controls, meta } = params;

  const addFilter = () => {
    const next = presets.find((preset) => !filters.includes(preset));
    if (next) setFilters([...filters, next]);
  };
  const removeFilter = (filter: string) =>
    setFilters(filters.filter((item) => item !== filter));

  // 조건 더하기, 기간 바꾸기, 처음 상태로 되돌리기를 반복한다
  useDemo((tick) => {
    const action = tick % 3;
    if (action === 1) addFilter();
    else if (action === 2) setPeriod("30d");
    else {
      setFilters([presets[0]]);
      setPeriod("7d");
    }
  });

  const periodSelect = (
    <label className="pgh-period">
      <span className="pgh-sr-only">기간</span>
      <select
        value={period}
        onChange={(event) => setPeriod(event.target.value)}
      >
        {periods.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
  const filterButton = (
    <button
      type="button"
      className="pgh-button"
      onClick={addFilter}
      disabled={filters.length === presets.length}
    >
      <ListFilter size={14} strokeWidth={1.75} aria-hidden />
      필터
    </button>
  );
  const chips = filters.map((filter) => (
    <span key={filter} className="pgh-chip">
      {filter}
      <button
        type="button"
        aria-label={`${filter} 조건 지우기`}
        onClick={() => removeFilter(filter)}
      >
        <X size={12} strokeWidth={2} aria-hidden />
      </button>
    </span>
  ));

  return (
    <div className="pgh" data-controls={controls}>
      {trail === "crumb" && (
        <nav className="pgh-trail" aria-label="이동 경로">
          <span>분석</span>
          <ChevronRight size={12} aria-hidden />
          <span>{parent}</span>
          <ChevronRight size={12} aria-hidden />
          <span aria-current="page">{title}</span>
        </nav>
      )}

      <div className="pgh-main">
        <div className="pgh-title-row">
          <div className="pgh-title">
            <h3>
              {trail === "inline" && (
                <span className="pgh-parent">{parent} /</span>
              )}
              {title}
            </h3>
            {meta === "live" && (
              <p className="pgh-meta">
                <span className="pgh-live" aria-hidden />
                23명 접속 중
              </p>
            )}
            {meta === "time" && (
              <p className="pgh-meta">11월 20일 14:30 기준</p>
            )}
          </div>
          {controls === "right" && (
            <div className="pgh-tools">
              {filterButton}
              {periodSelect}
            </div>
          )}
        </div>

        {controls === "below" ? (
          <div className="pgh-filter-row">
            <div className="pgh-chips">
              {chips}
              {filterButton}
            </div>
            {periodSelect}
          </div>
        ) : (
          filters.length > 0 && <div className="pgh-chips">{chips}</div>
        )}
      </div>

      <div className="pgh-content" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
