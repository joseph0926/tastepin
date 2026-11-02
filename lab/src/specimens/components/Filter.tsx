import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, FileText, X } from "lucide-react";
import { EASE_OUT_CUBIC, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Filter.css";

// params: entry(chips | panel), apply(instant | button | count), applied(chips | inline | summary), facet(count | dim | none)
// 값 목록은 드롭다운 시편의 값(버튼에서 펼쳐짐 140ms)으로 열고, 목록 바뀜은 검색 시편의 값(빠진 행이 접힘 180ms)으로 고정한다.
// 실제 화면에서는 팝오버와 포커스 관리를 프로젝트의 프리미티브에 맡기고 모양과 동작 값만 옮긴다.

type Key = "status" | "owner";
type Picked = Record<Key, string[]>;

const conditions: { key: Key; label: string; values: string[] }[] = [
  { key: "status", label: "상태", values: ["진행 중", "검토 중", "완료"] },
  { key: "owner", label: "담당", values: ["나", "김하늘", "이도윤"] },
];

// 진행 중인 일에는 이도윤 담당이 없어, 상태를 고른 뒤 담당을 열면 0건인 값이 생긴다
const tasks = [
  { id: "t1", name: "디자인 시스템 정리", status: "진행 중", owner: "김하늘" },
  { id: "t2", name: "10월 예산안", status: "검토 중", owner: "나" },
  { id: "t3", name: "신규 입사자 안내", status: "완료", owner: "이도윤" },
  { id: "t4", name: "분기 보고서 초안", status: "진행 중", owner: "나" },
  { id: "t5", name: "디자인 리뷰 회의록", status: "완료", owner: "김하늘" },
  { id: "t6", name: "고객 인터뷰 정리", status: "검토 중", owner: "이도윤" },
  { id: "t7", name: "릴리스 노트", status: "진행 중", owner: "나" },
];

// Filter.css의 .flt-popover 폭과 같아야 한다
const POPOVER_WIDTH = 220;

const none: Picked = { status: [], owner: [] };

function matches(picked: Picked, task: (typeof tasks)[number], skip?: Key) {
  return conditions.every(
    ({ key }) =>
      key === skip || !picked[key].length || picked[key].includes(task[key]),
  );
}

function toggled(picked: Picked, key: Key, value: string): Picked {
  const list = picked[key];
  return {
    ...picked,
    [key]: list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value],
  };
}

const pickedValues = (picked: Picked) =>
  conditions.flatMap(({ key }) => picked[key].map((value) => ({ key, value })));

export default function Filter({ params }: SpecimenProps) {
  const { entry, apply, applied: appliedLook, facet } = params;
  const deferred = apply !== "instant";
  const [applied, setApplied] = useState<Picked>(none);
  // 적용 버튼이 있는 값에서 값 목록 안에서만 바뀌는 사본. 열 때 적용된 값으로 시작한다
  const [draft, setDraft] = useState<Picked>(none);
  const [open, setOpen] = useState<Key | "all" | null>(null);
  const [byUser, setByUser] = useState(false);
  // 값 목록은 연 칩 아래에 두되 무대 오른쪽을 넘지 않게 연 순간의 칩 위치로 정한다
  const [popoverLeft, setPopoverLeft] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const seconds = useSeconds();

  const editing = deferred ? draft : applied;
  const results = tasks.filter((task) => matches(applied, task));
  const draftCount = tasks.filter((task) => matches(draft, task)).length;
  const scopes =
    open === "all" ? conditions : conditions.filter((c) => c.key === open);

  const show = (target: Key | "all", user: boolean) => {
    const toolbar = toolbarRef.current;
    const trigger = toolbar?.querySelector<HTMLElement>(
      `[data-target="${target}"]`,
    );
    if (toolbar && trigger) {
      const room = toolbar.clientWidth - POPOVER_WIDTH;
      setPopoverLeft(Math.max(0, Math.min(trigger.offsetLeft, room)));
    }
    setByUser(user);
    setDraft(applied);
    setOpen(target);
  };
  const close = () => setOpen(null);
  const pick = (key: Key, value: string) => {
    if (deferred) setDraft((current) => toggled(current, key, value));
    else setApplied((current) => toggled(current, key, value));
  };
  const commit = () => {
    setApplied(draft);
    close();
  };
  const reset = () => {
    const keys = scopes.map(({ key }) => key);
    const cleared = (picked: Picked) => ({
      status: keys.includes("status") ? [] : picked.status,
      owner: keys.includes("owner") ? [] : picked.owner,
    });
    if (deferred) setDraft(cleared);
    else setApplied(cleared);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // 시연으로 열 때는 초점을 옮기지 않는다. 직접 열 때는 화면 밖 스크롤을 막고 첫 값으로 옮긴다
  useEffect(() => {
    if (open && byUser)
      popoverRef.current
        ?.querySelector<HTMLInputElement>("input:not(:disabled)")
        ?.focus({ preventScroll: true });
  }, [open, byUser]);

  // 시연 순서: 상태 열기, 진행 중 고르기, 반영, 담당 열기, 나 고르고 반영, 모두 지우기
  useDemo((tick) => {
    const step = (tick - 1) % 6;
    const panel = entry === "panel";
    if (step === 0) show(panel ? "all" : "status", false);
    if (step === 1) pick("status", "진행 중");
    if (step === 2) (deferred ? commit : close)();
    if (step === 3) show(panel ? "all" : "owner", false);
    if (step === 4) {
      if (deferred) {
        setApplied(toggled(draft, "owner", "나"));
        close();
      } else {
        pick("owner", "나");
        close();
      }
    }
    if (step === 5) {
      setApplied(none);
      close();
    }
  });

  const quick = { duration: seconds(180), ease: EASE_OUT_CUBIC };
  const popoverTiming = { duration: seconds(140), ease: EASE_OUT_CUBIC };
  const activeValues = pickedValues(applied);

  const triggerLabel = (target: Key | "all") => {
    if (appliedLook !== "inline") {
      return target === "all"
        ? "필터"
        : conditions.find((c) => c.key === target)!.label;
    }
    if (target === "all") {
      return activeValues.length ? `필터 ${activeValues.length}` : "필터";
    }
    const condition = conditions.find((c) => c.key === target)!;
    const list = applied[target];
    if (!list.length) return condition.label;
    return `${condition.label}: ${list[0]}${list.length > 1 ? ` 외 ${list.length - 1}` : ""}`;
  };
  const triggerActive = (target: Key | "all") =>
    appliedLook === "inline" &&
    (target === "all" ? activeValues.length > 0 : applied[target].length > 0);

  const triggers: (Key | "all")[] =
    entry === "panel" ? ["all"] : ["status", "owner"];

  const resultLine = () => {
    if (appliedLook === "chips" && activeValues.length) {
      return (
        <div className="flt-chips">
          {activeValues.map(({ key, value }) => (
            <button
              key={`${key}-${value}`}
              type="button"
              className="flt-chip"
              aria-label={`${value} 조건 지우기`}
              onClick={() =>
                setApplied((current) => toggled(current, key, value))
              }
            >
              {value}
              <X size={13} strokeWidth={2} aria-hidden />
            </button>
          ))}
          <button
            type="button"
            className="flt-text-button"
            onClick={() => setApplied(none)}
          >
            모두 지우기
          </button>
        </div>
      );
    }
    if (appliedLook === "summary" && activeValues.length) {
      return (
        <p className="flt-count">
          <span>
            {activeValues.map(({ value }) => value).join(", ")} 조건으로{" "}
            {results.length}건
          </span>
          <button
            type="button"
            className="flt-text-button"
            onClick={() => setApplied(none)}
          >
            지우기
          </button>
        </p>
      );
    }
    return <p className="flt-count">{results.length}건</p>;
  };

  const footer = () => {
    if (apply === "count") {
      return (
        <div className="flt-footer">
          <button
            type="button"
            className="flt-primary is-wide"
            onClick={commit}
          >
            {draftCount}건 보기
          </button>
        </div>
      );
    }
    if (apply === "button") {
      return (
        <div className="flt-footer">
          <button type="button" className="flt-secondary" onClick={reset}>
            초기화
          </button>
          <button type="button" className="flt-primary" onClick={commit}>
            적용
          </button>
        </div>
      );
    }
    const any = scopes.some(({ key }) => applied[key].length);
    return any ? (
      <div className="flt-footer">
        <button type="button" className="flt-text-button" onClick={reset}>
          초기화
        </button>
      </div>
    ) : null;
  };

  return (
    <div className="flt-page" ref={rootRef}>
      <h3>할 일</h3>
      <div
        ref={toolbarRef}
        className="flt-toolbar"
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            rootRef.current
              ?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')
              ?.focus();
            close();
          }
        }}
      >
        {triggers.map((target) => (
          <button
            key={target}
            type="button"
            data-target={target}
            className={`flt-trigger${triggerActive(target) ? " is-active" : ""}${open === target ? " is-open" : ""}`}
            aria-expanded={open === target}
            onClick={() => (open === target ? close() : show(target, true))}
          >
            {triggerLabel(target)}
            <ChevronDown size={14} strokeWidth={2} aria-hidden />
          </button>
        ))}

        <AnimatePresence>
          {open && (
            <motion.div
              key={open}
              ref={popoverRef}
              role="dialog"
              aria-label={
                open === "all" ? "필터" : `${triggerLabel(open)} 거르기`
              }
              className="flt-popover"
              style={{ left: popoverLeft }}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1, transition: popoverTiming }}
              exit={{ opacity: 0, scale: 0.96, transition: popoverTiming }}
            >
              {scopes.map(({ key, label, values }) => (
                <fieldset key={key} className="flt-group">
                  <legend className={open === "all" ? "" : "flt-sr"}>
                    {label}
                  </legend>
                  {values.map((value) => {
                    const checked = editing[key].includes(value);
                    const count = tasks.filter(
                      (task) =>
                        task[key] === value && matches(editing, task, key),
                    ).length;
                    const disabled = facet === "dim" && count === 0 && !checked;
                    return (
                      <label
                        key={value}
                        className={`flt-option${disabled ? " is-disabled" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => pick(key, value)}
                        />
                        <span className="flt-box" aria-hidden>
                          {checked && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className="flt-option-label">{value}</span>
                        {facet !== "none" && (
                          <span className="flt-option-count">{count}</span>
                        )}
                      </label>
                    );
                  })}
                </fieldset>
              ))}
              {footer()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flt-result-line" aria-live="polite">
        {resultLine()}
      </div>

      <ul className="flt-list">
        <AnimatePresence initial={false}>
          {results.map((task) => (
            <motion.li
              key={task.id}
              layout="position"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={quick}
            >
              <div className="flt-row">
                <FileText size={16} strokeWidth={1.75} aria-hidden />
                <span className="flt-name">{task.name}</span>
                <span className="flt-meta">
                  {task.status}, {task.owner}
                </span>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
