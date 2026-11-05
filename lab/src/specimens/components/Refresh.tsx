import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Refresh.css";

// params: pending(keep | dim | skeleton), change(instant | fade | mark), fail(inline | replace | toast)
// 실제로 요청하지 않고 조회를 흉내 낸다. 처음으로 돌아간 뒤 '중요' 탭을 처음 불러올 때만 실패한다.
// 같이 재생은 탭 바꿈, 새 목록 보기, 다른 탭으로 바꿈(실패), 실패 알림 보기, 다시 시도, 새 목록 보기, 처음으로를 한다.

type Tab = "today" | "week" | "starred";
type Status = "idle" | "loading" | "failed";

const tabs: { id: Tab; label: string }[] = [
  { id: "today", label: "오늘" },
  { id: "week", label: "이번 주" },
  { id: "starred", label: "중요" },
];

const tasks = {
  groceries: { title: "장보기 목록 정리", due: "오늘", done: true },
  reading: { title: "회의 자료 읽기", due: "오늘", done: false },
  reply: { title: "메일 답장 보내기", due: "오늘", done: false },
  plants: { title: "화분에 물 주기", due: "오늘", done: false },
  plan: { title: "다음 주 계획 세우기", due: "금", done: false },
  backup: { title: "사진 백업하기", due: "토", done: false },
  desk: { title: "책상 정리", due: "일", done: true },
  bills: { title: "공과금 내기", due: "목", done: false },
  workout: { title: "운동 30분", due: "수", done: false },
};
type TaskId = keyof typeof tasks;

// 탭끼리 일부 행이 겹치고 일부는 새로 나타나 '새 행만 표시'에서 차이가 보인다
const lists: Record<Tab, TaskId[]> = {
  today: ["groceries", "reading", "reply", "plants"],
  week: ["reading", "reply", "plan", "backup", "desk"],
  starred: ["reply", "bills", "plan", "workout"],
};
const FAILING_TAB: Tab = "starred";
const LOOKUP_MS = 650;
const FADE_MS = 120;
const MARK_MS = 600;
const TOAST_MS = 4000;

const demoSteps: { tab?: Tab; retry?: true; reset?: true }[] = [
  { tab: "week" },
  {},
  { tab: "starred" },
  {},
  { retry: true },
  {},
  { reset: true },
];

interface Shown {
  tab: Tab;
  // 바로 앞에 보이던 목록의 탭. 이번 목록에서 새로 나타난 행을 고를 때 쓴다
  from: Tab | null;
  // 새 목록이 도착할 때마다 오른다. 목록을 다시 그려 교차와 강조를 다시 보인다
  round: number;
}

const initialShown: Shown = { tab: "today", from: null, round: 0 };

export default function Refresh({ params }: SpecimenProps) {
  const [tab, setTab] = useState<Tab>("today");
  const [shown, setShown] = useState<Shown>(initialShown);
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<number | undefined>(undefined);
  // 탭을 다시 바꾸거나 처음으로 돌아간 뒤 도착한 조회 결과를 버리기 위한 번호
  const request = useRef(0);
  const failureServed = useRef(false);
  const seconds = useSeconds();
  const { pending, change, fail } = params;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // 토스트는 4초 뒤 닫히고, 실패한 동안 남겨 둔 이전 목록이 그대로 이어진다
  useEffect(() => {
    if (status !== "failed" || fail !== "toast") return;
    const expire = window.setTimeout(
      () => setStatus("idle"),
      seconds(TOAST_MS) * 1000,
    );
    return () => window.clearTimeout(expire);
  }, [status, fail, seconds]);

  const load = (next: Tab) => {
    window.clearTimeout(timer.current);
    const current = ++request.current;
    setTab(next);
    setStatus("loading");
    timer.current = window.setTimeout(
      () => {
        if (current !== request.current) return;
        if (next === FAILING_TAB && !failureServed.current) {
          failureServed.current = true;
          setStatus("failed");
          return;
        }
        setShown((previous) => ({
          tab: next,
          from: previous.tab,
          round: previous.round + 1,
        }));
        setStatus("idle");
      },
      seconds(LOOKUP_MS) * 1000,
    );
  };

  // 고른 탭을 다시 누르면 무시한다. 실패해서 이전 목록이 남아 있을 때만 다시 불러온다
  const select = (next: Tab) => {
    if (next === tab && (status === "loading" || shown.tab === next)) return;
    load(next);
  };

  const retry = () => load(tab);

  const reset = () => {
    window.clearTimeout(timer.current);
    request.current++;
    failureServed.current = false;
    setTab(initialShown.tab);
    setShown((previous) => ({ ...initialShown, round: previous.round + 1 }));
    setStatus("idle");
  };

  useDemo((tick) => {
    const step = demoSteps[(tick - 1) % demoSteps.length];
    if (step.reset) reset();
    if (step.tab) load(step.tab);
    if (step.retry) retry();
  });

  const loading = status === "loading";
  const failed = status === "failed";
  const rows = lists[shown.tab];
  const previousRows = shown.from ? lists[shown.from] : rows;
  const freshRows =
    change === "mark" ? rows.filter((id) => !previousRows.includes(id)) : [];
  const dimmed = loading && pending === "dim";
  const skeleton = loading && pending === "skeleton";
  const replaced = failed && fail === "replace";
  // 목록은 새 목록이 올 때만 다시 그린다. 스켈레톤과 실패 화면 동안에는 숨겨만 두어 새 행 강조가 다시 돌지 않는다
  const listTiming = {
    duration: change === "fade" ? seconds(FADE_MS) : 0,
    ease: EASE_OUT,
  };
  // 스켈레톤은 새 목록과 교차하며 걷히고, 실패로 끝나면 바로 걷힌다
  const skeletonExit = (duration: number) => ({
    opacity: 0,
    transition: { duration, ease: EASE_OUT },
  });
  const skeletonExitMs = change === "fade" && status === "idle" ? FADE_MS : 0;
  const toastTiming = { duration: seconds(200), ease: EASE_OUT };

  return (
    <div
      className="rfr-page"
      style={
        {
          "--rfr-flow": `${seconds(1200)}s`,
          "--rfr-mark": `${seconds(MARK_MS)}s`,
        } as CSSProperties
      }
    >
      <h3>할 일</h3>
      <div className="rfr-tabs" role="group" aria-label="목록 범위">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className="rfr-tab"
            aria-pressed={tab === item.id}
            onClick={() => select(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="rfr-slot" aria-live="polite">
        {loading && pending === "keep" && (
          <div className="rfr-bar" role="progressbar" aria-label="불러오는 중">
            <span />
          </div>
        )}
        {failed && fail === "inline" && (
          <p className="rfr-inline" role="alert">
            <span>불러오지 못했어요</span>
            <button type="button" className="rfr-link" onClick={retry}>
              다시 시도
            </button>
          </p>
        )}
      </div>

      <div className="rfr-area" aria-busy={loading}>
        <AnimatePresence initial={false}>
          <motion.div
            key={shown.round}
            className={
              skeleton || replaced ? "rfr-layer is-hidden" : "rfr-layer"
            }
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={listTiming}
          >
            <ul
              className={dimmed ? "rfr-list is-dim" : "rfr-list"}
              inert={dimmed}
            >
              {rows.map((id) => (
                <li
                  key={id}
                  className={
                    freshRows.includes(id) ? "rfr-row is-fresh" : "rfr-row"
                  }
                >
                  <label className="rfr-task">
                    <input type="checkbox" defaultChecked={tasks[id].done} />
                    <span className="rfr-title">{tasks[id].title}</span>
                  </label>
                  <span className="rfr-due">{tasks[id].due}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
        <AnimatePresence custom={seconds(skeletonExitMs)}>
          {skeleton && (
            <motion.ul
              key="skeleton"
              className="rfr-list rfr-layer"
              aria-hidden="true"
              initial={false}
              variants={{ exit: skeletonExit }}
              exit="exit"
            >
              {rows.map((id) => (
                <li key={id} className="rfr-row">
                  <span className="rfr-bone is-check" />
                  <span className="rfr-bone is-title" />
                  <span className="rfr-bone is-due" />
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
        {replaced && (
          <div className="rfr-replace" role="alert">
            <p>불러오지 못했어요</p>
            <button type="button" className="rfr-retry" onClick={retry}>
              다시 시도
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {failed && fail === "toast" && (
          <motion.div
            key="toast"
            className="rfr-toast"
            role="alert"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={toastTiming}
          >
            <CircleAlert
              className="rfr-toast-icon"
              size={18}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="rfr-toast-text">불러오지 못했어요</span>
            <button type="button" className="rfr-toast-retry" onClick={retry}>
              다시 시도
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
