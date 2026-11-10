import { useEffect, useId, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from "motion/react";
import { X } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Phone.css";

// params: form(center | sheet | full), actions(inline | split | stack), dismiss(drag | button, form이 sheet일 때만)
// 휴대폰 화면을 무대 안에 그리고 대화상자도 그 화면 기준 absolute로 그린다.
// 세 무대를 함께 비교하므로 문서 전체를 잠그지 않는다. 실제 화면에서는 프로젝트의 모달 프리미티브에 모양과 움직임만 옮긴다.

const meetings = [
  { id: "weekly", name: "주간 회의", time: "화요일 오전 10:00" },
  { id: "design", name: "디자인 검토", time: "수요일 오후 2:00" },
  { id: "retro", name: "회고", time: "금요일 오후 4:30" },
];
const times = ["오전 10:00", "오전 11:30", "오후 2:00", "오후 4:30"];
// 손잡이를 이만큼 넘게 내리거나 이 속도보다 빠르게 내리면 닫는다
const CLOSE_DISTANCE = 80;
const CLOSE_VELOCITY = 500;

export default function MobileDialog({ params }: SpecimenProps) {
  const [open, setOpen] = useState(false);
  // 시연으로 열었을 때는 포커스를 옮기지 않는다. 다른 무대나 평가 입력의 포커스를 빼앗지 않기 위해서다
  const [byUser, setByUser] = useState(false);
  const [time, setTime] = useState(times[0]);
  const [pulled, setPulled] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descId = useId();
  const seconds = useSeconds();
  const reduced = useReducedMotion();
  const dragControls = useDragControls();
  const { form, actions } = params;
  const draggable = form === "sheet" && params.dismiss === "drag";
  const timing = {
    duration: reduced ? 0 : seconds(300),
    ease: form === "center" ? "easeOut" : EASE_OUT,
  } as const;

  const show = (user: boolean) => {
    setByUser(user);
    setPulled(false);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    if (byUser) triggerRef.current?.focus();
  };

  // 시연: 열기, 다른 시간 고르기, 닫기(끌어서 닫는 값은 손잡이를 끌어 내리는 모습으로), 쉬기
  useDemo((tick) => {
    const step = tick % 4;
    if (step === 1) {
      setTime(times[0]);
      show(false);
    }
    if (step === 2) setTime(times[2]);
    if (step === 3) {
      if (draggable) {
        setPulled(true);
        window.setTimeout(() => setOpen(false), seconds(260) * 1000);
      } else setOpen(false);
    }
  });

  useEffect(() => {
    if (open && byUser) firstRef.current?.focus({ preventScroll: true });
  }, [open, byUser]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > CLOSE_DISTANCE || info.velocity.y > CLOSE_VELOCITY)
      close();
  };

  const hidden =
    form === "center" ? { opacity: 0, scale: 0.96 } : { y: "100%" };
  const shown =
    form === "center" ? { opacity: 1, scale: 1 } : { y: pulled ? 140 : 0 };

  const title = <h4 id={titleId}>회의 시간 바꾸기</h4>;
  const closeButton = (
    <button type="button" className="ph-icon" aria-label="닫기" onClick={close}>
      <X size={18} strokeWidth={1.75} />
    </button>
  );
  const body = (
    <>
      <p id={descId} className="pdl-desc">
        참석자 4명에게 바뀐 시간을 알려요.
      </p>
      <fieldset className="pdl-times">
        <legend className="ph-sr-only">새 시간</legend>
        {times.map((value, index) => (
          <label key={value}>
            <input
              ref={index === 0 ? firstRef : undefined}
              type="radio"
              name={`${titleId}-time`}
              checked={time === value}
              onChange={() => setTime(value)}
            />
            {value}
          </label>
        ))}
      </fieldset>
    </>
  );
  const buttons = (
    <div className="pdl-actions" data-actions={actions}>
      {actions === "stack" ? (
        <>
          <button
            type="button"
            className="ph-button is-primary"
            onClick={close}
          >
            변경
          </button>
          <button type="button" className="ph-button is-text" onClick={close}>
            취소
          </button>
        </>
      ) : (
        <>
          <button type="button" className="ph-button" onClick={close}>
            취소
          </button>
          <button
            type="button"
            className="ph-button is-primary"
            onClick={close}
          >
            변경
          </button>
        </>
      )}
    </div>
  );

  const panel = (
    <motion.div
      key="panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      // 대화상자 안의 빈 곳을 눌러도 초점이 밖으로 빠지지 않아 Esc로 닫을 수 있다
      tabIndex={-1}
      className="pdl-panel"
      data-form={form}
      data-dismiss={form === "sheet" ? params.dismiss : undefined}
      initial={hidden}
      animate={shown}
      exit={hidden}
      transition={timing}
      drag={draggable ? "y" : false}
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 1 }}
      onDragEnd={onDragEnd}
    >
      {form === "full" ? (
        <>
          <div className="pdl-full-head">
            {closeButton}
            {title}
          </div>
          <div className="pdl-full-body">{body}</div>
          {buttons}
        </>
      ) : (
        <>
          <div
            className="pdl-grab"
            onPointerDown={(event) => draggable && dragControls.start(event)}
          >
            {draggable && <span className="pdl-grabber" aria-hidden="true" />}
            <div className="pdl-title-row">
              {title}
              {!draggable && closeButton}
            </div>
          </div>
          {body}
          {buttons}
        </>
      )}
    </motion.div>
  );

  return (
    <div className="ph-frame">
      <div className="ph-head">
        <h3>이번 주 회의</h3>
      </div>
      <div className="ph-body">
        <ul className="pdl-list">
          {meetings.map((meeting, index) => (
            <li key={meeting.id}>
              <div>
                <b>{meeting.name}</b>
                <span>{index === 0 ? `화요일 ${time}` : meeting.time}</span>
              </div>
              {index === 0 && (
                <button
                  ref={triggerRef}
                  type="button"
                  className="ph-button"
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  onClick={() => show(true)}
                >
                  시간 변경
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <AnimatePresence>
        {open && (
          <div
            key="layer"
            className="pdl-layer"
            onKeyDown={(event) => event.key === "Escape" && close()}
          >
            {form !== "full" && (
              <motion.div
                className="pdl-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={timing}
                onClick={close}
              />
            )}
            {form === "center" ? (
              <div className="pdl-center-anchor">{panel}</div>
            ) : (
              panel
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
