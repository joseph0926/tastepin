import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Field.css";

// params: surface(outline | filled | underline), label(top | float | side), timing(blur | live | submit), message(reserve | helper | inside)
// 같이 재생은 실제 초점을 옮기지 않고 입력과 칸 이동을 흉내 낸다. 다른 무대와 평가 입력의 초점을 빼앗지 않기 위해서다.

type FieldId = "email" | "name";

const fields: { id: FieldId; label: string; helper: string; type: string }[] = [
  {
    id: "email",
    label: "이메일",
    helper: "회사 이메일을 적어 주세요",
    type: "email",
  },
  { id: "name", label: "이름", helper: "실명으로 적어 주세요", type: "text" },
];

function validate(id: FieldId, value: string) {
  if (!value.trim())
    return id === "email" ? "이메일을 적어 주세요" : "이름을 적어 주세요";
  if (id === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))
    return "이메일 형식이 아니에요. 예: name@company.com";
  return "";
}

// 시연 순서: 이메일에 입력, 더 입력, 이름 칸으로 이동, 이름 입력, 제출, 이메일 고침, 처음으로
const demoSteps: {
  focus?: FieldId | null;
  set?: Partial<Record<FieldId, string>>;
  submit?: true;
  reset?: true;
}[] = [
  { focus: "email", set: { email: "kim" } },
  { set: { email: "kim@team" } },
  { focus: "name" },
  { set: { name: "김하늘" } },
  { focus: null, submit: true },
  { focus: "email", set: { email: "kim@team.kr" } },
  { focus: null, reset: true },
];

const empty = { email: "", name: "" };
const hidden = { email: false, name: false };

export default function Field({ params }: SpecimenProps) {
  const [values, setValues] = useState<Record<FieldId, string>>(empty);
  const [visible, setVisible] = useState<Record<FieldId, boolean>>(hidden);
  const [focused, setFocused] = useState<FieldId | null>(null);
  const timers = useRef<Partial<Record<FieldId, number>>>({});
  const inputs = useRef<Partial<Record<FieldId, HTMLInputElement | null>>>({});
  const seconds = useSeconds();
  const { surface, label, timing, message } = params;

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach((t) => window.clearTimeout(t));
  }, []);

  const show = (id: FieldId, on: boolean) =>
    setVisible((current) => ({ ...current, [id]: on }));

  const change = (id: FieldId, value: string) => {
    setValues((current) => ({ ...current, [id]: value }));
    const error = validate(id, value);
    // 이미 보인 오류는 고치는 즉시 지운다
    if (!error) show(id, false);
    if (timing === "live") {
      window.clearTimeout(timers.current[id]);
      timers.current[id] = window.setTimeout(
        () => show(id, Boolean(error)),
        seconds(400) * 1000,
      );
    }
  };

  const leave = (id: FieldId) => {
    if (timing === "blur") show(id, Boolean(validate(id, values[id])));
  };

  const moveFocus = (next: FieldId | null) => {
    if (focused && focused !== next) leave(focused);
    setFocused(next);
  };

  const submit = (byUser: boolean) => {
    const next = {
      email: Boolean(validate("email", values.email)),
      name: Boolean(validate("name", values.name)),
    };
    setVisible(next);
    const first = fields.find((field) => next[field.id]);
    if (byUser && first)
      inputs.current[first.id]?.focus({ preventScroll: true });
  };

  useDemo((tick) => {
    const step = demoSteps[(tick - 1) % demoSteps.length];
    if (step.reset) {
      setValues(empty);
      setVisible(hidden);
      setFocused(null);
      return;
    }
    if (step.focus !== undefined) moveFocus(step.focus);
    if (step.set)
      for (const [id, value] of Object.entries(step.set))
        change(id as FieldId, value);
    if (step.submit) submit(false);
  });

  return (
    <form
      className="fld-page"
      data-surface={surface}
      data-label={label}
      data-message={message}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit(true);
      }}
    >
      <h3>계정 만들기</h3>
      {fields.map((field) => (
        <Control
          key={field.id}
          field={field}
          value={values[field.id]}
          error={visible[field.id] ? validate(field.id, values[field.id]) : ""}
          focused={focused === field.id}
          surface={surface}
          label={label}
          message={message}
          seconds={seconds}
          inputRef={(element) => {
            inputs.current[field.id] = element;
          }}
          onChange={(value) => change(field.id, value)}
          onFocus={() => moveFocus(field.id)}
          onBlur={() => {
            leave(field.id);
            setFocused((current) => (current === field.id ? null : current));
          }}
        />
      ))}
      <div className="fld-actions">
        <button type="submit" className="fld-submit">
          가입하기
        </button>
      </div>
    </form>
  );
}

interface ControlProps {
  field: (typeof fields)[number];
  value: string;
  error: string;
  focused: boolean;
  surface: string;
  label: string;
  message: string;
  seconds: (ms: number) => number;
  inputRef: (element: HTMLInputElement | null) => void;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

function Control({
  field,
  value,
  error,
  focused,
  surface,
  label,
  message,
  seconds,
  inputRef,
  onChange,
  onFocus,
  onBlur,
}: ControlProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const floated = label !== "float" || focused || value !== "";
  const swap = { duration: seconds(160), ease: EASE_OUT };
  const marked = Boolean(error) && message !== "inside";
  const note = error || (message === "helper" ? field.helper : "");

  return (
    <div
      className={[
        "fld-control",
        focused && "is-focused",
        marked && "is-invalid",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <motion.label
        htmlFor={id}
        className="fld-label"
        initial={false}
        animate={
          floated
            ? { x: 0, y: 0, scale: 1 }
            : { x: surface === "underline" ? 0 : 12, y: 32, scale: 15 / 13 }
        }
        transition={swap}
      >
        {field.label}
      </motion.label>
      <div className="fld-box">
        <input
          ref={inputRef}
          id={id}
          type={field.type}
          value={value}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={messageId}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <AnimatePresence initial={false}>
          {message === "inside" && error && (
            <motion.span
              key="icon"
              className="fld-alert"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={swap}
            >
              <CircleAlert size={18} strokeWidth={1.75} />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p id={messageId} className="fld-note" aria-live="polite">
        <AnimatePresence initial={false}>
          {note && (
            <motion.span
              key={note}
              className={error ? "is-error" : undefined}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={swap}
            >
              {note}
            </motion.span>
          )}
        </AnimatePresence>
      </p>
    </div>
  );
}
