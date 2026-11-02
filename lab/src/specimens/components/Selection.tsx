import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Selection.css";

// params: check(draw | press | instant), row(tint | bar | plain), bulk(dock | header)

const tasks = [
  { id: "t1", title: "3분기 정산 자료 검토", due: "오늘" },
  { id: "t2", title: "신규 입사자 계정 만들기", due: "내일" },
  { id: "t3", title: "디자인 리뷰 일정 잡기", due: "10월 14일" },
  { id: "t4", title: "결제 실패 고객 연락", due: "10월 15일" },
  { id: "t5", title: "사내 공지 초안 쓰기", due: "10월 17일" },
];

// 시연 순서: 1, 3, 4번을 차례로 고른 뒤 같은 순서로 해제한다
const demoSteps = ["t1", "t3", "t4", "t1", "t3", "t4"];

function CheckBox({ checked, kind }: { checked: boolean; kind: string }) {
  const seconds = useSeconds();
  const instant = kind === "instant";

  return (
    <motion.span
      className={`sel-box${checked ? " is-checked" : ""}`}
      aria-hidden="true"
      animate={
        kind === "press" && checked ? { scale: [1, 0.86, 1] } : { scale: 1 }
      }
      transition={{ duration: seconds(160), ease: EASE_OUT }}
      style={{
        transitionDuration: instant ? "0ms" : `${seconds(120) * 1000}ms`,
      }}
    >
      <svg viewBox="0 0 16 16">
        <motion.path
          d="M3.5 8.4 6.6 11.4 12.5 4.8"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={
            kind === "draw"
              ? { duration: seconds(checked ? 140 : 100), ease: EASE_OUT }
              : { duration: 0 }
          }
        />
      </svg>
    </motion.span>
  );
}

function Count({ value }: { value: number }) {
  const seconds = useSeconds();
  return (
    <span className="sel-count">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: seconds(140), ease: EASE_OUT }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function BulkActions() {
  return (
    <span className="sel-actions">
      <button type="button" className="sel-action">
        보관
      </button>
      <button type="button" className="sel-action is-danger">
        삭제
      </button>
    </span>
  );
}

export default function Selection({ params }: SpecimenProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const seconds = useSeconds();
  const count = selected.size;
  const fade = { duration: seconds(150), ease: EASE_OUT };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useDemo((tick) => toggle(demoSteps[(tick - 1) % demoSteps.length]));

  return (
    <div className={`sel row-${params.row}`}>
      <div className="sel-header">
        {params.bulk === "header" ? (
          <AnimatePresence initial={false}>
            {count === 0 ? (
              <motion.span
                key="title"
                className="sel-header-layer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fade}
              >
                할 일 {tasks.length}개
              </motion.span>
            ) : (
              <motion.span
                key="bulk"
                className="sel-header-layer is-bulk"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fade}
              >
                <span>
                  <Count value={count} />개 선택됨
                </span>
                <BulkActions />
              </motion.span>
            )}
          </AnimatePresence>
        ) : (
          <span className="sel-header-layer">할 일 {tasks.length}개</span>
        )}
      </div>

      <ul className="sel-list" role="list">
        {tasks.map((task) => {
          const checked = selected.has(task.id);
          return (
            <li key={task.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                className={`sel-row${checked ? " is-selected" : ""}`}
                onClick={() => toggle(task.id)}
                style={{ transitionDuration: `${seconds(120) * 1000}ms` }}
              >
                {params.row === "bar" && (
                  <motion.span
                    className="sel-bar"
                    aria-hidden="true"
                    initial={false}
                    animate={{ scaleY: checked ? 1 : 0 }}
                    transition={{ duration: seconds(140), ease: EASE_OUT }}
                  />
                )}
                <CheckBox checked={checked} kind={params.check} />
                <span className="sel-title">{task.title}</span>
                <span className="sel-due">{task.due}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {params.bulk === "dock" && (
        <div className="sel-dock-slot">
          <AnimatePresence initial={false}>
            {count > 0 && (
              <motion.div
                className="sel-dock"
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 8, opacity: 0 }}
                transition={{ duration: seconds(180), ease: EASE_OUT }}
              >
                <span>
                  <Count value={count} />개 선택됨
                </span>
                <BulkActions />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
