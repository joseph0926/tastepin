import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileText, Search as SearchIcon, X } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Search.css";

// params: timing(instant | pause | enter), change(fade | collapse | instant), highlight(bold | mark | none), empty(plain | clear | suggest)
// 같이 재생은 실제 초점을 옮기지 않고 검색어를 한 글자씩 바꾼다. Enter 단계는 Enter로 거르는 값에서만 결과를 바꾼다.

const documents = [
  { id: "d1", title: "디자인 시스템 정리", meta: "김하늘, 어제" },
  { id: "d2", title: "디자인 리뷰 회의록", meta: "이도윤, 10월 16일" },
  { id: "d3", title: "10월 예산안", meta: "박서윤, 10월 15일" },
  { id: "d4", title: "신규 입사자 안내", meta: "최민준, 10월 14일" },
  { id: "d5", title: "디자인 토큰 변경 이력", meta: "김하늘, 10월 12일" },
  { id: "d6", title: "분기 보고서 초안", meta: "이도윤, 10월 9일" },
];
const suggestions = ["디자인", "보고서"];

// 시연 순서: 한 글자씩 입력, Enter, 결과 없는 검색어, Enter, 지우기
const demoSteps: { query?: string; enter?: true }[] = [
  { query: "디" },
  { query: "디자" },
  { query: "디자인" },
  { enter: true },
  { query: "결재" },
  { enter: true },
  { query: "", enter: true },
];

function Title({
  text,
  query,
  highlight,
}: {
  text: string;
  query: string;
  highlight: string;
}) {
  const at = query ? text.indexOf(query) : -1;
  if (at < 0 || highlight === "none") return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="srch-match">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}

export default function Search({ params }: SpecimenProps) {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const seconds = useSeconds();
  const inputId = useId();
  const { timing, change, highlight, empty } = params;

  const type = (value: string) => {
    setQuery(value);
    if (timing === "instant") setApplied(value);
  };
  const submit = (value = query) => setApplied(value);

  // 잠깐 멈추면: 마지막 입력 뒤 250ms 동안 바뀌지 않으면 거른다
  useEffect(() => {
    if (timing !== "pause") return;
    const timer = window.setTimeout(
      () => setApplied(query),
      seconds(250) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [query, timing, seconds]);

  useDemo((tick) => {
    const step = demoSteps[(tick - 1) % demoSteps.length];
    if (step.query !== undefined) type(step.query);
    if (step.enter) submit(step.query ?? query);
  });

  const term = applied.trim();
  const results = documents.filter((doc) => doc.title.includes(term));
  const quick = {
    duration: change === "instant" ? 0 : seconds(change === "fade" ? 120 : 180),
    ease: EASE_OUT,
  };

  const rows = (list: typeof documents) =>
    list.map((doc) => (
      <motion.li
        key={doc.id}
        layout={change === "collapse" ? "position" : false}
        initial={change === "collapse" ? { opacity: 0, height: 0 } : false}
        animate={{ opacity: 1, height: "auto" }}
        exit={
          change === "collapse"
            ? { opacity: 0, height: 0 }
            : { opacity: 0, transition: { duration: 0 } }
        }
        transition={quick}
      >
        <div className="srch-row">
          <FileText size={16} strokeWidth={1.75} aria-hidden />
          <span className="srch-title">
            <Title text={doc.title} query={term} highlight={highlight} />
          </span>
          <span>{doc.meta}</span>
        </div>
      </motion.li>
    ));

  const none = (
    <div className="srch-empty" role="status">
      <p>"{term}"와 맞는 결과가 없어요</p>
      {empty === "clear" && (
        <button
          type="button"
          className="srch-button"
          onClick={() => {
            setQuery("");
            submit("");
          }}
        >
          검색어 지우기
        </button>
      )}
      {empty === "suggest" && (
        <div className="srch-suggest">
          {suggestions.map((word) => (
            <button
              key={word}
              type="button"
              className="srch-button"
              onClick={() => {
                setQuery(word);
                submit(word);
              }}
            >
              {word}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="srch-page" data-highlight={highlight}>
      <h3>문서</h3>
      <form
        className="srch-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={inputId} className="srch-sr">
          문서 검색
        </label>
        <div className="srch-box">
          <SearchIcon size={18} strokeWidth={1.75} aria-hidden />
          <input
            id={inputId}
            type="search"
            value={query}
            placeholder="문서 제목으로 찾기"
            autoComplete="off"
            onChange={(event) => type(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="srch-clear"
              aria-label="검색어 지우기"
              onClick={() => {
                type("");
                if (timing === "enter") submit("");
              }}
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {timing === "enter" && (
          <button type="submit" className="srch-button">
            검색
          </button>
        )}
      </form>

      <div className="srch-results" aria-live="polite">
        {change === "fade" ? (
          <AnimatePresence initial={false}>
            <motion.div
              key={term}
              className="srch-layer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={quick}
            >
              {results.length ? (
                <ul className="srch-list">{rows(results)}</ul>
              ) : (
                none
              )}
            </motion.div>
          </AnimatePresence>
        ) : results.length ? (
          <ul className="srch-list">
            <AnimatePresence initial={false}>{rows(results)}</AnimatePresence>
          </ul>
        ) : (
          none
        )}
      </div>
    </div>
  );
}
