import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  type TargetAndTransition,
  type Transition,
} from "motion/react";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import { useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./MotionFeel.css";

// params: curve(cubic | quint | expo), tempo(quick | medium | relaxed), enter(scale | rise | blur)
// 컴포넌트 하나가 아니라 화면 전체 모션의 곡선, 속도, 등장 모양을 비교하는 전역 시편이다.
// 새 카드 등장, 기존 카드의 자리 이동, 필터 패널 열고 닫기가 모두 같은 값을 쓴다.

// animations.dev 강의가 쓰는 ease-out 계열 곡선 표(Benjamin De Cock)에서 약한 것부터 세 개
const CURVES = {
  cubic: [0.215, 0.61, 0.355, 1],
  quint: [0.23, 1, 0.32, 1],
  expo: [0.19, 1, 0.22, 1],
} as const;

const TEMPOS: Record<string, { move: number; exit: number }> = {
  // 퇴장은 전역 '반응과 퇴장'에서 고른 대로 등장과 같은 길이다
  quick: { move: 160, exit: 160 },
  medium: { move: 220, exit: 220 },
  relaxed: { move: 280, exit: 280 },
};

const ENTERS: Record<
  string,
  { from: TargetAndTransition; exit: TargetAndTransition }
> = {
  scale: {
    from: { opacity: 0, scale: 0.95 },
    exit: { opacity: 0, scale: 0.95 },
  },
  rise: {
    from: { opacity: 0, y: 8 },
    exit: { opacity: 0, y: 8 },
  },
  blur: {
    from: { opacity: 0, scale: 0.97, filter: "blur(4px)" },
    exit: { opacity: 0, scale: 0.97, filter: "blur(4px)" },
  },
};

const SETTLED = { opacity: 1, scale: 1, y: 0 };
// blur 값이 아닐 때 filter를 남기면 쓸데없이 합성 레이어가 생기므로 blur 등장에만 붙인다
const settledFor = (enter: string) =>
  enter === "blur" ? { ...SETTLED, filter: "blur(0px)" } : SETTLED;

const incoming = [
  { title: "디자인 리뷰 요청", meta: "박서윤, 방금" },
  { title: "배포 승인 요청", meta: "이도윤, 방금" },
  { title: "문서 검토 요청", meta: "최민준, 방금" },
  { title: "권한 변경 요청", meta: "정하은, 방금" },
];

const initialCards = [
  { id: 1, title: "아이콘 교체 검토", meta: "정하은, 1시간 전" },
  { id: 2, title: "색 토큰 정리", meta: "최민준, 어제" },
];

// 시연 순서: 카드 추가, 필터 열기, 필터 닫기, 카드 추가
const DEMO_LENGTH = 4;
const MAX_CARDS = 4;

export default function MotionFeel({ params }: SpecimenProps) {
  const seconds = useSeconds();
  const [cards, setCards] = useState(initialCards);
  const [filterOpen, setFilterOpen] = useState(false);
  const nextId = useRef(initialCards.length + 1);

  const tempo = TEMPOS[params.tempo] ?? TEMPOS.medium;
  const enter = ENTERS[params.enter] ?? ENTERS.scale;
  const curve = CURVES[params.curve as keyof typeof CURVES] ?? CURVES.cubic;
  const timing = (ms: number): Transition => ({
    duration: seconds(ms),
    ease: [...curve],
  });

  const addCard = () => {
    const id = nextId.current++;
    const source = incoming[(id - 1) % incoming.length];
    setCards((current) => [{ id, ...source }, ...current].slice(0, MAX_CARDS));
  };

  useDemo((tick) => {
    const step = (tick - 1) % DEMO_LENGTH;
    if (step === 0 || step === 3) addCard();
    if (step === 1) setFilterOpen(true);
    if (step === 2) setFilterOpen(false);
  });

  return (
    <div className="mfl">
      <header className="mfl-head">
        <h3>받은 요청</h3>
        <div className="mfl-actions">
          <button
            type="button"
            className="mfl-button"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((open) => !open)}
          >
            <SlidersHorizontal
              size={15}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            필터
          </button>
          <button
            type="button"
            className="mfl-button mfl-primary"
            onClick={addCard}
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            요청 받기
          </button>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {filterOpen && (
          <motion.div
            key="filter"
            className="mfl-filter"
            initial={enter.from}
            animate={{
              ...settledFor(params.enter),
              transition: timing(tempo.move),
            }}
            exit={{ ...enter.exit, transition: timing(tempo.exit) }}
          >
            <span>상태</span>
            <div className="mfl-chips">
              <span className="mfl-chip" data-on="true">
                대기
              </span>
              <span className="mfl-chip">진행 중</span>
              <span className="mfl-chip">완료</span>
            </div>
            <button
              type="button"
              className="mfl-close"
              aria-label="필터 닫기"
              onClick={() => setFilterOpen(false)}
            >
              <X size={15} strokeWidth={1.75} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.ul
        layout="position"
        className="mfl-list"
        transition={timing(tempo.move)}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {cards.map((card) => (
            <motion.li
              key={card.id}
              layout="position"
              className="mfl-card"
              initial={enter.from}
              animate={{
                ...settledFor(params.enter),
                transition: timing(tempo.move),
              }}
              exit={{ ...enter.exit, transition: timing(tempo.exit) }}
              transition={timing(tempo.move)}
            >
              <b>{card.title}</b>
              <span>{card.meta}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}
