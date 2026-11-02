import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, type Transition } from "motion/react";
import { SlidersHorizontal, X } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Drawer.css";

// params: side(right | bottom | adaptive), motion(quick | calm | spring), backdrop(dim | clear | recede)
// 시편 무대 안에 갇혀 보이도록 패널을 무대 기준 absolute로 그린다. 실제 화면에서는 포털과 포커스 가두기를
// 프로젝트의 프리미티브(vaul, Radix Dialog 등)에 맡기고 모양과 모션 값만 옮긴다.

const orders = [
  ["주문 1042", "결제 완료", "38,000원"],
  ["주문 1041", "배송 중", "12,500원"],
  ["주문 1039", "배송 완료", "64,000원"],
  ["주문 1036", "환불 요청", "21,000원"],
  ["주문 1033", "배송 완료", "9,800원"],
  ["주문 1030", "배송 완료", "45,000원"],
];
const statuses = ["결제 완료", "배송 중", "배송 완료", "환불 요청"];

export default function Drawer({ params }: SpecimenProps) {
  const [open, setOpen] = useState(false);
  // 시연으로 열었을 때는 포커스를 옮기지 않는다. 다른 무대나 평가 입력의 포커스를 빼앗지 않기 위해서다
  const [byUser, setByUser] = useState(false);
  const [mobileFrame, setMobileFrame] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const seconds = useSeconds();
  const titleId = useId();

  const show = (user: boolean) => {
    // 넓으면 오른쪽, 좁으면 아래: 평가 화면의 휴대폰 폭(M) 조건을 열 때마다 읽는다
    setMobileFrame(
      pageRef.current?.closest<HTMLElement>(".lab")?.dataset.frame === "mobile",
    );
    setByUser(user);
    setOpen(true);
  };

  useDemo((tick) => {
    if (tick % 2 === 1) show(false);
    else setOpen(false);
  });

  useEffect(() => {
    // 화면 밖에서 들어오는 중인 입력에 초점을 주면 브라우저가 덮개 층을 스크롤해 패널을 끝 위치에 바로 보여 준다.
    // 스크롤을 막아야 클릭으로 열 때도 들어오는 움직임이 남는다
    if (open && byUser) firstRef.current?.focus({ preventScroll: true });
  }, [open, byUser]);

  const close = () => {
    setOpen(false);
    if (byUser) triggerRef.current?.focus();
  };

  const side =
    params.side === "adaptive"
      ? mobileFrame
        ? "bottom"
        : "right"
      : params.side;
  const hidden = side === "right" ? { x: "100%" } : { y: "100%" };
  const shown = { x: 0, y: 0 };
  // 닫힐 때도 같은 길을 같은 길이로 되돌아간다
  const timing: Transition =
    params.motion === "spring"
      ? { type: "spring", visualDuration: seconds(300), bounce: 0 }
      : {
          duration: seconds(params.motion === "calm" ? 300 : 220),
          ease: EASE_OUT,
        };
  const backdropOpacity = { dim: 1, clear: 0, recede: 1 }[params.backdrop];
  const receding = params.backdrop === "recede" && open;

  return (
    <div ref={pageRef} className="drw-page" data-backdrop={params.backdrop}>
      <motion.div
        className="drw-content"
        initial={false}
        animate={{ scale: receding ? 0.97 : 1 }}
        transition={timing}
      >
        <div className="drw-head">
          <div>
            <h3>주문</h3>
            <p>최근 30일 주문 6건</p>
          </div>
          <button
            ref={triggerRef}
            type="button"
            className="drw-button"
            aria-expanded={open}
            onClick={() => show(true)}
          >
            <SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden />
            필터
          </button>
        </div>
        <ul className="drw-orders">
          {orders.map(([name, status, amount]) => (
            <li key={name}>
              <b>{name}</b>
              <span>{status}</span>
              <span className="drw-amount">{amount}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      <AnimatePresence>
        {open && (
          <div
            key="layer"
            className={`drw-layer side-${side}`}
            onKeyDown={(event) => event.key === "Escape" && close()}
          >
            <motion.div
              className={`drw-backdrop backdrop-${params.backdrop}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: backdropOpacity }}
              exit={{ opacity: 0 }}
              transition={timing}
              onClick={close}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="drw-panel"
              initial={hidden}
              animate={shown}
              exit={hidden}
              transition={timing}
            >
              {side === "bottom" && (
                <span className="drw-grabber" aria-hidden="true" />
              )}
              <div className="drw-panel-head">
                <h4 id={titleId}>필터</h4>
                <button
                  type="button"
                  className="drw-icon"
                  aria-label="닫기"
                  onClick={close}
                >
                  <X size={18} strokeWidth={1.75} />
                </button>
              </div>
              <fieldset className="drw-field">
                <legend>주문 상태</legend>
                {statuses.map((status, index) => (
                  <label key={status}>
                    <input
                      ref={index === 0 ? firstRef : undefined}
                      type="checkbox"
                      defaultChecked={index < 2}
                    />
                    {status}
                  </label>
                ))}
              </fieldset>
              <div className="drw-actions">
                <button type="button" className="drw-button" onClick={close}>
                  초기화
                </button>
                <button
                  type="button"
                  className="drw-button is-primary"
                  onClick={close}
                >
                  결과 보기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
