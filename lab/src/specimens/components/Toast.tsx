import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Toast.css";

// params: place(bottom | corner | top), stack(pile | list | replace), enter(edge | fade), tempo(brisk | smooth)
// tempo는 enter가 edge일 때만 쓴다. smooth는 Sonner의 400ms ease를 300ms 상한에 맞춘 값이다.
// 무대 안에 갇혀 보이도록 무대 기준 absolute로 그린다. 실제 화면에서는 viewport 기준 fixed로 둔다.

const messages = [
  "이름을 저장했어요",
  "프로필 사진을 바꿨어요",
  "알림 설정을 저장했어요",
  "소개 글을 저장했어요",
];
const MAX_TOASTS = 3;
const LIFETIME_MS = 4000;
const EASE = [0.25, 0.1, 0.25, 1] as const;

interface ToastItem {
  id: number;
  text: string;
}

export default function Toast({ params }: SpecimenProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const seconds = useSeconds();
  const { place, stack, enter, tempo } = params;
  // 위에 놓이면 위 가장자리에서, 아래에 놓이면 아래 가장자리에서 들어온다
  const edge = place === "top" ? -1 : 1;

  const push = () => {
    const id = nextId.current++;
    const text = messages[(id - 1) % messages.length];
    setToasts((current) => {
      const kept = stack === "replace" ? [] : current.slice(-(MAX_TOASTS - 1));
      return [...kept, { id, text }];
    });
  };

  const dismiss = (id: number) =>
    setToasts((current) => current.filter((toast) => toast.id !== id));

  useDemo((tick) => {
    if (tick % 4 !== 0) push();
  });

  const newestId = toasts.at(-1)?.id;
  useEffect(() => {
    if (newestId === undefined) return;
    const timer = window.setTimeout(
      () => dismiss(newestId),
      seconds(LIFETIME_MS) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [newestId, seconds]);

  const enterFrom =
    enter === "edge"
      ? { opacity: 0, y: 16 * edge }
      : { opacity: 0, scale: 0.98 };
  const exitTo =
    enter === "edge"
      ? { opacity: 0, y: 16 * edge }
      : { opacity: 0, scale: 0.98 };
  const smooth = enter === "edge" && tempo === "smooth";
  const timing = {
    duration: seconds(enter === "edge" ? (smooth ? 300 : 200) : 160),
    ease: smooth ? EASE : EASE_OUT,
  };

  // 최신 알림이 가장자리 쪽에 온다. 위에 놓이면 최신이 맨 위, 아래에 놓이면 맨 아래
  const ordered = place === "top" ? [...toasts].reverse() : toasts;

  return (
    <div className="tst-page">
      <div className="tst-form">
        <h3>프로필</h3>
        <label>
          <span>이름</span>
          <input defaultValue="김하늘" />
        </label>
        <label>
          <span>소개</span>
          <input defaultValue="디자인 시스템을 만들고 있어요" />
        </label>
        <div>
          <button type="button" className="tst-save" onClick={push}>
            저장
          </button>
        </div>
      </div>

      <ol
        className={`tst-region place-${place} stack-${stack}`}
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {ordered.map((toast) => {
            const depth = toasts.length - 1 - toasts.indexOf(toast);
            const pile = stack === "pile";
            return (
              <motion.li
                key={toast.id}
                layout={stack === "list" ? "position" : false}
                className="tst-toast"
                style={{ zIndex: MAX_TOASTS - depth }}
                initial={enterFrom}
                animate={{
                  opacity: pile && depth > 0 ? 1 - depth * 0.25 : 1,
                  y: pile ? -8 * depth * edge : 0,
                  scale: pile ? 1 - depth * 0.06 : 1,
                  transition: timing,
                }}
                exit={{
                  ...exitTo,
                  // 퇴장은 등장과 같은 길이다
                  transition: timing,
                }}
                transition={timing}
              >
                <CheckCircle2
                  className="tst-icon"
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="tst-text">{toast.text}</span>
                <button
                  type="button"
                  className="tst-undo"
                  onClick={() => dismiss(toast.id)}
                >
                  되돌리기
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </div>
  );
}
