import { useState, type KeyboardEvent } from "react";
import {
  Reorder as MotionReorder,
  useDragControls,
  type Transition,
} from "motion/react";
import { GripVertical } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Reorder.css";

// params: lift(shadow | tone | scale), yield(curve | spring | instant), handle(grip | row | edit)
// 직접 끌어 보거나 같이 재생으로 비교한다. 같이 재생은 끄는 동작 대신 같은 항목을 들어 올린 채 한 칸씩 옮겨
// 들어 올림과 자리 비킴을 모든 무대에서 같은 시각에 보여 준다.

const initial = [
  "회의실 예약 확인",
  "주간 보고서 정리",
  "디자인 리뷰 준비",
  "신규 입사자 계정 발급",
  "분기 예산 검토",
];
const DEMO_ITEM = initial[0];
// 그림자는 같은 구조여야 사이 값을 이어서 그린다. 라이트와 다크 모두에서 보이도록 회색 테두리를 함께 둔다
const REST_SHADOW =
  "0px 0px 0px 0px rgba(0, 0, 0, 0), 0px 0px 0px 0px rgba(128, 128, 128, 0)";
const LIFT_SHADOW =
  "0px 8px 20px -8px rgba(0, 0, 0, 0.35), 0px 0px 0px 1px rgba(128, 128, 128, 0.22)";

// 시연 순서: 들기, 아래로 두 칸, 놓기, 들기, 위로 두 칸, 놓기
const demoSteps: ("lift" | "down" | "up" | "drop")[] = [
  "lift",
  "down",
  "down",
  "drop",
  "lift",
  "up",
  "up",
  "drop",
];

function move(items: string[], item: string, offset: number) {
  const from = items.indexOf(item);
  const to = Math.min(items.length - 1, Math.max(0, from + offset));
  if (from === to) return items;
  const next = [...items];
  next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function Reorder({ params }: SpecimenProps) {
  const [items, setItems] = useState(initial);
  const [lifted, setLifted] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const seconds = useSeconds();
  const { lift, handle } = params;

  useDemo((tick) => {
    const step = demoSteps[(tick - 1) % demoSteps.length];
    if (step === "lift") {
      setEditing(true);
      setLifted(DEMO_ITEM);
    } else if (step === "drop") {
      setLifted(null);
      if (tick % demoSteps.length === 0) setEditing(false);
    } else {
      setItems((current) => move(current, DEMO_ITEM, step === "down" ? 1 : -1));
    }
  });

  const layout: Transition =
    params.yield === "spring"
      ? { type: "spring", visualDuration: seconds(250), bounce: 0.15 }
      : {
          duration: params.yield === "instant" ? 0 : seconds(200),
          ease: EASE_OUT,
        };
  const raised =
    lift === "shadow"
      ? { scale: 1.02, boxShadow: LIFT_SHADOW }
      : { scale: lift === "scale" ? 1.03 : 1, boxShadow: REST_SHADOW };
  const showGrip = handle === "grip" || (handle === "edit" && editing);
  const draggable = handle !== "edit" || editing;

  return (
    <div className="rdr-page" data-lift={lift} data-handle={handle}>
      <div className="rdr-head">
        <div>
          <h3>오늘 할 일</h3>
          <p>위에 있을수록 먼저 합니다.</p>
        </div>
        {handle === "edit" && (
          <button
            type="button"
            className="rdr-button"
            aria-pressed={editing}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? "완료" : "순서 편집"}
          </button>
        )}
      </div>

      <MotionReorder.Group
        axis="y"
        values={items}
        onReorder={setItems}
        className="rdr-list"
      >
        {items.map((item) => (
          <Row
            key={item}
            item={item}
            lifted={lifted === item}
            raised={raised}
            layout={layout}
            seconds={seconds}
            showGrip={showGrip}
            draggable={draggable}
            wholeRow={handle === "row"}
            onMove={(offset) =>
              setItems((current) => move(current, item, offset))
            }
          />
        ))}
      </MotionReorder.Group>
    </div>
  );
}

interface RowProps {
  item: string;
  lifted: boolean;
  raised: { scale: number; boxShadow: string };
  layout: Transition;
  seconds: (ms: number) => number;
  showGrip: boolean;
  draggable: boolean;
  wholeRow: boolean;
  onMove: (offset: number) => void;
}

function Row({
  item,
  lifted,
  raised,
  layout,
  seconds,
  showGrip,
  draggable,
  wholeRow,
  onMove,
}: RowProps) {
  const controls = useDragControls();
  const rest = { scale: 1, boxShadow: REST_SHADOW };
  const liftTiming = { duration: seconds(150), ease: EASE_OUT };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onMove(event.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <MotionReorder.Item
      value={item}
      className={lifted ? "rdr-item is-lifted" : "rdr-item"}
      // 손잡이를 쓰는 값은 손잡이에서만 끌기를 시작한다
      dragListener={draggable && wholeRow}
      dragControls={controls}
      drag={draggable ? "y" : false}
      tabIndex={wholeRow ? 0 : undefined}
      onKeyDown={wholeRow ? onKeyDown : undefined}
      initial={false}
      animate={lifted ? raised : rest}
      whileDrag={raised}
      transition={{ default: liftTiming, layout }}
    >
      {showGrip && (
        <button
          type="button"
          className="rdr-grip"
          aria-label={`${item} 옮기기. 위아래 화살표로 순서를 바꿉니다`}
          onPointerDown={(event) => draggable && controls.start(event)}
          onKeyDown={onKeyDown}
        >
          <GripVertical size={16} strokeWidth={1.75} />
        </button>
      )}
      <span className="rdr-text">{item}</span>
    </MotionReorder.Item>
  );
}
