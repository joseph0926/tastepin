import { useRef, useState } from "react";
import { AnimatePresence, motion, type Transition } from "motion/react";
import { ChevronDown, Plus, X } from "lucide-react";
import { useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./MotionSpring.css";

// params: physics(tween | spring), bounce(none | soft | playful), sizing(same | small)
// bounce와 sizing은 physics가 spring일 때만 쓴다. 지각 길이는 모든 값에서 250ms로 같다.
// sizing이 small이면 태그와 화살표처럼 작은 요소만 bounce에 0.15를 더한다.
// 태그가 빠질 때 남은 태그가 자리를 메우는 움직임, 고급 설정 영역의 높이 변화가 같은 값을 쓴다.

const PERCEIVED_MS = 250;
const QUINT = [0.23, 1, 0.32, 1] as const;
const BOUNCE: Record<string, number> = { none: 0, soft: 0.15, playful: 0.3 };
const SMALL_EXTRA = 0.15;

const pool = ["디자인", "프론트엔드", "접근성", "모션", "문서", "리뷰"];

// 시연 순서: 둘째 태그 빼기, 고급 설정 펼치기, 태그 더하기, 고급 설정 접기
const DEMO_LENGTH = 4;

export default function MotionSpring({ params }: SpecimenProps) {
  const seconds = useSeconds();
  const [tags, setTags] = useState(() =>
    pool.slice(0, 4).map((label, index) => ({ id: index + 1, label })),
  );
  const [open, setOpen] = useState(false);
  const nextId = useRef(5);

  const transitionFor = (extra: number): Transition =>
    params.physics === "spring"
      ? {
          type: "spring",
          visualDuration: seconds(PERCEIVED_MS),
          bounce: (BOUNCE[params.bounce] ?? 0) + extra,
        }
      : { duration: seconds(PERCEIVED_MS), ease: [...QUINT] };
  // 펼쳐지는 영역처럼 큰 요소는 고른 탄성을 그대로 쓴다
  const timing = transitionFor(0);
  const small = transitionFor(params.sizing === "small" ? SMALL_EXTRA : 0);

  const remove = (id: number) =>
    setTags((current) => current.filter((tag) => tag.id !== id));
  const add = () => {
    const id = nextId.current++;
    setTags((current) => [
      ...current,
      { id, label: pool[(id - 1) % pool.length] },
    ]);
  };

  useDemo((tick) => {
    const step = (tick - 1) % DEMO_LENGTH;
    if (step === 0 && tags[1]) remove(tags[1].id);
    if (step === 1) setOpen(true);
    if (step === 2) add();
    if (step === 3) setOpen(false);
  });

  return (
    <div className="msp">
      <h3>프로젝트 태그</h3>
      <ul className="msp-tags">
        <AnimatePresence initial={false} mode="popLayout">
          {tags.map((tag) => (
            <motion.li
              key={tag.id}
              layout
              className="msp-tag"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={small}
            >
              {tag.label}
              <button
                type="button"
                className="msp-remove"
                aria-label={`${tag.label} 태그 빼기`}
                onClick={() => remove(tag.id)}
              >
                <X size={13} strokeWidth={2} />
              </button>
            </motion.li>
          ))}
          <motion.li key="add" layout transition={small}>
            <button type="button" className="msp-add" onClick={add}>
              <Plus size={13} strokeWidth={2} aria-hidden="true" />
              태그
            </button>
          </motion.li>
        </AnimatePresence>
      </ul>

      <section className="msp-more">
        <button
          type="button"
          className="msp-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          고급 설정
          <motion.span
            className="msp-chevron"
            animate={{ rotate: open ? 180 : 0 }}
            transition={small}
          >
            <ChevronDown size={16} strokeWidth={1.75} />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="body"
              className="msp-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={timing}
            >
              <div className="msp-body-inner">
                <p>
                  태그를 바꾸면 이 프로젝트를 구독한 사람에게 알림이 갑니다.
                </p>
                <label>
                  <input type="checkbox" defaultChecked /> 변경을 기록에 남기기
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
