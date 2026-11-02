import { useContext, useEffect, useId, useState } from "react";
import {
  AnimatePresence,
  MotionConfigContext,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  Check,
  LoaderCircle,
  MoreHorizontal,
  Save,
  Share2,
} from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Button.css";

// params: surface(ink | accent | tint), radius(small | round | pill),
// density(compact | regular | roomy), secondary(outline | soft | quiet),
// icon(none | leading | trailing), hover(tone | lift | still),
// press(scale | sink | tone), feedback(fade | slide | instant),
// disabled(fade | muted | reason), tertiary(text | underline | muted),
// iconbutton(ghost | soft | outline), focus(ring | tight | halo)

type SaveState = "idle" | "saving" | "saved";
// focus는 같이 재생 끝에서 키보드 초점 표시를 보여 주는 단계다
type Gesture = "rest" | "hover" | "press" | "focus";

const LABELS: Record<SaveState, string> = {
  idle: "변경 저장",
  saving: "저장 중",
  saved: "저장 완료",
};

export default function Button({ params }: SpecimenProps) {
  const [state, setState] = useState<SaveState>("idle");
  const [demoGesture, setDemoGesture] = useState<Gesture>("rest");
  const seconds = useSeconds();
  const reasonId = useId();
  const busy = state === "saving";
  const systemReducedMotion = useReducedMotion();
  const { reducedMotion } = useContext(MotionConfigContext);
  const reduceMotion =
    reducedMotion === "always" ||
    (reducedMotion !== "never" && systemReducedMotion);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(
      () => setState("saved"),
      seconds(1000) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [busy, seconds]);

  // 시연 순서: 올리기, 누르기, 저장 중, 저장 완료, 처음으로, 키보드 초점
  useDemo((tick) => {
    const step = (tick - 1) % 6;
    setDemoGesture(
      step === 0
        ? "hover"
        : step === 1
          ? "press"
          : step === 5
            ? "focus"
            : "rest",
    );
    setState(step === 2 ? "saving" : step === 3 ? "saved" : "idle");
  });

  const rest = {
    scale: 1,
    y: 0,
    filter: "brightness(1)",
    boxShadow: "0 0 0 rgba(0, 0, 0, 0)",
  };
  const hover = {
    ...rest,
    y: params.hover === "lift" && !reduceMotion ? -2 : 0,
    filter: params.hover === "tone" ? "brightness(0.88)" : rest.filter,
    boxShadow:
      params.hover === "lift"
        ? "0 4px 10px rgba(0, 0, 0, 0.16)"
        : rest.boxShadow,
  };
  const press = {
    ...rest,
    scale: params.press === "scale" && !reduceMotion ? 0.95 : 1,
    y: params.press === "sink" && !reduceMotion ? 2 : 0,
    filter: params.press === "tone" ? "brightness(0.8)" : rest.filter,
  };
  const demonstrated =
    demoGesture === "press" ? press : demoGesture === "hover" ? hover : rest;
  // 아이콘 버튼과 덜 중요한 동작은 CSS로 그리므로 시연 상태를 클래스로 건넨다
  const demoClass =
    demoGesture === "hover"
      ? " is-demo-hover"
      : demoGesture === "focus"
        ? " is-demo-focus"
        : "";
  const labelMotion = params.feedback === "slide" && !reduceMotion ? 6 : 0;
  const animatedLabel = params.feedback !== "instant";
  const slidingLabel = params.feedback === "slide" && !reduceMotion;
  const Icon =
    state === "saved" ? Check : state === "saving" ? LoaderCircle : Save;
  const showIcon = state !== "idle" || params.icon !== "none";

  return (
    <div
      className="btn-specimen"
      data-surface={params.surface}
      data-radius={params.radius}
      data-density={params.density}
      data-secondary={params.secondary}
      data-icon={params.icon}
      data-disabled={params.disabled}
      data-tertiary={params.tertiary}
      data-iconbutton={params.iconbutton}
      data-focus={params.focus}
    >
      <header className="btn-heading">
        <div>
          <h3>예약 변경</h3>
          <p>시간과 인원을 확인한 뒤 저장하세요.</p>
        </div>
        <div className="btn-icon-group">
          <button
            type="button"
            className={`btn-icon-button${demoClass}`}
            aria-label="예약 공유"
          >
            <Share2 size={18} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="btn-icon-button"
            aria-label="예약 메뉴"
          >
            <MoreHorizontal size={18} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <dl className="btn-details">
        <div>
          <dt>공간</dt>
          <dd>회의실 B</dd>
        </div>
        <div>
          <dt>시간</dt>
          <dd>오후 2:00 – 3:00</dd>
        </div>
        <div>
          <dt>인원</dt>
          <dd>4명</dd>
        </div>
      </dl>

      <div className="btn-actions">
        <motion.button
          type="button"
          className={`btn-control btn-primary${demoGesture === "focus" ? " is-demo-focus" : ""}`}
          aria-label={LABELS[state]}
          aria-disabled={busy}
          aria-busy={busy}
          initial={false}
          animate={demonstrated}
          whileHover={busy ? rest : hover}
          whileTap={busy ? rest : press}
          transition={{ duration: seconds(120), ease: EASE_OUT }}
          onClick={() => {
            if (!busy) {
              setDemoGesture("rest");
              setState("saving");
            }
          }}
        >
          <span className="btn-label-frame" aria-hidden="true">
            {/* 아이콘 유무가 바뀌어도 글자의 중심과 이동 경로는 유지한다. */}
            <span className="btn-icon-slot">
              <AnimatePresence initial={false}>
                {showIcon && (
                  <motion.span
                    key={state}
                    className="btn-icon"
                    initial={animatedLabel ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: animatedLabel ? seconds(80) : 0 }}
                  >
                    <motion.span
                      className="btn-icon-spin"
                      animate={{ rotate: busy && !reduceMotion ? 360 : 0 }}
                      transition={
                        busy && !reduceMotion
                          ? {
                              duration: seconds(900),
                              repeat: Infinity,
                              ease: "linear",
                            }
                          : { duration: 0 }
                      }
                    >
                      <Icon size={16} strokeWidth={1.8} />
                    </motion.span>
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <AnimatePresence initial={false}>
              <motion.span
                key={state}
                className="btn-label"
                initial={animatedLabel ? { opacity: 0, y: labelMotion } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: animatedLabel ? 0 : 1,
                  y: -labelMotion,
                  transition: {
                    duration: animatedLabel
                      ? seconds(slidingLabel ? 100 : 160)
                      : 0,
                    ease: slidingLabel ? [0.4, 0, 1, 1] : EASE_OUT,
                  },
                }}
                transition={{
                  duration: animatedLabel ? seconds(160) : 0,
                  ease: EASE_OUT,
                  opacity: slidingLabel
                    ? {
                        delay: seconds(40),
                        duration: seconds(120),
                        ease: "linear",
                      }
                    : undefined,
                }}
              >
                <span>{LABELS[state]}</span>
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.button>

        <motion.button
          type="button"
          className="btn-control btn-secondary"
          initial={false}
          whileHover={hover}
          whileTap={press}
          transition={{ duration: seconds(120), ease: EASE_OUT }}
          onClick={() => {
            setState("idle");
            setDemoGesture("rest");
          }}
        >
          되돌리기
        </motion.button>
      </div>

      <div className="btn-more">
        <button type="button" className={`btn-tertiary${demoClass}`}>
          예약 취소
        </button>
      </div>

      <p className="btn-status" role="status">
        {state === "saved"
          ? "변경을 저장했어요. 다시 눌러 비교해 보세요."
          : state === "saving"
            ? "변경을 저장하고 있어요."
            : "버튼에 마우스를 올리거나 직접 눌러 보세요."}
      </p>

      <div className="btn-disabled-example">
        <span>사용할 수 없을 때</span>
        <div className="btn-disabled-field">
          <button
            type="button"
            className="btn-control btn-primary"
            disabled
            aria-describedby={
              params.disabled === "reason" ? reasonId : undefined
            }
          >
            변경 저장
          </button>
          {params.disabled === "reason" && (
            <span id={reasonId} className="btn-disabled-reason">
              바뀐 내용이 없어요
            </span>
          )}
        </div>
      </div>
      <p className="btn-footnote">
        동작을 비교하는 예시입니다. 실제 예약은 바뀌지 않아요.
      </p>
    </div>
  );
}
