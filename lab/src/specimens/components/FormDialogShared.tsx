import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { EASE_OUT_CUBIC, useSeconds } from "../stage";
import "./FormDialog.css";

// 세 무대를 동시에 비교해야 하므로 문서 전체를 잠그는 showModal은 쓰지 않는다.
// 배경 차단은 각 무대에만 적용한다. 실제 제품은 dialog/Radix 등의 모달 프리미티브를 사용한다.
export function FormDialogShell({
  open,
  userOpened,
  title,
  onClose,
  onSubmit,
  children,
  actions,
  triggerRef,
  formRef,
  focus = "field",
  scroll = "body",
  height = "fit",
}: {
  open: boolean;
  userOpened: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
  actions: ReactNode;
  triggerRef: RefObject<HTMLButtonElement | null>;
  formRef: RefObject<HTMLFormElement | null>;
  focus?: string;
  scroll?: string;
  height?: string;
}) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  const seconds = useSeconds();
  const reduced = useReducedMotion();
  const timing = { duration: reduced ? 0 : seconds(220), ease: EASE_OUT_CUBIC };

  useLayoutEffect(() => {
    if (open) restoreFocus.current = false;
    if (open && userOpened) {
      const target =
        focus === "heading"
          ? titleRef.current
          : (formRef.current?.querySelector<HTMLElement>(
              "[data-initial-field]",
            ) ?? titleRef.current);
      target?.focus({ preventScroll: true });
    }
    if (!open)
      restoreFocus.current = Boolean(
        formRef.current?.contains(document.activeElement),
      );
  }, [open, userOpened, focus, formRef, title]);

  return (
    <AnimatePresence
      onExitComplete={() => {
        const focused = document.activeElement;
        if (
          restoreFocus.current &&
          (focused === document.body || formRef.current?.contains(focused))
        )
          triggerRef.current?.focus({ preventScroll: true });
        restoreFocus.current = false;
      }}
    >
      {open && (
        <div
          className="mfd-layer"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onClose();
            }
          }}
        >
          <motion.div
            className="mfd-backdrop"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={timing}
            onClick={onClose}
          />
          <motion.form
            ref={formRef}
            role="dialog"
            aria-labelledby={titleId}
            className="mfd-form"
            data-scroll={scroll}
            data-height={height}
            noValidate
            layout={reduced ? false : "size"}
            initial={{ opacity: 0, scale: reduced ? 1 : 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduced ? 1 : 0.97 }}
            transition={timing}
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <motion.header
              layout={reduced ? false : "position"}
              className="mfd-header"
            >
              <h4 id={titleId} ref={titleRef} tabIndex={-1}>
                {title}
              </h4>
              <button
                type="button"
                className="mfd-close"
                aria-label="닫기"
                onClick={onClose}
              >
                <X size={18} aria-hidden />
              </button>
            </motion.header>
            <motion.div
              layout={reduced ? false : "position"}
              className="mfd-content"
            >
              {children}
            </motion.div>
            <motion.footer
              layout={reduced ? false : "position"}
              className="mfd-actions"
            >
              {actions}
            </motion.footer>
          </motion.form>
        </div>
      )}
    </AnimatePresence>
  );
}

export function FormControl({
  name,
  label,
  value,
  onChange,
  error = "",
  kind = "text",
  options,
  initial = false,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  kind?: "text" | "email" | "number" | "textarea" | "select";
  options?: { value: string; label: string }[];
  initial?: boolean;
}) {
  const id = useId();
  const shared = {
    id,
    name,
    value,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
    "data-initial-field": initial ? "true" : undefined,
  } as const;
  return (
    <div className="mfd-control">
      <label htmlFor={id}>{label}</label>
      {kind === "textarea" ? (
        <textarea
          {...shared}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : kind === "select" ? (
        <select {...shared} onChange={(event) => onChange(event.target.value)}>
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...shared}
          type={kind}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <span className="mfd-error" id={`${id}-error`}>
        {error}
      </span>
    </div>
  );
}

// 저장은 실제 통신 없이 600ms로 재현한다. 닫거나 무대를 초기화하면 완료 알림도 취소한다.
export function useFormSave() {
  const [saving, setSaving] = useState(false);
  const timer = useRef<number>(undefined);
  const seconds = useSeconds();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setSaving(false);
  };
  const save = (complete: () => void) => {
    if (timer.current !== undefined) return;
    setSaving(true);
    timer.current = window.setTimeout(
      () => {
        timer.current = undefined;
        setSaving(false);
        complete();
      },
      seconds(600) * 1000,
    );
  };
  return { saving, save, cancel };
}

export const validEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function focusFormField(form: HTMLFormElement | null, name: string) {
  const field = form?.elements.namedItem(name);
  if (field instanceof HTMLElement) field.focus();
}
