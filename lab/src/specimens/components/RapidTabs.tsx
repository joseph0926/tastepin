import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { EASE_OUT_CUBIC, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./SpecimenExtensions.css";

const tabs = [
  {
    label: "개요",
    content:
      "진행 중인 프로젝트는 6개입니다. 이번 주에 두 건의 검토를 마칠 예정입니다.",
  },
  {
    label: "활동",
    content: "박서윤 님이 디자인 시스템의 버튼 예제를 수정했습니다.",
  },
  { label: "멤버", content: "박서윤, 최민준, 정하은 님이 참여하고 있습니다." },
  {
    label: "설정",
    content: "멤버만 볼 수 있습니다. 변경 사항은 주간 요약으로 받습니다.",
  },
];

export default function RapidTabs({ params }: SpecimenProps) {
  const [active, setActive] = useState(0);
  const timers = useRef<number[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const seconds = useSeconds();
  const reduced = useReducedMotion();
  const cancel = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };
  useEffect(
    () => () => timers.current.forEach((timer) => window.clearTimeout(timer)),
    [],
  );
  const select = (index: number) => {
    cancel();
    setActive(index);
  };
  const burst = () => {
    cancel();
    setActive(0);
    timers.current = [3, 1, 2].map((index, position) =>
      window.setTimeout(
        () => setActive(index),
        seconds(80 * (position + 1)) * 1000,
      ),
    );
  };
  useDemo((tick) => {
    if (tick % 3 === 1) burst();
    else select(tick % 3 === 2 ? 3 : 0);
  });
  const instant = params.interrupt === "instant" || reduced;
  return (
    <div className="sx-stage" ref={rootRef}>
      <h3>워크스페이스</h3>
      <div
        className="sx-rapid-tabs"
        role="tablist"
        aria-label="워크스페이스"
        onKeyDown={(event) => {
          const targets: Record<string, number> = {
            ArrowRight: (active + 1) % tabs.length,
            ArrowLeft: (active + tabs.length - 1) % tabs.length,
            Home: 0,
            End: tabs.length - 1,
          };
          if (!(event.key in targets)) return;
          event.preventDefault();
          select(targets[event.key]);
          rootRef.current
            ?.querySelectorAll<HTMLElement>('[role="tab"]')
            [targets[event.key]]?.focus();
        }}
      >
        <motion.span
          className="sx-rapid-indicator"
          aria-hidden
          initial={false}
          animate={{ x: `${active * 100}%` }}
          transition={{
            duration: instant ? 0 : seconds(220),
            ease: EASE_OUT_CUBIC,
          }}
        />
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            id={`${id}-${index}`}
            aria-selected={active === index}
            aria-controls={`${id}-panel`}
            tabIndex={active === index ? 0 : -1}
            onClick={() => select(index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${active}`}
        tabIndex={0}
        className="sx-tab-panel"
      >
        <h4>{tabs[active].label}</h4>
        <p>{tabs[active].content}</p>
      </div>
      <button type="button" className="mfd-button" onClick={burst}>
        연속으로 선택하기
      </button>
    </div>
  );
}
