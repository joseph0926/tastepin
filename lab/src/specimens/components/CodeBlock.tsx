import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Blog.css";

const source = `type SearchState = {
  query: string;
  category: string | null;
  year: string | null;
};

export function createSearchUrl(state: SearchState) {
  const params = new URLSearchParams();
  const query = state.query.trim();

  if (query) params.set("q", query);
  if (state.category) params.set("category", state.category);
  if (state.year) params.set("year", state.year);

  // 긴 조건과 주소가 있는 줄도 같은 예제로 비교합니다.
  const description = "검색어와 주제, 연도를 주소에 남기면 다른 사람도 같은 조건의 글 목록을 열 수 있습니다.";
  const destination = "/blog?" + params.toString();

  return { destination, description };
}`;

export default function CodeBlock({ params }: SpecimenProps) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const timer = useRef<number>(undefined);
  const active = useRef(true);
  const codeId = useId();
  const seconds = useSeconds();
  const folded = params.length === "fold" && !expanded;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  const showCopied = () => {
    window.clearTimeout(timer.current);
    setFeedback("copied");
    timer.current = window.setTimeout(
      () => setFeedback("idle"),
      seconds(1200) * 1000,
    );
  };

  const copy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(source);
      if (active.current) showCopied();
    } catch {
      if (active.current) setFeedback("failed");
    }
  };

  // 같이 재생은 클립보드를 건드리지 않고 완료 표시와 펼침만 시연한다.
  useDemo((tick) => {
    if (tick % 3 === 1) showCopied();
    if (tick % 3 === 2) setExpanded(true);
    if (tick % 3 === 0) {
      window.clearTimeout(timer.current);
      setFeedback("idle");
      setExpanded(false);
    }
  });

  return (
    <article className="blog-sample code-sample" data-wrap={params.wrap}>
      <h3>검색 조건을 주소에 남기기</h3>
      <p>같은 검색 결과를 다시 열 수 있도록 조건을 주소로 만듭니다.</p>
      <div className="code-panel">
        <header>
          <span>TypeScript</span>
          <button
            type="button"
            className="blog-button"
            onClick={copy}
            aria-label={feedback === "copied" ? "복사됨" : "코드 복사"}
          >
            {feedback === "copied" ? (
              <Check size={15} aria-hidden />
            ) : (
              <Copy size={15} aria-hidden />
            )}
            {params.feedback === "label" && (
              <span>{feedback === "copied" ? "복사됨" : "코드 복사"}</span>
            )}
          </button>
        </header>
        <pre
          id={codeId}
          className={folded ? "code-source is-folded" : "code-source"}
          tabIndex={0}
          aria-label="검색 주소를 만드는 코드"
        >
          <code>{source}</code>
        </pre>
        {params.length === "fold" && (
          <button
            type="button"
            className="blog-button code-expand"
            aria-expanded={expanded}
            aria-controls={codeId}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "코드 접기" : "전체 코드 보기"}
          </button>
        )}
      </div>
      <p className="blog-meta" role="status">
        {feedback === "failed" ? (
          "복사하지 못했습니다. 코드를 선택해 복사해 주세요."
        ) : feedback === "copied" ? (
          <span className="blog-sr-only">코드를 복사했습니다.</span>
        ) : null}
      </p>
    </article>
  );
}
