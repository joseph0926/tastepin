import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";

// 모션 기본값의 곡선(ease-out-cubic)
export const EASE = [0.215, 0.61, 0.355, 1] as const;

export interface Option {
  id: string;
  label: string;
}

// 고른 항목 아래 2px 밑줄이 한 노드로 미끄러져 옮겨 간다
export function Segmented({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  function onKeyDown(event: KeyboardEvent) {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step || disabled) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.id === value);
    const next = options[(index + step + options.length) % options.length];
    onChange(next.id);
    document.getElementById(`${id}-${next.id}`)?.focus();
  }
  return (
    <div
      className="seg"
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            id={`${id}-${option.id}`}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            className={active ? "seg-option is-active" : "seg-option"}
            onClick={() => onChange(option.id)}
          >
            {option.label}
            {active && (
              <motion.span
                className="seg-thumb"
                layoutId={`${id}-thumb`}
                transition={{ duration: 0.2, ease: EASE }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export type Tone = "done" | "waiting" | "neutral";

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="study-badge" data-tone={tone}>
      <span className="study-badge-dot" aria-hidden />
      {children}
    </span>
  );
}

export type Notice =
  | { kind: "done"; id: number; text: string }
  | { kind: "failed"; id: number; text: string };

const DONE_DWELL_MS = 4000;

export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    if (notice?.kind !== "done") return;
    const timer = window.setTimeout(() => setNotice(null), DONE_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return {
    notice,
    show: (kind: Notice["kind"], text: string) =>
      setNotice({ kind, text, id: ++sequence.current }),
    clear: () => setNotice(null),
  };
}

// 버튼 옆 한 줄. 성공은 잠시 머물다 사라지고 실패는 다시 시도할 때까지 남는다
export function StatusSlot({
  notice,
  children,
}: {
  notice: Notice | null;
  children?: ReactNode;
}) {
  return (
    <div className="study-status" role="status">
      <AnimatePresence initial={false} mode="popLayout">
        {notice && (
          <motion.span
            key={notice.id}
            className={
              notice.kind === "failed"
                ? "study-status-text is-failed"
                : "study-status-text"
            }
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.16, ease: EASE }}
          >
            <span className="study-status-line">{notice.text}</span>
            {notice.kind === "failed" && children}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
