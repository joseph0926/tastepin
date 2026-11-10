import { useId, useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { ScreenFrame, ScreenStatus } from "./ScreenShared";

const headings = [
  "먼저 문제를 확인합니다",
  "요청마다 순서를 붙입니다",
  "마지막 요청만 화면에 반영합니다",
];
const code = `let latestRequest = 0;

async function search(query) {
  const request = ++latestRequest;
  const response = await fetch('/search?q=' + encodeURIComponent(query));
  const result = await response.json();

  if (request !== latestRequest) return;
  render(result);
}`;

export default function ReadingScreen({ params }: SpecimenProps) {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const id = useId();
  const moveTo = (index: number, byUser = false) => {
    const scroller = scrollRef.current;
    const target = sectionRefs.current[index];
    if (scroller && target)
      scroller.scrollTop +=
        target.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        16;
    setActive(index);
    if (byUser)
      target?.querySelector<HTMLElement>("h4")?.focus({ preventScroll: true });
  };
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(code);
      setCopyStatus("코드를 복사했습니다");
    } catch {
      setCopyStatus("복사하지 못했습니다. 코드를 직접 선택해 주세요");
    }
  };
  useDemo((tick) => {
    const step = tick % 6;
    if (step === 1) moveTo(1);
    if (step === 2) setExpanded(true);
    if (step === 3) moveTo(2);
    if (step === 4) {
      const note = scrollRef.current?.querySelector("details");
      if (note) note.open = true;
    }
    if (step === 5) moveTo(0);
    if (step === 0) {
      setExpanded(false);
      setCopyStatus("");
      setProgress(0);
      setActive(0);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
        const note = scrollRef.current.querySelector("details");
        if (note) note.open = false;
      }
    }
  });
  return (
    <ScreenFrame
      title="검색 결과가 뒤늦게 바뀌는 이유"
      section="개발 기록"
      scrollRef={scrollRef}
      headerExtra={
        <div
          className="sc-reading-progress"
          role="progressbar"
          aria-label="읽은 정도"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      }
      onScroll={(event) => {
        const element = event.currentTarget;
        const distance = element.scrollHeight - element.clientHeight;
        setProgress(
          distance > 0
            ? Math.min(
                100,
                Math.max(0, Math.round((element.scrollTop / distance) * 100)),
              )
            : 0,
        );
        const line = element.getBoundingClientRect().top + 80;
        let index = 0;
        sectionRefs.current.forEach((section, next) => {
          if (section && section.getBoundingClientRect().top <= line)
            index = next;
        });
        setActive(index);
      }}
    >
      <p className="sc-muted">개발하며 배운 것 / 7분 읽기</p>
      <div className="sc-reading-layout" data-toc={params.toc}>
        <nav className="sc-toc" aria-label="글 목차">
          <h4>이 글에서 다루는 내용</h4>
          <ol>
            {headings.map((heading, index) => (
              <li key={heading}>
                <a
                  href={`#${id}-${index}`}
                  aria-current={active === index ? "location" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    moveTo(index, true);
                  }}
                >
                  {heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="sc-article">
          <section
            id={`${id}-0`}
            ref={(node) => {
              sectionRefs.current[0] = node;
            }}
          >
            <h4 tabIndex={-1}>{headings[0]}</h4>
            <p>
              검색어를 바꿨는데 이전 검색 결과가 나중에 나타나는 경우가
              있습니다. 요청을 보낸 순서와 응답을 받은 순서가 다르기 때문입니다.
            </p>
            <p>
              첫 번째 요청은 천천히 도착하고, 두 번째 요청은 빨리 끝났다고 해
              보겠습니다. 응답을 받을 때마다 화면을 바꾸면 먼저 보낸 요청의
              결과가 마지막에 남습니다.
            </p>
            <p>
              사용자가 지금 보고 싶은 것은 마지막으로 입력한 검색어의
              결과입니다. 응답을 받았다는 사실과 그 응답을 화면에 반영해도
              되는지는 따로 판단해야 합니다.
            </p>
          </section>
          <section
            id={`${id}-1`}
            ref={(node) => {
              sectionRefs.current[1] = node;
            }}
          >
            <h4 tabIndex={-1}>{headings[1]}</h4>
            <p>
              요청을 시작할 때 번호를 하나씩 올립니다. 응답을 받으면 자신의
              번호가 마지막 번호와 같은지 확인합니다.
            </p>
            <div className="sc-code">
              <div className="sc-code-head">
                <span>검색 요청 예제</span>
                <button
                  type="button"
                  className="sc-text-button"
                  onClick={() => void copy()}
                >
                  코드 복사
                </button>
              </div>
              <pre>
                <code>
                  {expanded ? code : code.split("\n").slice(0, 5).join("\n")}
                </code>
              </pre>
              <button
                type="button"
                className="sc-text-button"
                aria-expanded={expanded}
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? "코드 접기" : "전체 코드 보기"}
              </button>
              <ScreenStatus>{copyStatus}</ScreenStatus>
            </div>
            <p>
              번호가 다르면 오래된 응답입니다. 이 응답은 화면을 갱신하지 않고
              끝냅니다. 마지막 요청이 실패했을 때에도 이전 결과가 새 결과인
              것처럼 나타나지 않습니다.
            </p>
          </section>
          <section
            id={`${id}-2`}
            ref={(node) => {
              sectionRefs.current[2] = node;
            }}
          >
            <h4 tabIndex={-1}>{headings[2]}</h4>
            <p>
              번호를 확인하는 지점은 데이터를 화면에 반영하기 직전입니다. 중간에
              다른 비동기 처리가 있다면 그 처리가 끝난 뒤에도 마지막 요청인지
              확인해야 합니다.
            </p>
            <details>
              <summary>요청을 취소하는 것만으로 충분할까요?</summary>
              <p>
                취소할 수 있는 요청은 취소하면 불필요한 일을 줄일 수 있습니다.
                취소가 전달되기 전에 완료된 응답도 있으므로 결과를 반영하는
                시점의 확인은 그대로 둡니다.
              </p>
            </details>
            <p>
              로딩과 오류도 같은 기준으로 처리합니다. 오래된 요청의 완료가 현재
              요청의 로딩 표시를 지우지 않도록, 상태를 바꿀 권한을 마지막 요청에
              둡니다.
            </p>
          </section>
          <footer className="sc-related">
            <h4>함께 읽을 글</h4>
            <details>
              <summary>검색이 실패했을 때 이전 결과를 남겨도 될까요?</summary>
              <p>
                이전 결과와 새 오류를 구분해 보여주고, 사용자가 같은 검색을 다시
                시도할 수 있게 합니다.
              </p>
            </details>
          </footer>
        </article>
      </div>
      {progress > 10 && (
        <button
          type="button"
          className="mfd-button sc-to-top"
          onClick={() => {
            if (scrollRef.current) scrollRef.current.scrollTop = 0;
            setActive(0);
            setProgress(0);
          }}
        >
          맨 위로
        </button>
      )}
    </ScreenFrame>
  );
}
