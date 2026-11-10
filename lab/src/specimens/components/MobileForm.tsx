import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Phone.css";

// params: submit(end | fixed | header), keyboard(follow | hide, submit이 fixed일 때만)
// 휴대폰 화면을 무대 안에 그리고, 입력칸에 초점이 가면 화면 키보드를 흉내 낸 판을 아래에서 올린다.
// 키보드 판은 모든 값에서 같고(196px, 250ms), 비교하는 것은 저장 버튼의 자리와 키보드가 열렸을 때의 처리다.

const KEYBOARD = 196;
const BAR = 69;

const fields = [
  { id: "name", label: "받는 분", value: "김하늘", autoComplete: "name" },
  {
    id: "phone",
    label: "연락처",
    value: "010-1234-5678",
    autoComplete: "tel",
    inputMode: "tel" as const,
  },
  {
    id: "address",
    label: "주소",
    value: "서울시 마포구 월드컵북로 396",
    autoComplete: "street-address",
  },
  {
    id: "detail",
    label: "상세 주소",
    value: "",
    placeholder: "동, 호수",
    autoComplete: "address-line2",
  },
];

export default function MobileForm({ params }: SpecimenProps) {
  const [keyboard, setKeyboard] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const seconds = useSeconds();
  const reduced = useReducedMotion();
  const { submit } = params;
  const fixed = submit === "fixed";
  const barShown = fixed && !(keyboard && params.keyboard === "hide");
  const timing = { duration: reduced ? 0 : seconds(250), ease: EASE_OUT };
  const keyboardSpace = keyboard ? KEYBOARD : 0;

  const scrollBody = (top: number | "end") => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTo({
      top: top === "end" ? body.scrollHeight : top,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  // 초점이 간 입력칸을 키보드 위 보이는 영역의 위쪽으로 옮긴다. 모든 값에서 같다.
  // 본문 높이가 키보드만큼 줄어든 뒤에 옮겨야 아래쪽 입력칸도 끝까지 올라간다
  useEffect(() => {
    if (!keyboard || !active) return;
    const timer = window.setTimeout(
      () => {
        const field = frameRef.current?.querySelector<HTMLElement>(
          `[data-field="${active}"]`,
        );
        if (field) scrollBody(Math.max(0, field.offsetTop - 16));
      },
      reduced ? 0 : seconds(260) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [keyboard, active]);

  // 시연: 받는 분 입력(키보드 열림), 상세 주소로 이동, 키보드 닫고 끝까지 내림, 맨 위로
  useDemo((tick) => {
    const step = tick % 4;
    if (step === 1) {
      setActive("name");
      setKeyboard(true);
    }
    if (step === 2) setActive("detail");
    if (step === 3) {
      setKeyboard(false);
      setActive(null);
      window.setTimeout(() => scrollBody("end"), seconds(260) * 1000);
    }
    if (step === 0) scrollBody(0);
  });

  const onFocus = (fieldId: string) => {
    setActive(fieldId);
    setKeyboard(true);
  };

  const onBlur = () => {
    // 다른 입력칸으로 옮겨 가는 중이면 키보드를 닫지 않는다
    window.setTimeout(() => {
      const current = document.activeElement;
      const inside =
        current instanceof HTMLElement &&
        frameRef.current?.contains(current) &&
        current.matches("input, textarea");
      if (!inside) {
        setKeyboard(false);
        setActive(null);
      }
    }, 0);
  };

  const done = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    setKeyboard(false);
    setActive(null);
  };

  return (
    <div ref={frameRef} className="ph-frame">
      <div className="ph-head">
        <button type="button" className="ph-icon" aria-label="뒤로">
          <ChevronLeft size={20} strokeWidth={1.75} />
        </button>
        <h3>배송지 입력</h3>
        {submit === "header" && (
          <button type="button" className="ph-text-button">
            저장
          </button>
        )}
      </div>

      <motion.div
        ref={bodyRef}
        className="ph-body"
        initial={false}
        animate={{ bottom: keyboardSpace + (barShown ? BAR : 0) }}
        transition={timing}
      >
        <form className="pfm-form" onSubmit={(event) => event.preventDefault()}>
          {fields.map((field) => (
            <div
              key={field.id}
              className="pfm-field"
              data-field={field.id}
              data-active={active === field.id}
            >
              <label htmlFor={`${id}-${field.id}`}>{field.label}</label>
              <input
                id={`${id}-${field.id}`}
                defaultValue={field.value}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                inputMode={field.inputMode}
                onFocus={() => onFocus(field.id)}
                onBlur={onBlur}
              />
            </div>
          ))}
          <div
            className="pfm-field"
            data-field="memo"
            data-active={active === "memo"}
          >
            <label htmlFor={`${id}-memo`}>배송 요청 사항</label>
            <textarea
              id={`${id}-memo`}
              placeholder="문 앞에 놓아 주세요"
              onFocus={() => onFocus("memo")}
              onBlur={onBlur}
            />
          </div>
          {submit === "end" && (
            <button
              type="submit"
              className="ph-button is-primary pfm-submit-end"
            >
              저장
            </button>
          )}
        </form>
      </motion.div>

      {fixed && (
        <motion.div
          className="pfm-bar"
          initial={false}
          animate={{
            bottom: params.keyboard === "follow" ? keyboardSpace : 0,
            opacity: barShown ? 1 : 0,
          }}
          style={{ visibility: barShown ? "visible" : "hidden" }}
          transition={timing}
        >
          <button type="button" className="ph-button is-primary">
            저장
          </button>
        </motion.div>
      )}

      <AnimatePresence>
        {keyboard && (
          <motion.div
            key="keyboard"
            className="pfm-keyboard"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={timing}
          >
            <div className="pfm-keyboard-bar">
              <span>화면 키보드(흉내)</span>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={done}
              >
                완료
              </button>
            </div>
            <div className="pfm-keys" aria-hidden="true">
              {[10, 9, 7].map((count, row) => (
                <div key={row}>
                  {Array.from({ length: count }, (_, key) => (
                    <span key={key} />
                  ))}
                </div>
              ))}
              <div>
                <span />
                <span className="is-wide" />
                <span />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
