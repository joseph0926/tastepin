import { useId, useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import "./SpecimenExtensions.css";

const groups = [
  {
    label: "개발",
    names: [
      "김지민",
      "박서준",
      "이도윤",
      "최하은",
      "정민서",
      "강예준",
      "조수빈",
      "윤시우",
      "장서연",
      "임현우",
    ],
  },
  {
    label: "디자인",
    names: [
      "서지안",
      "한유진",
      "오지호",
      "신다은",
      "권준서",
      "황예린",
      "안도현",
      "송채원",
      "류지우",
      "홍수아",
    ],
  },
  {
    label: "운영",
    names: [
      "문태윤",
      "양서현",
      "손유나",
      "배민준",
      "백지율",
      "허시윤",
      "유다인",
      "남건우",
      "심예원",
      "노하준",
    ],
  },
];
const options = groups.flatMap((group) =>
  group.names.map((name) => ({
    id: `${group.label}-${name}`,
    name,
    group: group.label,
  })),
);

export default function ManyOptions({ params }: SpecimenProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.id === selected);
  const pick = (value: string, byUser: boolean) => {
    setSelected(value);
    setOpen(false);
    if (byUser) triggerRef.current?.focus();
  };
  const show = () => {
    setQuery("");
    setOpen((current) => !current);
  };
  useDemo((tick) => {
    const step = tick % 6;
    if (step === 1) {
      setOpen(true);
      setQuery("");
    }
    if (step === 2) {
      setQuery("서지안");
      const details = panelRef.current?.querySelectorAll("details");
      if (details?.[1]) details[1].open = true;
    }
    if (step === 3) pick(options[10].id, false);
    if (step === 4) {
      setOpen(true);
      setQuery("");
    }
    if (step === 5) {
      setSelected("");
      setQuery("");
    }
    if (step === 0) {
      setOpen(false);
      setSelected("");
    }
  });
  const rows = (items: typeof options) =>
    items.map((option) => (
      <label className="sx-option" key={option.id}>
        <input
          type="radio"
          name={`${id}-person`}
          value={option.id}
          checked={selected === option.id}
          onChange={() => pick(option.id, true)}
        />
        <span>{option.name}</span>
        <small>{option.group}</small>
      </label>
    ));
  const results = options.filter((option) =>
    option.name.includes(query.trim()),
  );
  const combined =
    params.kind === "searchgroups" || params.kind === "searchfold";
  const searchable = params.kind === "search" || combined;
  const groupedResults = groups
    .map((group) => ({
      label: group.label,
      items: results.filter((option) => option.group === group.label),
    }))
    .filter((group) => group.items.length > 0);
  return (
    <div className="sx-stage">
      <h3>프로젝트 담당자</h3>
      <button
        ref={triggerRef}
        type="button"
        className="sx-select-trigger mfd-button"
        aria-expanded={open}
        aria-controls={`${id}-choices`}
        onClick={show}
      >
        {selectedOption
          ? `${selectedOption.name} (${selectedOption.group})`
          : "담당자 선택"}
        <span aria-hidden>⌄</span>
      </button>
      {open && (
        <div
          id={`${id}-choices`}
          className="sx-picker"
          ref={panelRef}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          {searchable && (
            <>
              <label className="sx-search-label" htmlFor={`${id}-search`}>
                이름 검색
                <input
                  id={`${id}-search`}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <p className="sx-small" role="status">
                {results.length}명
              </p>
            </>
          )}
          {combined ? (
            groupedResults.map((group, index) =>
              params.kind === "searchfold" ? (
                <details
                  key={`${group.label}-${query.trim()}`}
                  open={Boolean(query.trim()) || index === 0}
                >
                  <summary>
                    {group.label} <span>{group.items.length}명</span>
                  </summary>
                  <div role="group" aria-label={group.label}>
                    {rows(group.items)}
                  </div>
                </details>
              ) : (
                <section className="sx-option-group" key={group.label}>
                  <h4>
                    {group.label} <span>{group.items.length}명</span>
                  </h4>
                  <div role="group" aria-label={group.label}>
                    {rows(group.items)}
                  </div>
                </section>
              ),
            )
          ) : params.kind === "search" ? (
            <div role="group" aria-label="담당자 목록">
              {rows(results)}
            </div>
          ) : (
            groups.map((group, index) => (
              <details key={group.label} open={index === 0}>
                <summary>
                  {group.label} <span>{group.names.length}명</span>
                </summary>
                <div role="group" aria-label={group.label}>
                  {rows(
                    options.filter((option) => option.group === group.label),
                  )}
                </div>
              </details>
            ))
          )}
          {searchable && !results.length && <p>일치하는 이름이 없습니다.</p>}
        </div>
      )}
      <p className="sx-small" role="status">
        {selectedOption
          ? `${selectedOption.name} 님을 담당자로 지정했습니다`
          : "담당자를 지정해 주세요"}
      </p>
    </div>
  );
}
