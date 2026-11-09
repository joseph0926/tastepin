import { useId, useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import "./SpecimenExtensions.css";

const conditions = [
  "상태: 진행 중",
  "담당: 나",
  "팀: 개발",
  "우선순위: 높음",
  "마감: 이번 달",
  "공개: 팀",
  "종류: 개선",
  "알림: 사용",
];
const tasks = [
  { name: "디자인 시스템 정리", tags: conditions },
  { name: "검색 화면 개선", tags: conditions.slice(0, 6) },
  { name: "가입 안내 수정", tags: conditions.slice(0, 4) },
];

export default function ManyFilters({ params }: SpecimenProps) {
  const [active, setActive] = useState(conditions);
  const [draft, setDraft] = useState(conditions);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const chipsRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const compact = params.flow === "compact" && !expanded;
  const visible = compact ? active.slice(0, 2) : active;
  const results = tasks.filter((task) =>
    active.every((condition) => task.tags.includes(condition)),
  );
  const reset = () => {
    setActive(conditions);
    setDraft(conditions);
    setExpanded(false);
    setEditing(false);
  };
  useDemo((tick) => {
    const step = tick % 4;
    if (step === 1) {
      setExpanded(true);
      if (chipsRef.current)
        chipsRef.current.scrollLeft = chipsRef.current.scrollWidth;
    }
    if (step === 2) setActive((current) => current.slice(1));
    if (step === 3) setActive([]);
    if (step === 0) {
      reset();
      if (chipsRef.current) chipsRef.current.scrollLeft = 0;
    }
  });
  return (
    <div className="sx-stage">
      <h3>담당한 작업</h3>
      <div className="sx-toolbar">
        <button
          type="button"
          className="mfd-button"
          aria-expanded={editing}
          aria-controls={`${id}-editor`}
          onClick={() => {
            setDraft(active);
            setEditing((current) => !current);
          }}
        >
          필터
        </button>
        <button
          type="button"
          className="sx-text-button"
          disabled={!active.length}
          onClick={() => {
            setActive([]);
            setExpanded(false);
          }}
        >
          모두 해제
        </button>
      </div>
      {editing && (
        <fieldset id={`${id}-editor`} className="sx-filter-editor">
          <legend>조건 선택</legend>
          {conditions.map((condition) => (
            <label key={condition}>
              <input
                type="checkbox"
                checked={draft.includes(condition)}
                onChange={(event) =>
                  setDraft((current) =>
                    event.target.checked
                      ? [...current, condition]
                      : current.filter((item) => item !== condition),
                  )
                }
              />
              {condition}
            </label>
          ))}
          <button
            type="button"
            className="mfd-button is-primary"
            onClick={() => {
              setActive(draft);
              setEditing(false);
            }}
          >
            적용
          </button>
        </fieldset>
      )}
      <div
        id={`${id}-applied`}
        className="sx-chips"
        data-flow={params.flow}
        ref={chipsRef}
        role="group"
        aria-label="적용한 조건"
      >
        {visible.map((condition) => (
          <button
            type="button"
            className="sx-chip"
            key={condition}
            aria-label={`${condition} 해제`}
            onClick={() =>
              setActive((current) =>
                current.filter((item) => item !== condition),
              )
            }
          >
            {condition}
            <span aria-hidden>×</span>
          </button>
        ))}
        {params.flow === "compact" && active.length > 2 && (
          <button
            type="button"
            className="sx-chip"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "접기" : `나머지 ${active.length - 2}개`}
          </button>
        )}
      </div>
      <p className="sx-small" role="status">
        조건 {active.length}개 / 결과 {results.length}개
      </p>
      <ul className="sx-result-list">
        {results.map((task) => (
          <li key={task.name}>{task.name}</li>
        ))}
      </ul>
    </div>
  );
}
