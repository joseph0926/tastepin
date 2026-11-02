import { useEffect, useId, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Segmented.css";

// params: thumb(raised | filled | underline), travel(slide | instant), preview(morph | swap)

const ranges = [
  {
    id: "day",
    label: "일간",
    unit: "시간대",
    bars: [12, 30, 46, 38, 64, 52, 20],
  },
  {
    id: "week",
    label: "주간",
    unit: "요일",
    bars: [58, 72, 66, 80, 61, 24, 18],
  },
  {
    id: "month",
    label: "월간",
    unit: "주차",
    bars: [40, 55, 70, 62, 48, 0, 0],
  },
];

function Total({ value, morph }: { value: number; morph: boolean }) {
  const seconds = useSeconds();
  const count = useMotionValue(value);
  const text = useTransform(count, (latest) =>
    Math.round(latest).toLocaleString("ko-KR"),
  );

  useEffect(() => {
    if (!morph) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, {
      duration: seconds(240),
      ease: EASE_OUT,
    });
    return () => controls.stop();
  }, [count, value, morph, seconds]);

  return <motion.span className="seg-total-value">{text}</motion.span>;
}

function Bars({ bars, morph }: { bars: number[]; morph: boolean }) {
  const seconds = useSeconds();
  return (
    <div className="seg-bars" aria-hidden="true">
      {bars.map((height, index) => (
        <motion.span
          key={index}
          className="seg-bar"
          initial={false}
          animate={{
            height: `${Math.max(height, 2)}%`,
            opacity: height ? 1 : 0.35,
          }}
          transition={
            morph ? { duration: seconds(240), ease: EASE_OUT } : { duration: 0 }
          }
        />
      ))}
    </div>
  );
}

export default function Segmented({ params }: SpecimenProps) {
  const [rangeId, setRangeId] = useState("week");
  const seconds = useSeconds();
  const layoutId = useId();
  const range = ranges.find((item) => item.id === rangeId) ?? ranges[0];
  const total = range.bars.reduce((sum, value) => sum + value, 0) * 37;
  const slide = params.travel === "slide";
  const morph = params.preview === "morph";

  useDemo((tick) => setRangeId(ranges[tick % ranges.length].id));

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = ranges.findIndex((item) => item.id === rangeId);
    const next = ranges[(index + step + ranges.length) % ranges.length];
    setRangeId(next.id);
    document.getElementById(`${layoutId}-${next.id}`)?.focus();
  };

  return (
    <div className="seg">
      <div className="seg-head">
        <span className="seg-caption">회의실 사용 시간</span>
        <div
          className={`seg-track thumb-${params.thumb}`}
          role="radiogroup"
          aria-label="기간"
          onKeyDown={onKeyDown}
        >
          {ranges.map((item) => {
            const active = item.id === rangeId;
            return (
              <button
                key={item.id}
                id={`${layoutId}-${item.id}`}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                className={`seg-option${active ? " is-active" : ""}`}
                onClick={() => setRangeId(item.id)}
              >
                {active && (
                  <motion.span
                    className="seg-thumb"
                    layoutId={slide ? `${layoutId}-thumb` : undefined}
                    transition={{ duration: seconds(200), ease: EASE_OUT }}
                  />
                )}
                <span className="seg-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="seg-preview">
        {morph ? (
          <div className="seg-preview-layer">
            <p className="seg-total">
              <Total value={total} morph /> 분
              <span className="seg-unit">{range.unit}별</span>
            </p>
            <Bars bars={range.bars} morph />
          </div>
        ) : (
          <AnimatePresence initial={false}>
            <motion.div
              key={range.id}
              className="seg-preview-layer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: seconds(120), ease: EASE_OUT }}
            >
              <p className="seg-total">
                <Total value={total} morph={false} /> 분
                <span className="seg-unit">{range.unit}별</span>
              </p>
              <Bars bars={range.bars} morph={false} />
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
