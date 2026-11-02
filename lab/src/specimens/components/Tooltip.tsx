import { useEffect, useId, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  type TargetAndTransition,
} from "motion/react";
import { Bold, CircleHelp, Image, Link2, Share2 } from "lucide-react";
import { EASE_OUT_CUBIC, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Tooltip.css";

// params: delay(short | long | instant), look(inverse | raised), arrow(none | arrow), enter(fade | rise | scale)
// 같이 재생은 마우스 올림을 흉내 낸다: 굵게에 올리기, 링크로 옮기기, 떠나기, 도움말 팝오버 열기, 닫기.
// 한 번 뜬 툴팁이 사라진 뒤 600ms 안에 다른 아이콘으로 옮기면 지연 없이 바로 뜬다(어느 값이든 같다).

const tools = [
  { id: "bold", label: "굵게", keys: "Ctrl B", Icon: Bold },
  { id: "link", label: "링크 넣기", keys: "Ctrl K", Icon: Link2 },
  { id: "image", label: "이미지 넣기", keys: "", Icon: Image },
  { id: "share", label: "공유", keys: "", Icon: Share2 },
];
const DELAYS: Record<string, number> = { short: 300, long: 700, instant: 0 };
const WARM_MS = 600;

const demoSteps = ["bold", "link", "leave", "popover", "close"] as const;

export default function Tooltip({ params }: SpecimenProps) {
  const [tip, setTip] = useState<string | null>(null);
  const [popover, setPopover] = useState(false);
  const showTimer = useRef<number>(undefined);
  const warmUntil = useRef(0);
  const popoverId = useId();
  const seconds = useSeconds();
  const { delay, look, arrow, enter } = params;

  useEffect(() => () => window.clearTimeout(showTimer.current), []);

  const point = (id: string) => {
    window.clearTimeout(showTimer.current);
    // 이미 떠 있는 툴팁에서 옆 아이콘으로 옮기거나 막 사라진 직후면 지연 없이 바로 띄운다
    const warm = tip !== null || Date.now() < warmUntil.current;
    const wait = warm ? 0 : seconds(DELAYS[delay] ?? 300) * 1000;
    if (wait === 0) setTip(id);
    else showTimer.current = window.setTimeout(() => setTip(id), wait);
  };
  const leave = () => {
    window.clearTimeout(showTimer.current);
    if (tip) warmUntil.current = Date.now() + seconds(WARM_MS) * 1000;
    setTip(null);
  };

  useDemo((tick) => {
    const step = demoSteps[(tick - 1) % demoSteps.length];
    if (step === "bold" || step === "link") point(step);
    if (step === "leave") leave();
    if (step === "popover") setPopover(true);
    if (step === "close") setPopover(false);
  });

  // 툴팁은 대상 아래에 뜬다. 대상 쪽은 위이므로 rise는 위 4px에서 다가오고 scale은 위 가운데를 기준점으로 커진다
  const hidden: TargetAndTransition =
    enter === "rise"
      ? { opacity: 0, y: -4 }
      : enter === "scale"
        ? { opacity: 0, scale: 0.96 }
        : { opacity: 0 };
  const timing = {
    duration: seconds(enter === "fade" ? 120 : 140),
    ease: EASE_OUT_CUBIC,
  };

  return (
    <div
      className="tip-page"
      data-look={look}
      data-arrow={arrow}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        setPopover(false);
        leave();
      }}
    >
      <div className="tip-toolbar" role="toolbar" aria-label="서식">
        {tools.map(({ id, label, keys, Icon }) => (
          <span key={id} className="tip-anchor">
            <button
              type="button"
              className="tip-tool"
              aria-label={label}
              aria-describedby={tip === id ? `${popoverId}-${id}` : undefined}
              onPointerEnter={() => point(id)}
              onPointerLeave={leave}
              onFocus={() => setTip(id)}
              onBlur={leave}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden />
            </button>
            <AnimatePresence>
              {tip === id && (
                <motion.span
                  id={`${popoverId}-${id}`}
                  role="tooltip"
                  className="tip-bubble"
                  // 가운데 정렬은 motion이 다루는 transform 안에서 한다
                  style={{ x: "-50%" }}
                  initial={hidden}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={hidden}
                  transition={timing}
                >
                  {label}
                  {keys && <kbd>{keys}</kbd>}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        ))}
      </div>

      <div className="tip-field">
        <span className="tip-label">
          공개 범위
          <span className="tip-anchor">
            <button
              type="button"
              className="tip-help"
              aria-label="공개 범위 도움말"
              aria-expanded={popover}
              aria-controls={`${popoverId}-pop`}
              onClick={() => setPopover((value) => !value)}
            >
              <CircleHelp size={16} strokeWidth={1.75} aria-hidden />
            </button>
            <AnimatePresence>
              {popover && (
                <motion.div
                  id={`${popoverId}-pop`}
                  role="dialog"
                  aria-label="공개 범위 도움말"
                  className="tip-popover"
                  initial={hidden}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={hidden}
                  transition={timing}
                >
                  <b>공개 범위</b>
                  <p>
                    팀 공개로 두면 워크스페이스 멤버 누구나 읽을 수 있어요.
                    편집은 초대한 사람만 할 수 있어요.
                  </p>
                  <button
                    type="button"
                    className="tip-link"
                    onClick={() => setPopover(false)}
                  >
                    알겠어요
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </span>
        </span>
        <select defaultValue="team" aria-label="공개 범위">
          <option value="me">나만 보기</option>
          <option value="team">팀 공개</option>
          <option value="all">링크가 있는 모든 사람</option>
        </select>
      </div>
      <p className="tip-note">
        아이콘에 마우스를 올리거나 Tab으로 옮겨 보세요.
      </p>
    </div>
  );
}
