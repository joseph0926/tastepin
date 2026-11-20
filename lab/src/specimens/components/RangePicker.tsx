import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import "./RangePicker.css";

// params: months(two | one | scroll), band(band | ends), preview(hover | none), summary(top | none)
// 숙박 기간을 고르는 달력. 오늘은 2026년 11월 20일로 고정하고 지난 날짜는 고를 수 없다.
// 체크인을 고른 뒤 다음 클릭이 체크아웃이며, 체크인보다 앞이면 체크인을 다시 고른다

const TODAY = new Date(2026, 10, 20);
const FIRST_MONTH = new Date(2026, 10, 1);
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const dayKey = (date: Date) =>
  date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
const fromKey = (key: number) =>
  new Date(
    Math.floor(key / 10000),
    (Math.floor(key / 100) % 100) - 1,
    key % 100,
  );
const addMonths = (date: Date, count: number) =>
  new Date(date.getFullYear(), date.getMonth() + count, 1);
const label = (key: number) => {
  const date = fromKey(key);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
};
const nightsBetween = (start: number, end: number) =>
  Math.round((fromKey(end).getTime() - fromKey(start).getTime()) / 86_400_000);

const INITIAL = {
  start: dayKey(new Date(2026, 10, 21)),
  end: dayKey(new Date(2026, 10, 23)),
};

function Month({
  month,
  range,
  hover,
  params,
  onPick,
  onHover,
}: {
  month: Date;
  range: { start: number | null; end: number | null };
  hover: number | null;
  params: SpecimenProps["params"];
  onPick: (key: number) => void;
  onHover: (key: number | null) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const blanks = new Date(year, monthIndex, 1).getDay();
  const length = new Date(year, monthIndex + 1, 0).getDate();
  const today = dayKey(TODAY);
  const { start, end } = range;
  // 체크아웃이 정해지지 않았으면 마우스 위치까지를 미리 칠한다
  const previewEnd =
    params.preview === "hover" && start && !end && hover && hover > start
      ? hover
      : null;

  return (
    <div className="rp-month">
      <h5>
        {year}년 {monthIndex + 1}월
      </h5>
      <div
        className="rp-grid"
        role="group"
        aria-label={`${year}년 ${monthIndex + 1}월`}
      >
        {WEEKDAYS.map((day) => (
          <span key={day} className="rp-weekday" aria-hidden>
            {day}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {Array.from({ length }, (_, index) => {
          const key = dayKey(new Date(year, monthIndex, index + 1));
          const past = key < today;
          const isEdge = key === start || key === end;
          const inRange = start && end && key > start && key < end;
          const inPreview = previewEnd && key > start! && key <= previewEnd;
          const state = isEdge
            ? "edge"
            : inRange
              ? "range"
              : inPreview
                ? "preview"
                : undefined;
          return (
            <button
              key={key}
              type="button"
              className="rp-day"
              data-state={state}
              data-start={(key === start && (end || previewEnd)) || undefined}
              data-end={
                key === end || (key === previewEnd && !end) || undefined
              }
              data-today={key === today || undefined}
              disabled={past}
              aria-pressed={isEdge}
              aria-label={label(key)}
              onClick={() => onPick(key)}
              onMouseEnter={() => onHover(key)}
            >
              <span>{index + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function RangePicker({ params }: SpecimenProps) {
  const { months, band, summary } = params;
  const [range, setRange] = useState<{
    start: number | null;
    end: number | null;
  }>(INITIAL);
  const [hover, setHover] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);

  const pick = (key: number) => {
    const { start, end } = range;
    if (!start || end || key <= start) setRange({ start: key, end: null });
    else setRange({ start, end: key });
  };

  // 새 체크인 고르기, 체크아웃 후보에 올리기, 체크아웃 고르기, 처음으로
  useDemo((tick) => {
    const step = (tick - 1) % 4;
    if (step === 0) {
      setRange({ start: dayKey(new Date(2026, 10, 25)), end: null });
      setHover(null);
    }
    if (step === 1) setHover(dayKey(new Date(2026, 10, 28)));
    if (step === 2)
      setRange((current) => ({
        ...current,
        end: dayKey(new Date(2026, 10, 28)),
      }));
    if (step === 3) {
      setRange(INITIAL);
      setHover(null);
      setOffset(0);
    }
  });

  const shown =
    months === "two"
      ? [addMonths(FIRST_MONTH, offset), addMonths(FIRST_MONTH, offset + 1)]
      : months === "one"
        ? [addMonths(FIRST_MONTH, offset)]
        : [0, 1, 2].map((count) => addMonths(FIRST_MONTH, count));
  const canPage = months !== "scroll";

  return (
    <div
      className="rp"
      data-band={band}
      data-months={months}
      onMouseLeave={() => setHover(null)}
    >
      {summary === "top" && (
        <div className="rp-summary" aria-live="polite">
          <span>
            {range.start ? label(range.start) : "체크인"}
            {" - "}
            <span className={range.end ? undefined : "rp-placeholder"}>
              {range.end ? label(range.end) : "체크아웃"}
            </span>
          </span>
          {range.start && range.end && (
            <b>{nightsBetween(range.start, range.end)}박</b>
          )}
        </div>
      )}
      <div className="rp-body">
        {canPage && (
          <div className="rp-nav">
            <button
              type="button"
              aria-label="이전 달"
              disabled={offset === 0}
              onClick={() => setOffset(offset - 1)}
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="다음 달"
              disabled={offset >= 3}
              onClick={() => setOffset(offset + 1)}
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
        )}
        <div className="rp-months">
          {shown.map((month) => (
            <Month
              key={month.getTime()}
              month={month}
              range={range}
              hover={hover}
              params={params}
              onPick={pick}
              onHover={setHover}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
