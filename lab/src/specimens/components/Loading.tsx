import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LoaderCircle, RotateCw } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Loading.css";

// params: kind(skeleton | spinner | bar), pulse(shimmer | breathe | still), reveal(fade | stagger | instant), delay(always | defer)
// 같이 재생은 느린 로딩(1.4초)과 빠른 로딩(0.25초)을 번갈아 보여 준다. 로딩 자리는 내용과 같은 높이로 잡아 두어 아래가 밀리지 않는다.

const rows = [
  ["김하늘", "디자인", "오늘 09:12"],
  ["이도윤", "개발", "오늘 08:40"],
  ["박서윤", "운영", "어제 18:05"],
  ["최민준", "개발", "어제 16:31"],
];
const SLOW_MS = 1400;
const FAST_MS = 250;
const DEFER_MS = 300;
const MIN_SHOWN_MS = 400;

type Phase = "waiting" | "loading" | "done";

export default function Loading({ params }: SpecimenProps) {
  const [phase, setPhase] = useState<Phase>("done");
  const [round, setRound] = useState(0);
  const timers = useRef<number[]>([]);
  const seconds = useSeconds();
  const { kind, pulse, reveal, delay } = params;

  const clear = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };
  useEffect(() => clear, []);

  const after = (ms: number, run: () => void) =>
    timers.current.push(window.setTimeout(run, seconds(ms) * 1000));

  // 새 내용이 도착하면 목록을 다시 그려 등장 방식을 보여 준다
  const finish = () => {
    setRound((value) => value + 1);
    setPhase("done");
  };

  const load = (ms: number) => {
    clear();
    if (delay === "defer") {
      // 늦을 때만: 기다리는 동안 이전 내용을 그대로 두고, 300ms 안에 끝나면 표시 없이 바로 새 내용을 보인다.
      // 표시가 나오면 최소 400ms는 유지해 깜빡이지 않게 한다
      setPhase("waiting");
      if (ms <= DEFER_MS) {
        after(ms, finish);
      } else {
        after(DEFER_MS, () => setPhase("loading"));
        after(Math.max(ms, DEFER_MS + MIN_SHOWN_MS), finish);
      }
    } else {
      setPhase("loading");
      after(ms, finish);
    }
  };

  // 시연 순서: 느린 로딩, 기다림, 빠른 로딩, 기다림
  useDemo((tick) => {
    const step = (tick - 1) % 4;
    if (step === 0) load(SLOW_MS);
    if (step === 2) load(FAST_MS);
  });

  const fade = { duration: seconds(200), ease: EASE_OUT };

  return (
    <div
      className="ld-page"
      data-kind={kind}
      data-pulse={pulse}
      // CSS 반복 애니메이션도 느리게 보기 배수를 따른다
      style={
        {
          "--ld-shimmer": `${seconds(1400)}s`,
          "--ld-breathe": `${seconds(1600)}s`,
          "--ld-spin": `${seconds(900)}s`,
          "--ld-flow": `${seconds(1200)}s`,
        } as CSSProperties
      }
    >
      <div className="ld-head">
        <div>
          <h3>최근 접속</h3>
          <p>팀원 4명</p>
        </div>
        <div className="ld-reloads">
          <button
            type="button"
            className="ld-button"
            onClick={() => load(SLOW_MS)}
          >
            <RotateCw size={15} strokeWidth={1.75} aria-hidden />
            느리게
          </button>
          <button
            type="button"
            className="ld-button"
            onClick={() => load(FAST_MS)}
          >
            빠르게
          </button>
        </div>
      </div>

      <div className="ld-area" aria-busy={phase !== "done"}>
        {phase === "loading" && kind === "bar" && (
          <div className="ld-bar" role="progressbar" aria-label="불러오는 중">
            <span />
          </div>
        )}
        <AnimatePresence initial={false}>
          {phase === "loading" && kind !== "bar" && (
            <motion.div
              key="placeholder"
              className="ld-layer"
              exit={{ opacity: 0, transition: { duration: 0 } }}
            >
              {kind === "skeleton" ? (
                <ul className="ld-rows" aria-hidden="true">
                  {rows.map(([name]) => (
                    <li key={name} className="ld-skeleton-row">
                      <span className="ld-bone is-avatar" />
                      <span className="ld-bone is-name" />
                      <span className="ld-bone is-meta" />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="ld-spinner" role="status">
                  <LoaderCircle size={20} strokeWidth={1.75} aria-hidden />
                  불러오는 중
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {phase !== "loading" && (
          <motion.ul
            key={round}
            className="ld-rows ld-layer"
            initial={reveal === "fade" ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={fade}
          >
            {rows.map(([name, team, time], index) => (
              <motion.li
                key={name}
                initial={reveal === "stagger" ? { opacity: 0, y: 4 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...fade, delay: seconds(40 * index) }}
              >
                <span className="ld-avatar" aria-hidden="true">
                  {name[0]}
                </span>
                <b>{name}</b>
                <span>{team}</span>
                <span className="ld-time">{time}</span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </div>
    </div>
  );
}
