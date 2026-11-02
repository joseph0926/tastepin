import { useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Tabs.css";

// params: indicator(underline | pill | weight), travel(slide | fade | instant), panel(fade | slide | instant)
// travel은 indicator가 weight이면 쓰지 않는다

const tabs = [
  { id: "overview", label: "개요" },
  { id: "activity", label: "활동" },
  { id: "members", label: "멤버" },
  { id: "settings", label: "설정" },
];

function Panel({ tab }: { tab: string }) {
  if (tab === "overview") {
    return (
      <div className="tabs-panel-body">
        <p>
          디자인 시스템 워크스페이스입니다. 이번 달에 컴포넌트 12개를 새로
          정리했고 리뷰 대기 중인 변경이 3건 있습니다.
        </p>
        <dl className="tabs-stats">
          <div>
            <dt>컴포넌트</dt>
            <dd>148</dd>
          </div>
          <div>
            <dt>리뷰 대기</dt>
            <dd>3</dd>
          </div>
          <div>
            <dt>이번 주 배포</dt>
            <dd>5</dd>
          </div>
        </dl>
      </div>
    );
  }
  if (tab === "activity") {
    return (
      <ul className="tabs-panel-body tabs-rows">
        <li>
          <b>박서윤</b>님이 버튼 크기 토큰을 바꿨어요<span>10분 전</span>
        </li>
        <li>
          <b>이도윤</b>님이 표 컴포넌트를 리뷰 요청했어요<span>1시간 전</span>
        </li>
        <li>
          <b>최민준</b>님이 다크 모드 색을 정리했어요<span>어제</span>
        </li>
        <li>
          <b>정하은</b>님이 아이콘 32개를 추가했어요<span>2일 전</span>
        </li>
      </ul>
    );
  }
  if (tab === "members") {
    return (
      <ul className="tabs-panel-body tabs-rows">
        <li>
          <b>박서윤</b>관리자<span>디자인</span>
        </li>
        <li>
          <b>이도윤</b>편집자<span>프론트엔드</span>
        </li>
      </ul>
    );
  }
  return (
    <ul className="tabs-panel-body tabs-rows">
      <li>
        <b>공개 범위</b>조직 전체<span>변경</span>
      </li>
      <li>
        <b>리뷰 필수</b>두 명 승인<span>변경</span>
      </li>
      <li>
        <b>알림</b>배포할 때만<span>변경</span>
      </li>
    </ul>
  );
}

export default function Tabs({ params }: SpecimenProps) {
  const [active, setActive] = useState(tabs[0].id);
  const [direction, setDirection] = useState(1);
  const [height, setHeight] = useState<number | "auto">("auto");
  const contentRef = useRef<HTMLDivElement>(null);
  const seconds = useSeconds();
  const baseId = useId();
  const { indicator, travel, panel } = params;

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.borderBoxSize[0].blockSize),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const select = (id: string) => {
    const from = tabs.findIndex((tab) => tab.id === active);
    const to = tabs.findIndex((tab) => tab.id === id);
    setDirection(to >= from ? 1 : -1);
    setActive(id);
  };

  useDemo((tick) => select(tabs[tick % tabs.length].id));

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    const next = tabs[targets[event.key]];
    select(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  };

  const panelVariants = {
    fade: {
      enter: { opacity: 0 },
      center: { opacity: 1 },
      exit: { opacity: 0 },
    },
    slide: {
      enter: (dir: number) => ({ opacity: 0, x: dir * 12 }),
      center: { opacity: 1, x: 0 },
      exit: (dir: number) => ({ opacity: 0, x: dir * -12 }),
    },
    instant: { enter: {}, center: {}, exit: {} },
  }[panel];
  const panelDuration = { fade: 120, slide: 180 }[panel] ?? 0;

  return (
    <div className={`tabs indicator-${indicator}`}>
      <div
        className="tabs-list"
        role="tablist"
        aria-label="워크스페이스"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              className="tabs-tab"
              onClick={() => select(tab.id)}
            >
              {selected && indicator !== "weight" && (
                <motion.span
                  className="tabs-indicator"
                  layoutId={
                    travel === "slide" ? `${baseId}-indicator` : undefined
                  }
                  initial={travel === "fade" ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: seconds(travel === "fade" ? 120 : 200),
                    ease: EASE_OUT,
                  }}
                />
              )}
              <span className="tabs-label">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <motion.div
        className="tabs-viewport"
        animate={{ height }}
        transition={{
          duration: panel === "instant" ? 0 : seconds(200),
          ease: EASE_OUT,
        }}
      >
        <div
          ref={contentRef}
          id={`${baseId}-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${active}`}
          className="tabs-content"
        >
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={active}
              custom={direction}
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: seconds(panelDuration), ease: EASE_OUT }}
            >
              <Panel tab={active} />
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
