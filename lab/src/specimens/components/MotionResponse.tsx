import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useSpring,
  useTransform,
  type TargetAndTransition,
} from "motion/react";
import { Bell, X } from "lucide-react";
import { EASE_OUT, SpeedContext, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./MotionResponse.css";

// params: press(subtle | standard | firm), exit(mirror | quicker | brief), stagger(together | short | long),
// count(instant | roll | tally)
// 버튼 누름 반응, 항목 퇴장, 여러 항목 등장 간격을 비교하는 전역 시편이다.
// 등장은 모든 값에서 같다(220ms, 아래 8px에서 올라옴).

const PRESS_SCALE: Record<string, number> = {
  subtle: 0.98,
  standard: 0.97,
  firm: 0.95,
};
const PRESS_MS = 120;

const ENTER_MS = 220;
const ENTER_FROM = { opacity: 0, y: 8 };

const EXITS: Record<string, { to: TargetAndTransition; ms: number }> = {
  mirror: { to: { opacity: 0, y: 8 }, ms: 220 },
  quicker: { to: { opacity: 0, y: 8 }, ms: 176 },
  brief: { to: { opacity: 0, y: 4 }, ms: 110 },
};

const STAGGER_MS: Record<string, number> = { together: 0, short: 40, long: 80 };

const batch = [
  "새 댓글 2개가 달렸어요",
  "배포가 끝났어요",
  "리뷰 요청이 왔어요",
];
const MAX_ITEMS = 5;

const QUINT = [0.23, 1, 0.32, 1] as const;
const ROLL_MS = 200;
// 강의의 숫자 보간 예시 값. 느리게 보기에서는 감쇠비를 지키며 시간만 늘린다(강성 1/배수², 감쇠 1/배수)
const TALLY_STIFFNESS = 185;
const TALLY_DAMPING = 25;

function RollingCount({ value }: { value: number }) {
  const seconds = useSeconds();
  const previous = useRef(value);
  const direction = value >= previous.current ? 1 : -1;
  useEffect(() => {
    previous.current = value;
  }, [value]);
  return (
    <span className="mrs-roll">
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.span
          key={value}
          custom={direction}
          variants={{
            enter: (d: number) => ({ y: 10 * d, opacity: 0 }),
            center: { y: 0, opacity: 1 },
            exit: (d: number) => ({ y: -10 * d, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: seconds(ROLL_MS), ease: [...QUINT] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function TallyCount({ value }: { value: number }) {
  const speed = useContext(SpeedContext);
  const spring = useSpring(value, {
    stiffness: TALLY_STIFFNESS / (speed * speed),
    damping: TALLY_DAMPING / speed,
  });
  const shown = useTransform(spring, (latest) => Math.round(latest));
  useEffect(() => {
    spring.set(value);
  }, [spring, value]);
  return <motion.span>{shown}</motion.span>;
}

function Count({ value, mode }: { value: number; mode: string }) {
  if (mode === "roll") return <RollingCount value={value} />;
  if (mode === "tally") return <TallyCount value={value} />;
  return <span>{value}</span>;
}

interface Item {
  id: number;
  text: string;
  order: number;
}

// 시연 순서: 알림 받기, 맨 위 알림 닫기, 모두 지우기, 알림 받기
const DEMO_LENGTH = 4;

function PressButton({
  id,
  pressed,
  scale,
  className,
  label,
  onClick,
  children,
}: {
  id: string;
  pressed: string | null;
  scale: number;
  className: string;
  label?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const seconds = useSeconds();
  return (
    <motion.button
      type="button"
      className={className}
      aria-label={label}
      onClick={onClick}
      // 같이 재생은 실제 누름 대신 pressed로 같은 줄어듦을 보여 준다
      animate={{ scale: pressed === id ? scale : 1 }}
      whileTap={{ scale }}
      transition={{ duration: seconds(PRESS_MS), ease: EASE_OUT }}
    >
      {children}
    </motion.button>
  );
}

export default function MotionResponse({ params }: SpecimenProps) {
  const seconds = useSeconds();
  const [items, setItems] = useState<Item[]>([]);
  const [pressed, setPressed] = useState<string | null>(null);
  const nextId = useRef(1);

  const scale = PRESS_SCALE[params.press] ?? PRESS_SCALE.standard;
  const exit = EXITS[params.exit] ?? EXITS.mirror;
  const stagger = STAGGER_MS[params.stagger] ?? 0;

  const receive = () => {
    const added = batch.map((text, order) => ({
      id: nextId.current++,
      text,
      order,
    }));
    setItems((current) => [...added, ...current].slice(0, MAX_ITEMS));
  };
  const dismiss = (id: number) =>
    setItems((current) => current.filter((item) => item.id !== id));
  const clear = () => setItems([]);

  const pressFor = (id: string, action: () => void) => {
    setPressed(id);
    window.setTimeout(
      () => {
        setPressed(null);
        action();
      },
      seconds(PRESS_MS) * 1000,
    );
  };

  useDemo((tick) => {
    const step = (tick - 1) % DEMO_LENGTH;
    if (step === 0 || step === 3) pressFor("receive", receive);
    if (step === 1 && items[0])
      pressFor(`dismiss-${items[0].id}`, () => dismiss(items[0].id));
    if (step === 2) pressFor("clear", clear);
  });

  return (
    <div className="mrs">
      <header className="mrs-head">
        <h3>
          알림{" "}
          <span className="mrs-count">
            <Count value={items.length} mode={params.count} />
          </span>
        </h3>
        <div className="mrs-actions">
          <PressButton
            id="clear"
            pressed={pressed}
            scale={scale}
            className="mrs-button"
            onClick={clear}
          >
            모두 지우기
          </PressButton>
          <PressButton
            id="receive"
            pressed={pressed}
            scale={scale}
            className="mrs-button mrs-primary"
            onClick={receive}
          >
            <Bell size={15} strokeWidth={1.75} aria-hidden="true" />
            알림 받기
          </PressButton>
        </div>
      </header>

      <ul className="mrs-list" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.id}
              layout="position"
              className="mrs-item"
              initial={ENTER_FROM}
              animate={{
                opacity: 1,
                y: 0,
                transition: {
                  duration: seconds(ENTER_MS),
                  ease: EASE_OUT,
                  delay: seconds(item.order * stagger),
                },
              }}
              exit={{
                ...exit.to,
                transition: { duration: seconds(exit.ms), ease: EASE_OUT },
              }}
              transition={{ duration: seconds(ENTER_MS), ease: EASE_OUT }}
            >
              <span>{item.text}</span>
              <PressButton
                id={`dismiss-${item.id}`}
                pressed={pressed}
                scale={scale}
                className="mrs-dismiss"
                label="알림 닫기"
                onClick={() => dismiss(item.id)}
              >
                <X size={15} strokeWidth={1.75} />
              </PressButton>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
