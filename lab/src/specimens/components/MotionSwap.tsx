import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  type Transition,
  type Variants,
} from "motion/react";
import { Check, Link2 } from "lucide-react";
import { EASE_OUT_CUBIC, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./MotionSwap.css";

// params: travel(fade | near | far), blur(none | light | heavy), overlap(cross | wait), icon(quarter | half)
// 여러 단계 폼에서 내용이 바뀌는 상태 전환을 비교하는 전역 시편이다. 앞으로 가면 새 내용이 오른쪽에서,
// 뒤로 가면 왼쪽에서 온다. 틀의 높이는 내용 높이를 재서 같은 곡선으로 따라간다.
// icon은 머리의 링크 복사 버튼이 체크로 바뀔 때 아이콘이 얼마나 작은 데서 커지는지다. 흐림은 blur 값을 같이 쓴다.

const QUINT = [0.23, 1, 0.32, 1] as const;
const SWAP_MS = 240;
const ICON_MS = 200;
const COPIED_MS = 1400;
const ICON_SCALE: Record<string, number> = { quarter: 0.25, half: 0.5 };

const TRAVEL: Record<string, (direction: number) => number | string> = {
  fade: () => 0,
  near: (direction) => 24 * direction,
  far: (direction) => `${110 * direction}%`,
};
const BLUR: Record<string, string> = {
  none: "",
  light: "blur(2px)",
  heavy: "blur(4px)",
};

// 라디오 이름이 무대끼리 겹치면 한 무대의 선택이 다른 무대를 지우므로 무대마다 이름을 받는다
const stepsFor = (group: string) => [
  {
    title: "프로젝트 이름",
    body: (
      <label className="msw-field">
        <span>이름</span>
        <input defaultValue="디자인 시스템 2027" />
      </label>
    ),
  },
  {
    title: "공개 범위",
    body: (
      <div className="msw-options">
        <label>
          <input type="radio" name={group} defaultChecked /> 팀 안에서만
        </label>
        <label>
          <input type="radio" name={group} /> 조직 전체
        </label>
        <label>
          <input type="radio" name={group} /> 링크가 있는 사람
        </label>
      </div>
    ),
  },
  {
    title: "확인",
    body: (
      <p className="msw-summary">
        디자인 시스템 2027을 팀 안에서만 공개합니다. 나중에 설정에서 바꿀 수
        있어요.
      </p>
    ),
  },
];

const STEP_COUNT = 3;

// 시연 순서: 다음, 다음, 링크 복사, 이전, 이전
const DEMO_LENGTH = 5;

export default function MotionSwap({ params }: SpecimenProps) {
  const seconds = useSeconds();
  const [[step, direction], setStep] = useState<[number, number]>([0, 1]);
  const [height, setHeight] = useState<number | "auto">("auto");
  const innerRef = useRef<HTMLDivElement>(null);
  const steps = stepsFor(useId());
  const [copied, setCopied] = useState(0);

  const travel = TRAVEL[params.travel] ?? TRAVEL.near;
  const blur = BLUR[params.blur] ?? "";
  const timing: Transition = { duration: seconds(SWAP_MS), ease: [...QUINT] };
  // wait는 나가는 내용이 끝난 뒤 들어오므로 전체 길이가 두 배가 되지 않게 반씩 쓴다
  const phase: Transition =
    params.overlap === "wait"
      ? { duration: seconds(SWAP_MS / 2), ease: [...QUINT] }
      : timing;

  // 흐림이 없는 값에서는 filter를 아예 두지 않아 합성 레이어를 만들지 않는다
  const blurred = blur ? { filter: blur } : {};
  const sharp = blur ? { filter: "blur(0px)" } : {};
  const variants: Variants = {
    enter: (d: number) => ({ x: travel(d), opacity: 0, ...blurred }),
    center: { x: 0, opacity: 1, ...sharp, transition: phase },
    exit: (d: number) => ({
      x: travel(-d),
      opacity: 0,
      ...blurred,
      transition: phase,
    }),
  };

  // 내용 높이를 재서 틀이 같은 곡선으로 따라가게 한다. 첫 측정 전에는 auto로 둔다
  useLayoutEffect(() => {
    const element = innerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.contentRect.height),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 복사할 때마다 값이 바뀌어 체크가 다시 1.4초 머문다
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(
      () => setCopied(0),
      seconds(COPIED_MS) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [copied, seconds]);

  const iconScale = ICON_SCALE[params.icon] ?? ICON_SCALE.half;
  const iconTiming: Transition = {
    duration: seconds(ICON_MS),
    ease: [...EASE_OUT_CUBIC],
  };
  const iconHidden = { opacity: 0, scale: iconScale, ...blurred };

  const go = (delta: number) =>
    setStep(([current]) => {
      const next = Math.min(STEP_COUNT - 1, Math.max(0, current + delta));
      return next === current ? [current, delta] : [next, delta];
    });

  useDemo((tick) => {
    const index = (tick - 1) % DEMO_LENGTH;
    if (index === 2) setCopied(tick);
    else go(index < 2 ? 1 : -1);
  });

  return (
    <div className="msw">
      <header className="msw-head">
        <h3>새 프로젝트</h3>
        <span className="msw-count">
          {step + 1} / {STEP_COUNT}
        </span>
        <button
          type="button"
          className="msw-copy"
          aria-label={copied ? "링크를 복사했어요" : "링크 복사"}
          onClick={() => setCopied(Date.now())}
        >
          {/* 두 아이콘이 같은 칸에 겹쳐 나가고 들어온다. 바깥 칸 크기는 바뀌지 않는다 */}
          <AnimatePresence initial={false}>
            <motion.span
              key={copied ? "check" : "link"}
              className="msw-copy-icon"
              initial={iconHidden}
              animate={{ opacity: 1, scale: 1, ...sharp }}
              exit={iconHidden}
              transition={iconTiming}
            >
              {copied ? (
                <Check size={16} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Link2 size={16} strokeWidth={1.75} aria-hidden="true" />
              )}
            </motion.span>
          </AnimatePresence>
        </button>
      </header>

      <motion.div
        className="msw-frame"
        animate={{ height }}
        transition={timing}
      >
        <div ref={innerRef}>
          <AnimatePresence
            initial={false}
            mode={params.overlap === "wait" ? "wait" : "popLayout"}
            custom={direction}
          >
            <motion.section
              key={step}
              className="msw-step"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <h4>{steps[step].title}</h4>
              {steps[step].body}
            </motion.section>
          </AnimatePresence>
        </div>
      </motion.div>

      <footer className="msw-actions">
        <button
          type="button"
          className="msw-button"
          disabled={step === 0}
          onClick={() => go(-1)}
        >
          이전
        </button>
        <button
          type="button"
          className="msw-button msw-primary"
          disabled={step === STEP_COUNT - 1}
          onClick={() => go(1)}
        >
          다음
        </button>
      </footer>
    </div>
  );
}
