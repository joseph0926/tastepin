import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type Transition } from "motion/react";
import {
  Check,
  CircleAlert,
  FileText,
  RotateCw,
  Upload as UploadIcon,
} from "lucide-react";
import { EASE_OUT_CUBIC, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Upload.css";

// params: drop(zone | tone | button), progress(bar | ring | fill), done(check | quiet | summary), error(inline | icon | banner)
// 실제로 파일을 올리지 않고 진행을 흉내 낸다. 같이 재생은 끌고 오기, 놓기, 진행 지켜보기, 실패한 파일 다시 시도, 처음으로를 한다.

interface Item {
  id: number;
  name: string;
  size: string;
  ms: number;
  failAt?: number;
  progress: number;
  state: "uploading" | "done" | "failed";
}

const batch: Omit<Item, "id" | "progress" | "state">[] = [
  { name: "회의록_10월.pdf", size: "1.2MB", ms: 1200 },
  { name: "현장사진_원본.zip", size: "48MB", ms: 2600, failAt: 55 },
  { name: "견적서.xlsx", size: "340KB", ms: 800 },
];
const REASON = "20MB보다 큰 파일은 올릴 수 없어요";
const TICK_MS = 50;
const SUMMARY_MS = 4000;

const demoSteps = [
  "drag",
  "drop",
  "watch",
  "watch",
  "retry",
  "watch",
  "watch",
  "reset",
] as const;

export default function Upload({ params }: SpecimenProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState(false);
  const nextId = useRef(1);
  const seconds = useSeconds();
  const { drop, progress, done, error } = params;
  const uploading = items.some((item) => item.state === "uploading");

  // 진행 흉내: 파일마다 정해진 시간에 100%가 되고, failAt이 있으면 그 지점에서 실패한다
  useEffect(() => {
    if (!uploading) return;
    const timer = window.setInterval(() => {
      setItems((current) =>
        current.map((item) => {
          if (item.state !== "uploading") return item;
          const next =
            item.progress + (100 * TICK_MS) / (seconds(item.ms) * 1000);
          if (item.failAt !== undefined && next >= item.failAt)
            return { ...item, progress: item.failAt, state: "failed" };
          return next >= 100
            ? { ...item, progress: 100, state: "done" }
            : { ...item, progress: next };
        }),
      );
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [uploading, seconds]);

  // 모아서 한 줄: 올리는 중인 파일이 없어지면 성공한 수를 4초 동안 보인다
  const succeeded = items.filter((item) => item.state === "done").length;
  useEffect(() => {
    if (done !== "summary" || uploading || succeeded === 0) return;
    setSummary(true);
    const timer = window.setTimeout(
      () => setSummary(false),
      seconds(SUMMARY_MS) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [done, uploading, succeeded, seconds]);

  const add = () => {
    setDragging(false);
    setItems((current) => [
      ...current,
      ...batch.map((file) => ({
        ...file,
        id: nextId.current++,
        progress: 0,
        state: "uploading" as const,
      })),
    ]);
  };
  // 다시 시도하면 원본 대신 줄인 파일을 올린다고 보고 성공시킨다
  const retry = (id: number) =>
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              failAt: undefined,
              progress: 0,
              state: "uploading",
              ms: 1400,
              size: "18MB",
            }
          : item,
      ),
    );
  const failed = items.filter((item) => item.state === "failed");

  useDemo((tick) => {
    const step = demoSteps[(tick - 1) % demoSteps.length];
    if (step === "drag") setDragging(true);
    if (step === "drop") add();
    if (step === "retry") failed.forEach((item) => retry(item.id));
    if (step === "reset") {
      setItems([]);
      setSummary(false);
      setDragging(false);
    }
  });

  const quick = { duration: seconds(160), ease: EASE_OUT_CUBIC };
  const dropHandlers = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      add();
    },
  };

  return (
    <div
      className="upl-page"
      data-drop={drop}
      data-progress={progress}
      data-error={error}
      {...dropHandlers}
    >
      <h3>첨부 파일</h3>

      {drop === "button" ? (
        <div>
          <button type="button" className="upl-button" onClick={add}>
            <UploadIcon size={16} strokeWidth={1.75} aria-hidden />
            파일 올리기
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={dragging ? "upl-zone is-over" : "upl-zone"}
          onClick={add}
        >
          <UploadIcon size={18} strokeWidth={1.75} aria-hidden />
          <span>
            끌어다 놓거나 <u>파일 고르기</u>
          </span>
        </button>
      )}

      <div className="upl-notes" aria-live="polite">
        <AnimatePresence initial={false}>
          {summary && (
            <motion.p
              key="summary"
              className="upl-summary"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={quick}
            >
              <Check size={16} strokeWidth={2} aria-hidden />
              {succeeded}개를 올렸어요
            </motion.p>
          )}
          {error === "banner" && failed.length > 0 && (
            <motion.p
              key="banner"
              className="upl-banner"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={quick}
            >
              {failed.length}개를 올리지 못했어요. {REASON}
              <button
                type="button"
                onClick={() => failed.forEach((item) => retry(item.id))}
              >
                다시 시도
              </button>
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="upl-area">
        <ul className="upl-list">
          {items.map((item) => (
            <li key={item.id} className={`upl-item is-${item.state}`}>
              {progress === "fill" && item.state === "uploading" && (
                <span
                  className="upl-fill"
                  style={{ width: `${item.progress}%` }}
                  aria-hidden="true"
                />
              )}
              <div className="upl-row">
                <FileText size={16} strokeWidth={1.75} aria-hidden />
                <span className="upl-name">{item.name}</span>
                <span className="upl-end">
                  <Status
                    item={item}
                    progress={progress}
                    done={done}
                    error={error}
                    quick={quick}
                    onRetry={() => retry(item.id)}
                  />
                </span>
              </div>
              {progress === "bar" && item.state === "uploading" && (
                <span
                  className="upl-bar"
                  role="progressbar"
                  aria-valuenow={Math.round(item.progress)}
                  aria-label={`${item.name} 올리는 중`}
                >
                  <span style={{ width: `${item.progress}%` }} />
                </span>
              )}
              {error === "inline" && item.state === "failed" && (
                <p className="upl-reason">
                  {REASON}
                  <button type="button" onClick={() => retry(item.id)}>
                    다시 시도
                  </button>
                </p>
              )}
            </li>
          ))}
        </ul>
        {drop === "button" && dragging && (
          <div className="upl-overlay" aria-hidden="true">
            여기에 놓으세요
          </div>
        )}
      </div>
    </div>
  );
}

function Status({
  item,
  progress,
  done,
  error,
  quick,
  onRetry,
}: {
  item: Item;
  progress: string;
  done: string;
  error: string;
  quick: Transition;
  onRetry: () => void;
}) {
  if (item.state === "failed") {
    if (error === "icon")
      return (
        <span className="upl-failed">
          <CircleAlert
            size={16}
            strokeWidth={1.75}
            aria-label={REASON}
            role="img"
          />
          <button
            type="button"
            className="upl-icon-button"
            aria-label="다시 시도"
            title={REASON}
            onClick={onRetry}
          >
            <RotateCw size={15} strokeWidth={1.75} />
          </button>
        </span>
      );
    return <span className="upl-size">{item.size}</span>;
  }
  if (item.state === "uploading") {
    if (progress === "bar")
      return <span className="upl-percent">{Math.round(item.progress)}%</span>;
    if (progress === "ring") {
      const r = 6;
      const length = 2 * Math.PI * r;
      return (
        <svg
          className="upl-ring"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          role="progressbar"
          aria-valuenow={Math.round(item.progress)}
        >
          <circle cx="8" cy="8" r={r} className="upl-ring-track" />
          <circle
            cx="8"
            cy="8"
            r={r}
            className="upl-ring-value"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - item.progress / 100)}
          />
        </svg>
      );
    }
    return null;
  }
  return (
    <span className="upl-done">
      <AnimatePresence initial={false}>
        {done === "check" && (
          <motion.span
            key="check"
            className="upl-check"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={quick}
          >
            <Check
              size={16}
              strokeWidth={2}
              aria-label="다 올렸어요"
              role="img"
            />
          </motion.span>
        )}
      </AnimatePresence>
      <span className="upl-size">{item.size}</span>
    </span>
  );
}
