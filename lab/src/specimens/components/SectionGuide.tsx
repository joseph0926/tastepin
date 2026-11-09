import { useId, useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { useSpecimenScroll } from "./blogScroll";
import "./Blog.css";

const sections = [
  {
    title: "조건이 두 곳에 생겼다",
    text: "검색창은 입력값을 기억하고 주소는 마지막 검색 조건을 기억했습니다. 두 값이 언제 같아져야 하는지부터 정해야 했습니다.",
  },
  {
    title: "주소를 기준으로 삼기",
    text: "검색을 실행하면 주소를 바꾸고, 목록은 주소에서 읽은 조건을 사용합니다. 뒤로 가기도 같은 경로를 따릅니다.",
  },
  {
    title: "입력 중인 값 분리하기",
    text: "아직 실행하지 않은 검색어는 입력창에만 남깁니다. 입력을 마친 시점과 결과를 바꾸는 시점이 분리됩니다.",
  },
  {
    title: "다시 열어 확인하기",
    text: "링크를 복사해 새 창에서 열었습니다. 뒤로 가기와 새로고침에서도 같은 조건이 남는지 확인했습니다.",
  },
];

export default function SectionGuide({ params }: SpecimenProps) {
  const [current, setCurrent] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const prefix = useId();
  const { move, stop } = useSpecimenScroll(boxRef);
  const radius = params.neighbors === "one" ? 1 : 3;

  const sync = () => {
    const box = boxRef.current;
    if (!box) return;
    const line = box.getBoundingClientRect().top + 96;
    const advance = params.trigger === "near" ? 140 : 0;
    let next = 0;
    sectionRefs.current.forEach((section, index) => {
      if (section && section.getBoundingClientRect().top <= line + advance)
        next = index;
    });
    setCurrent(next);
  };

  const goTo = (index: number) => {
    const box = boxRef.current;
    const section = sectionRefs.current[index];
    if (box && section)
      move(
        box.scrollTop +
          section.getBoundingClientRect().top -
          box.getBoundingClientRect().top -
          96,
      );
  };

  useDemo((tick) => {
    const box = boxRef.current;
    if (box)
      move(
        tick % 5 === 0
          ? 0
          : ((box.scrollHeight - box.clientHeight) * (tick % 5)) / 4,
      );
  });

  return (
    <div className="blog-sample section-guide">
      <div
        ref={boxRef}
        className="section-scroll"
        role="region"
        aria-label="현재 절 안내를 비교할 글"
        tabIndex={0}
        onScroll={sync}
        onWheel={stop}
        onPointerDown={stop}
        onTouchStart={stop}
        onKeyDown={stop}
      >
        <div className="section-current">
          {params.mobile === "count" && (
            <span className="blog-meta">
              {current + 1}/{sections.length}
            </span>
          )}
          <b>{sections[current].title}</b>
        </div>
        <div className="section-layout">
          <nav className="section-nav" aria-label="이 글의 흐름">
            {sections.map((section, index) => (
              <button
                key={section.title}
                type="button"
                className="section-link"
                aria-current={index === current ? "location" : undefined}
                hidden={Math.abs(index - current) > radius}
                onClick={() => goTo(index)}
              >
                {section.title}
              </button>
            ))}
          </nav>
          <article>
            {sections.map((section, index) => (
              <section
                key={section.title}
                id={`${prefix}-${index}`}
                ref={(element) => {
                  sectionRefs.current[index] = element;
                }}
              >
                <h3>{section.title}</h3>
                <p>{section.text}</p>
                <p>
                  한 번의 성공으로 동작을 단정하지 않고, 다른 조건에서도 같은
                  흐름을 따라가는지 살펴봅니다.
                </p>
              </section>
            ))}
          </article>
        </div>
      </div>
      <p className="blog-meta">
        글 안을 스크롤하거나 절 이름을 눌러 이동하세요.
      </p>
    </div>
  );
}
