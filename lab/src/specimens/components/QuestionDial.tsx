import { useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { useSpecimenScroll } from "./blogScroll";
import "./Blog.css";

const questions = [
  "검색 조건은 어디에 두어야 할까?",
  "같은 요청을 다시 보내도 괜찮을까?",
  "테스트가 실패했다는 사실만으로 버그를 찾았다고 말할 수 있을까?",
  "화면이 느리면 무엇부터 재야 할까?",
  "코드를 나누는 기준은 무엇일까?",
];
const distances: Record<string, number> = {
  short: 0.35,
  regular: 0.5,
  long: 0.8,
};

export default function QuestionDial({ params }: SpecimenProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [position, setPosition] = useState(0);
  const [heights, setHeights] = useState<number[]>(questions.map(() => 80));
  const reduced = useReducedMotion();
  const { move, stop } = useSpecimenScroll(boxRef);
  const distance = distances[params.distance] ?? 0.5;
  const current = Math.round(position);
  const scaleFalloff = params.scale === "strong" ? 0.22 : 0.1;
  const opacityFalloff = params.fade === "strong" ? 0.34 : 0.16;
  const centers = heights.map(
    (height, index) =>
      heights.slice(0, index).reduce((sum, value) => sum + value + 16, 0) +
      height / 2,
  );
  const lower = Math.floor(position);
  const offset =
    centers[lower] +
    (centers[Math.min(lower + 1, questions.length - 1)] - centers[lower]) *
      (position - lower);

  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      setHeights(itemRefs.current.map((item) => item?.offsetHeight ?? 80));
    });
    itemRefs.current.forEach((item) => {
      if (item) observer.observe(item);
    });
    return () => observer.disconnect();
  }, []);

  const sync = () => {
    const box = boxRef.current;
    if (box)
      setPosition(
        Math.min(
          questions.length - 1,
          Math.max(0, box.scrollTop / (box.clientHeight * distance)),
        ),
      );
  };
  const select = (index: number) => {
    const box = boxRef.current;
    if (reduced) setPosition(index);
    else if (box) move(index * box.clientHeight * distance);
  };
  // 같은 거리를 움직여야 항목당 스크롤 거리의 차이가 같이 재생에서도 보인다.
  useDemo((tick) => {
    const box = boxRef.current;
    if (reduced) select(tick % questions.length);
    else if (box) move(box.clientHeight * 0.4 * (tick % 9));
  });

  return (
    <div
      className="blog-sample question-sample"
      data-reduced={Boolean(reduced)}
    >
      <p className="blog-meta">
        질문 {current + 1}/{questions.length}
      </p>
      <div
        ref={boxRef}
        className="question-scroll"
        role="region"
        aria-label="스크롤로 넘기는 질문"
        tabIndex={0}
        onScroll={sync}
        onWheel={stop}
        onPointerDown={stop}
        onTouchStart={stop}
        onKeyDown={(event) => {
          stop();
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            select(
              Math.max(
                0,
                Math.min(
                  questions.length - 1,
                  current + (event.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          }
        }}
      >
        <div
          className="question-track"
          style={
            reduced
              ? undefined
              : { height: `${100 + (questions.length - 1) * distance * 100}%` }
          }
        >
          <div className="question-stage">
            <div
              className="question-items"
              style={
                reduced ? undefined : { transform: `translateY(${-offset}px)` }
              }
            >
              {questions.map((question, index) => {
                const away = Math.abs(index - position);
                return (
                  <button
                    key={question}
                    type="button"
                    ref={(element) => {
                      itemRefs.current[index] = element;
                    }}
                    aria-current={index === current ? "true" : undefined}
                    onClick={() => select(index)}
                    onFocus={() => select(index)}
                    style={
                      reduced
                        ? undefined
                        : {
                            transform: `scale(${Math.max(0.5, 1 - away * scaleFalloff)})`,
                            opacity: Math.max(0.18, 1 - away * opacityFalloff),
                          }
                    }
                  >
                    {question}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="question-controls">
        <button
          type="button"
          className="blog-button"
          disabled={current === 0}
          onClick={() => select(Math.max(0, current - 1))}
        >
          이전 질문
        </button>
        <button
          type="button"
          className="blog-button"
          disabled={current === questions.length - 1}
          onClick={() => select(Math.min(questions.length - 1, current + 1))}
        >
          다음 질문
        </button>
      </div>
    </div>
  );
}
