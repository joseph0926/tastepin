import { useId, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./MetricTabs.css";

// params: link(underline | tone | weight), delta(pill | text | mono),
// partial(dashed | solid | omit), grid(dashed | solid | none), color(quiet | accent | series)
// 지표 칸 하나를 고르면 바로 아래 그래프가 그 지표로 바뀐다. 마지막 점은 아직 집계 중인 오늘이다

interface Metric {
  id: string;
  label: string;
  // 같은 기간 바로 앞 14일과 비교한 변화. 이탈률은 %p다
  change: { value: number; unit: "%" | "%p"; better: boolean };
  points: number[];
  total: (points: number[]) => string;
  axis: (value: number) => string;
}

const sum = (points: number[]) =>
  points.reduce((total, value) => total + value, 0);

const metrics: Metric[] = [
  {
    id: "visitors",
    label: "방문자",
    change: { value: 12.4, unit: "%", better: true },
    points: [
      980, 1120, 1260, 1190, 1340, 1410, 1080, 1020, 1280, 1390, 1460, 1520,
      1590, 610,
    ],
    total: (points) => sum(points).toLocaleString("ko-KR"),
    axis: (value) => value.toLocaleString("ko-KR"),
  },
  {
    id: "views",
    label: "페이지뷰",
    change: { value: 3.1, unit: "%", better: true },
    points: [
      3120, 3480, 3610, 3390, 3920, 4180, 2950, 2870, 3660, 3940, 4210, 4420,
      4580, 1710,
    ],
    total: (points) => sum(points).toLocaleString("ko-KR"),
    axis: (value) => value.toLocaleString("ko-KR"),
  },
  {
    id: "bounce",
    label: "이탈률",
    change: { value: 2.3, unit: "%p", better: false },
    points: [42, 41, 43, 40, 39, 41, 44, 45, 40, 39, 41, 40, 42, 47],
    total: (points) => `${(sum(points) / points.length).toFixed(1)}%`,
    axis: (value) => `${value}%`,
  },
];

const days = ["11월 7일", "11월 13일", "오늘"];
const HEIGHT = 176;
const PAD = { top: 12, right: 8, bottom: 24, left: 44 };

// 가장 큰 값을 덮는 반올림 눈금 세 개(0, 가운데, 위)
function ticksFor(max: number) {
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const half = magnitude / 2;
  const top = Math.ceil(max / half) * half;
  return [0, top / 2, top];
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentBoxSize[0].inlineSize),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function Delta({ change, style }: { change: Metric["change"]; style: string }) {
  const magnitude = `${change.value}${change.unit}`;
  const rising = change.value > 0;
  const text =
    style === "text"
      ? `${rising ? "▲" : "▼"} ${magnitude}`
      : `${rising ? "+" : "−"}${magnitude}`;
  return (
    <span
      className={`mt-delta delta-${style}`}
      data-tone={change.better ? "good" : "bad"}
      aria-label={`앞 기간보다 ${rising ? "증가" : "감소"} ${magnitude}, ${change.better ? "좋아짐" : "나빠짐"}`}
    >
      {text}
    </span>
  );
}

function Chart({
  metric,
  partial,
  grid,
  panelId,
  labelledBy,
}: {
  metric: Metric;
  partial: string;
  grid: string;
  panelId: string;
  labelledBy: string;
}) {
  const [ref, width] = useWidth();
  const seconds = useSeconds();
  const gradientId = `mt-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // 빼고 표시하면 집계 중인 오늘 점을 그리지 않는다
  const points =
    partial === "omit" ? metric.points.slice(0, -1) : metric.points;
  const ticks = ticksFor(Math.max(...metric.points));
  const top = ticks[ticks.length - 1];
  const innerWidth = Math.max(0, width - PAD.left - PAD.right);
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const baseline = PAD.top + innerHeight;
  const step = innerWidth / (points.length - 1);
  const x = (index: number) => PAD.left + index * step;
  const y = (value: number) =>
    PAD.top + innerHeight - (value / top) * innerHeight;

  const last = points.length - 1;
  const solidEnd = partial === "dashed" ? last - 1 : last;
  const toPath = (from: number, to: number) =>
    points
      .slice(from, to + 1)
      .map((value, offset) => {
        const index = from + offset;
        return `${offset === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
      })
      .join("");
  const line = toPath(0, solidEnd);
  const tail = partial === "dashed" ? toPath(last - 1, last) : "";
  const area = `${toPath(0, last)}L${x(last).toFixed(1)},${baseline}L${PAD.left},${baseline}Z`;
  const morph = { duration: seconds(320), ease: EASE_OUT };

  return (
    <div
      ref={ref}
      className="mt-chart"
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
    >
      {partial === "omit" && <span className="mt-pending">오늘 집계 중</span>}
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${metric.label} 14일 추이`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          {ticks.map((tick) => {
            const isBase = tick === 0;
            if (!isBase && grid === "none") {
              return (
                <text
                  key={tick}
                  x={PAD.left - 10}
                  y={y(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  className="mt-axis"
                >
                  {metric.axis(tick)}
                </text>
              );
            }
            return (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="mt-grid"
                  strokeDasharray={
                    !isBase && grid === "dashed" ? "2 4" : undefined
                  }
                />
                <text
                  x={PAD.left - 10}
                  y={y(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  className="mt-axis"
                >
                  {metric.axis(tick)}
                </text>
              </g>
            );
          })}
          {days.map((day, index) => {
            const at = [0, 6, metric.points.length - 1][index];
            // 오늘을 빼고 그리면 마지막 눈금은 어제 점에 단다
            const shown =
              partial === "omit" && day === "오늘"
                ? { at: last, label: "어제" }
                : { at, label: day };
            return (
              <text
                key={day}
                x={x(shown.at)}
                y={HEIGHT - 6}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === days.length - 1
                      ? "end"
                      : "middle"
                }
                className="mt-axis"
              >
                {shown.label}
              </text>
            );
          })}
          {/* 무대 폭이 바뀌면 새로 그리고, 지표를 바꿀 때만 선을 이어서 바꾼다 */}
          <g key={Math.round(width)}>
            <motion.path
              initial={false}
              animate={{ d: area }}
              transition={morph}
              fill={`url(#${gradientId})`}
            />
            <motion.path
              initial={false}
              animate={{ d: line }}
              transition={morph}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinejoin="round"
            />
            {tail && (
              <motion.path
                initial={false}
                animate={{ d: tail }}
                transition={morph}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeDasharray="3 4"
              />
            )}
          </g>
        </svg>
      )}
    </div>
  );
}

export default function MetricTabs({ params }: SpecimenProps) {
  const [activeId, setActiveId] = useState(metrics[0].id);
  const seconds = useSeconds();
  const baseId = useId();
  const { link, delta, partial, grid, color } = params;
  const active = metrics.find((metric) => metric.id === activeId) ?? metrics[0];
  const tabId = (id: string) => `${baseId}-tab-${id}`;

  useDemo((tick) => setActiveId(metrics[tick % metrics.length].id));

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = metrics.findIndex((metric) => metric.id === activeId);
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = metrics[(index + step + metrics.length) % metrics.length];
    setActiveId(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  return (
    <section
      className="mt-card"
      data-link={link}
      data-color={color}
      data-metric={active.id}
    >
      <div
        className="mt-tabs"
        role="tablist"
        aria-label="지표"
        onKeyDown={onKeyDown}
      >
        {metrics.map((metric) => {
          const selected = metric.id === activeId;
          return (
            <button
              key={metric.id}
              id={tabId(metric.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              className="mt-tab"
              data-metric={metric.id}
              onClick={() => setActiveId(metric.id)}
            >
              <span className="mt-label">{metric.label}</span>
              <span className="mt-value-row">
                <span className="mt-value">{metric.total(metric.points)}</span>
                <Delta change={metric.change} style={delta} />
              </span>
              {selected && link === "underline" && (
                <motion.span
                  className="mt-underline"
                  layoutId={`${baseId}-underline`}
                  transition={{ duration: seconds(200), ease: EASE_OUT }}
                />
              )}
            </button>
          );
        })}
      </div>
      <Chart
        metric={active}
        partial={partial}
        grid={grid}
        panelId={`${baseId}-panel`}
        labelledBy={tabId(active.id)}
      />
    </section>
  );
}
