import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./DatePicker.css";

// params: open(popover | inline), selected(circle | square | ring), today(dot | bold | ring), month(slide | fade | instant), week(sun | mon)
// 무대마다 같은 날을 보이도록 오늘을 2026년 10월 19일로 고정한다.

const TODAY = new Date(2026, 9, 19);
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

function monthDays(month: Date, weekStart: number) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const start = new Date(first);
  start.setDate(1 - lead);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

const formatted = (date: Date) =>
  `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;

// 시연 순서: 다음 달, 날짜 고르기(팝오버는 닫힘), 열기, 이전 달, 날짜 고르기, 열기
const demoSteps: ("open" | "next" | "prev" | Date)[] = [
  "next",
  new Date(2026, 10, 6),
  "open",
  "prev",
  new Date(2026, 9, 23),
  "open",
];

export default function DatePicker({ params }: SpecimenProps) {
  const [selected, setSelected] = useState(new Date(2026, 9, 23));
  const [month, setMonth] = useState(new Date(2026, 9, 1));
  const [direction, setDirection] = useState(1);
  // 팝오버도 연 채로 시작해 고른 날, 오늘 표시, 주 시작을 바로 비교할 수 있게 한다
  const [open, setOpen] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const seconds = useSeconds();
  const inline = params.open === "inline";
  const shown = inline || open;

  const shift = (offset: number) => {
    setDirection(offset);
    setMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  };

  const pick = (day: Date) => {
    setSelected(day);
    if (!inline) setOpen(false);
  };

  useDemo((tick) => {
    const step = demoSteps[(tick - 1) % demoSteps.length];
    if (step === "open") setOpen(true);
    else if (step === "next") shift(1);
    else if (step === "prev") shift(-1);
    else pick(step);
  });

  useEffect(() => {
    if (inline || !open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [inline, open]);

  const calendar = (
    <Calendar
      month={month}
      direction={direction}
      selected={selected}
      params={params}
      seconds={seconds}
      onShift={shift}
      onPick={pick}
    />
  );

  return (
    <div
      ref={rootRef}
      className="dp-page"
      data-selected={params.selected}
      data-today={params.today}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !inline) setOpen(false);
      }}
    >
      <h3>회의 날짜</h3>
      {inline ? (
        <>
          <p className="dp-chosen">{formatted(selected)}</p>
          {calendar}
        </>
      ) : (
        <div className="dp-anchor">
          <button
            type="button"
            className="dp-input"
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen((value) => !value)}
          >
            <span>{formatted(selected)}</span>
            <CalendarDays size={18} strokeWidth={1.75} aria-hidden />
          </button>
          <AnimatePresence>
            {shown && (
              <motion.div
                className="dp-popover"
                role="dialog"
                aria-label="날짜 고르기"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: seconds(160), ease: EASE_OUT }}
              >
                {calendar}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

interface CalendarProps {
  month: Date;
  direction: number;
  selected: Date;
  params: SpecimenProps["params"];
  seconds: (ms: number) => number;
  onShift: (offset: number) => void;
  onPick: (day: Date) => void;
}

function Calendar({
  month,
  direction,
  selected,
  params,
  seconds,
  onShift,
  onPick,
}: CalendarProps) {
  const weekStart = params.week === "mon" ? 1 : 0;
  const days = monthDays(month, weekStart);
  const headers = Array.from(
    { length: 7 },
    (_, index) => (index + weekStart) % 7,
  );
  const travel = params.month === "slide" ? 24 : 0;
  const timing = {
    duration:
      params.month === "instant"
        ? 0
        : seconds(params.month === "slide" ? 200 : 160),
    ease: EASE_OUT,
  };

  // 화살표 키로 날짜 사이를 옮겨 다닌다. 고른 날(없으면 1일)만 Tab으로 들어온다
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const offset = offsets[event.key];
    const current = (event.target as HTMLElement).dataset.index;
    if (offset === undefined || current === undefined) return;
    event.preventDefault();
    const next = event.currentTarget.querySelector<HTMLButtonElement>(
      `[data-index="${Number(current) + offset}"]:not(:disabled)`,
    );
    next?.focus();
  };

  const focusable = days.some(
    (day) => sameDay(day, selected) && day.getMonth() === month.getMonth(),
  )
    ? selected
    : new Date(month.getFullYear(), month.getMonth(), 1);

  return (
    <div className="dp-calendar">
      <div className="dp-month">
        <button
          type="button"
          className="dp-nav"
          aria-label="이전 달"
          onClick={() => onShift(-1)}
        >
          <ChevronLeft size={18} strokeWidth={1.75} />
        </button>
        <div className="dp-month-name" aria-live="polite">
          <AnimatePresence initial={false} custom={direction}>
            <motion.span
              key={month.getMonth()}
              custom={direction}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: travel * d }),
                center: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: -travel * d }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={timing}
            >
              {month.getFullYear()}년 {month.getMonth() + 1}월
            </motion.span>
          </AnimatePresence>
        </div>
        <button
          type="button"
          className="dp-nav"
          aria-label="다음 달"
          onClick={() => onShift(1)}
        >
          <ChevronRight size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className="dp-weekdays" aria-hidden="true">
        {headers.map((day) => (
          <span
            key={day}
            className={
              day === 0 && params.week === "sun"
                ? "is-sunday"
                : (day === 0 || day === 6) && params.week === "mon"
                  ? "is-weekend"
                  : undefined
            }
          >
            {WEEKDAYS[day]}
          </span>
        ))}
      </div>

      <div className="dp-grid-frame">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={`${month.getFullYear()}-${month.getMonth()}-${weekStart}`}
            className="dp-grid"
            role="group"
            aria-label={`${month.getFullYear()}년 ${month.getMonth() + 1}월`}
            custom={direction}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: travel * d }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: -travel * d }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={timing}
            onKeyDown={move}
          >
            {days.map((day, index) => {
              const outside = day.getMonth() !== month.getMonth();
              const isSelected = !outside && sameDay(day, selected);
              const isToday = !outside && sameDay(day, TODAY);
              return (
                <button
                  key={index}
                  type="button"
                  data-index={index}
                  className={[
                    "dp-day",
                    outside && "is-outside",
                    isSelected && "is-selected",
                    isToday && "is-today",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={outside}
                  tabIndex={sameDay(day, focusable) && !outside ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-label={formatted(day) + (isToday ? ", 오늘" : "")}
                  onClick={() => onPick(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
