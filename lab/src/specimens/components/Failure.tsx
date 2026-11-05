import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, type Transition } from "motion/react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Failure.css";

// params: cause(split | same), place(field | result | banner), retry(inline | row | search)
// 실제로 요청하지 않고 조회를 흉내 낸다. 처음으로 돌아간 뒤 있는 번호를 처음 찾을 때만 연결이 끊겨 실패한다.
// 같이 재생은 없는 번호 입력, 찾기, 있는 번호로 고침, 찾기(연결 실패), 다시 시도, 찾은 결과 보기, 처음으로를 한다.

type Outcome = "idle" | "missing" | "offline" | "found";

const MEMBER = { number: "20481937", name: "김하늘", grade: "골드 회원" };
const LOOKUP_MS = 500;

const demoSteps: { type?: string; find?: true; reset?: true }[] = [
  { type: "1234" },
  { find: true },
  { type: MEMBER.number },
  { find: true },
  { find: true },
  {},
  { reset: true },
];

export default function Failure({ params }: SpecimenProps) {
  const [value, setValue] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("idle");
  // 다시 찾는 동안에도 앞선 실패 문구를 남겨 두므로 결과와 따로 둔다
  const [pending, setPending] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // 처음으로 돌아가거나 화면을 떠난 뒤 도착한 조회 결과를 버리기 위한 번호
  const request = useRef(0);
  const offlineServed = useRef(false);
  const seconds = useSeconds();
  const inputId = useId();
  const noteId = `${inputId}-note`;
  const { cause, place, retry } = params;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const find = () => {
    if (pending) return;
    const current = ++request.current;
    setPending(true);
    timer.current = window.setTimeout(
      () => {
        if (current !== request.current) return;
        setPending(false);
        if (value.trim() !== MEMBER.number) {
          setOutcome("missing");
        } else if (!offlineServed.current) {
          offlineServed.current = true;
          setOutcome("offline");
        } else {
          setOutcome("found");
        }
      },
      seconds(LOOKUP_MS) * 1000,
    );
  };

  const cancel = () => {
    window.clearTimeout(timer.current);
    request.current++;
    setPending(false);
  };

  const type = (next: string) => {
    // 번호를 고치면 찾는 중이던 결과와 앞선 결과는 더 이상 이 번호의 것이 아니다
    cancel();
    setValue(next);
    setOutcome("idle");
  };

  const reset = () => {
    cancel();
    offlineServed.current = false;
    setValue("");
    setOutcome("idle");
  };

  useDemo((tick) => {
    const step = demoSteps[(tick - 1) % demoSteps.length];
    if (step.reset) reset();
    if (step.type !== undefined) type(step.type);
    if (step.find) find();
  });

  const failed = outcome === "missing" || outcome === "offline";
  const inputProblem = cause === "split" && outcome === "missing";
  const retryable = failed && !inputProblem;
  const slot = !failed ? null : inputProblem ? "field" : place;
  const message =
    cause === "same"
      ? "회원을 찾지 못했어요"
      : outcome === "missing"
        ? "없는 회원 번호예요"
        : "연결이 끊겨 찾지 못했어요";
  const swap = { duration: seconds(160), ease: EASE_OUT };
  const grow = { duration: seconds(200), ease: EASE_OUT };

  const retryLink = retryable && retry === "inline" && (
    <button
      type="button"
      className="flr-link"
      disabled={pending}
      onClick={find}
    >
      다시 시도
    </button>
  );
  const retryRow = (show: boolean) => (
    <Grow show={show && retryable && retry === "row"} transition={grow}>
      <button
        type="button"
        className="flr-retry"
        disabled={pending}
        onClick={find}
      >
        다시 시도
      </button>
    </Grow>
  );
  const findLabel = pending
    ? "찾는 중"
    : retryable && retry === "search"
      ? "다시 찾기"
      : "찾기";

  return (
    <div className="flr-page">
      <h3>쿠폰 보내기</h3>
      <AnimatePresence initial={false}>
        {slot === "banner" && (
          <motion.div
            key="banner"
            className="flr-banner"
            role="alert"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={grow}
          >
            <div className="flr-banner-body">
              <p className="flr-message">
                <span>{message}</span>
                {retryLink}
              </p>
              {retry === "row" && retryable && (
                <button
                  type="button"
                  className="flr-retry"
                  disabled={pending}
                  onClick={find}
                >
                  다시 시도
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <form
        className={["flr-search", inputProblem && "is-invalid"]
          .filter(Boolean)
          .join(" ")}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          find();
        }}
      >
        <label htmlFor={inputId} className="flr-label">
          회원 번호
        </label>
        <div className="flr-row">
          <input
            id={inputId}
            inputMode="numeric"
            autoComplete="off"
            placeholder={MEMBER.number}
            value={value}
            aria-invalid={inputProblem}
            aria-describedby={noteId}
            onChange={(event) => type(event.target.value)}
          />
          <button type="submit" className="flr-find" disabled={pending}>
            {findLabel}
          </button>
        </div>
        <p id={noteId} className="flr-note" aria-live="polite">
          <Swap show={slot === "field"} id={message} transition={swap}>
            <span>{message}</span>
            {retryLink}
          </Swap>
        </p>
        {retryRow(slot === "field")}
      </form>
      <div className="flr-result" aria-live="polite">
        <AnimatePresence initial={false}>
          {outcome === "found" && (
            <motion.p
              key="found"
              className="flr-member"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={swap}
            >
              <strong>{MEMBER.name}</strong>
              <span>{MEMBER.grade}</span>
            </motion.p>
          )}
          {slot === "result" && (
            <motion.p
              key={message}
              className="flr-message"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={swap}
            >
              <span>{message}</span>
              {retryLink}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      {retryRow(slot === "result")}
      <div className="flr-actions">
        <button
          type="button"
          className="flr-send"
          disabled={outcome !== "found"}
        >
          보내기
        </button>
      </div>
    </div>
  );
}

// 미리 잡아 둔 한 줄 안에서 문구를 겹쳐 바꾼다. 줄의 높이는 CSS가 고정한다
function Swap({
  show,
  id,
  transition,
  children,
}: {
  show: boolean;
  id: string;
  transition: Transition;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          key={id}
          className="flr-message"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

// 새 줄을 펼치며 아래 내용을 민다. '아래 줄 버튼' 값이 만드는 밀림을 그대로 보이기 위해서다
function Grow({
  show,
  transition,
  children,
}: {
  show: boolean;
  transition: Transition;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          className="flr-grow"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={transition}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
