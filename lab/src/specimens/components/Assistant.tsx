import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type Transition } from "motion/react";
import { ArrowUp, Check } from "lucide-react";
import { EASE_OUT_CUBIC, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Assistant.css";

// params: composer(dock | form | suggest), pending(dots | shimmer | steps), reveal(word | block | whole),
// layout(bubble | plain | sections)
// 내 상황을 적으면 해당하는 주거 제도를 찾아 주는 AI 분석 화면이다. 모델을 부르지 않고 1.2초 기다린 뒤
// 낱말을 45ms마다 하나씩 받는 흐름을 흉내 낸다. 받는 속도는 모든 값에서 같고, 보이는 방식만 다르다.

const WAIT_MS = 1200;
const WORD_MS = 45;
const TYPE_MS = 16;
const ENTER_MS = 220;
const WORD_ENTER_MS = 180;
const STAGGER_MS = 80;

interface Answer {
  summary: string;
  items: string[];
  next: string;
}

const examples: { label: string; question: string; answer: Answer }[] = [
  {
    label: "월세 사는 직장인",
    question:
      "서울에서 월세로 사는 스물일곱 살 직장인이에요. 바뀐 주거 제도 중 저한테 해당하는 게 있나요?",
    answer: {
      summary: "해당할 가능성이 높은 제도가 두 가지 있어요.",
      items: [
        "청년 월세 지원: 소득과 재산 기준 안이면 월세 일부를 1년 동안 받아요.",
        "전입신고와 확정일자: 아직 안 했다면 보증금을 지키기 위해 먼저 해 두세요.",
      ],
      next: "주민센터 누리집에서 소득 기준표를 확인하고 신청 기간을 알림으로 받아 두세요.",
    },
  },
  {
    label: "전세 계약을 앞두고",
    question: "다음 달에 전세 계약을 해요. 계약 전에 확인할 제도가 있나요?",
    answer: {
      summary: "계약 전에 확인할 것이 두 가지 있어요.",
      items: [
        "전세보증금 반환보증: 가입할 수 있는 집인지 계약 전에 조회해 보세요.",
        "임대인 정보 확인: 세금 체납과 먼저 잡힌 보증금을 계약 전에 요청할 수 있어요.",
      ],
      next: "계약서 특약을 쓰기 전에 보증 가입 조건부터 확인하세요.",
    },
  },
  {
    label: "부모님 집에서 독립",
    question: "부모님 집에 살다가 독립하려고 해요. 받을 수 있는 지원이 있나요?",
    answer: {
      summary: "독립 전에 알아 둘 지원이 두 가지 있어요.",
      items: [
        "청년 전용 보증금 대출: 보증금을 낮은 금리로 빌릴 수 있어요.",
        "청년 월세 지원: 부모님과 따로 살면 소득 기준을 따로 볼 수 있어요.",
      ],
      next: "살 동네를 정했다면 그 지역의 지원 공고부터 확인하세요.",
    },
  },
];

const STEPS = ["상황 읽기", "관련 제도 찾기", "답 정리하기"];

type Role = "summary" | "title" | "item" | "text";

interface Segment {
  role: Role;
  words: string[];
  // 이 조각의 첫 낱말이 전체 답에서 몇 번째인지
  start: number;
}

// 답을 묶음(요약, 해당하는 제도, 다음에 할 일)으로 나눈다. 소제목은 묶어 나눔 모양에서만 받는다
function blocksFor(answer: Answer, titled: boolean) {
  const raw: { role: Role; text: string }[][] = [
    [{ role: "summary", text: answer.summary }],
    [
      ...(titled ? [{ role: "title" as const, text: "해당하는 제도" }] : []),
      ...answer.items.map((text) => ({ role: "item" as const, text })),
    ],
    [
      ...(titled ? [{ role: "title" as const, text: "다음에 할 일" }] : []),
      { role: "text", text: answer.next },
    ],
  ];
  let count = 0;
  const blocks = raw.map((block) => {
    const segments = block.map(({ role, text }): Segment => {
      const words = text.split(" ");
      const segment = { role, words, start: count };
      count += words.length;
      return segment;
    });
    return { segments, end: count };
  });
  return { blocks, total: count };
}

type Phase = "idle" | "waiting" | "streaming" | "done";

export default function Assistant({ params }: SpecimenProps) {
  const seconds = useSeconds();
  const inputId = useId();
  const { composer, pending, reveal, layout } = params;
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [received, setReceived] = useState(0);
  const [stepsDone, setStepsDone] = useState(0);
  const typing = useRef<number | undefined>(undefined);
  const threadRef = useRef<HTMLDivElement>(null);

  const example = asked === null ? null : examples[asked];
  const { blocks, total } = blocksFor(
    (example ?? examples[0]).answer,
    layout === "sections",
  );
  const busy = phase === "waiting" || phase === "streaming";

  const stopTyping = () => window.clearInterval(typing.current);

  const typeOut = (text: string) => {
    stopTyping();
    let length = 0;
    typing.current = window.setInterval(
      () => {
        length += 2;
        setDraft(text.slice(0, length));
        if (length >= text.length) stopTyping();
      },
      seconds(TYPE_MS) * 1000,
    );
  };

  const ask = (index: number) => {
    stopTyping();
    setAsked(index);
    setReceived(0);
    setStepsDone(0);
    setPhase("waiting");
    // 대화형은 보낸 질문을 말풍선으로 옮기고 칸을 비운다. 폼은 질문을 칸에 남긴다
    setDraft(composer === "form" ? examples[index].question : "");
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    const index = examples.findIndex((item) => item.question === text);
    ask(index < 0 ? 0 : index);
  };

  const reset = () => {
    stopTyping();
    setDraft("");
    setAsked(null);
    setReceived(0);
    setPhase("idle");
  };

  useEffect(() => stopTyping, []);

  useEffect(() => {
    if (phase !== "waiting") return;
    const timer = window.setTimeout(
      () => setPhase("streaming"),
      seconds(WAIT_MS) * 1000,
    );
    // 단계 목록은 기다리는 동안 두 단계를 마치고, 마지막 단계는 답이 보이기 시작할 때까지 진행 중이다
    const steps = [1, 2].map((done) =>
      window.setTimeout(
        () => setStepsDone(done),
        seconds((WAIT_MS / 2) * done) * 1000 - 1,
      ),
    );
    return () => [timer, ...steps].forEach((id) => window.clearTimeout(id));
  }, [phase, seconds]);

  useEffect(() => {
    if (phase !== "streaming") return;
    const timer = window.setInterval(
      () => setReceived((count) => count + 1),
      seconds(WORD_MS) * 1000,
    );
    return () => window.clearInterval(timer);
  }, [phase, seconds]);

  useEffect(() => {
    if (phase === "streaming" && received >= total) setPhase("done");
  }, [phase, received, total]);

  // 답이 자라는 동안 대화 목록의 끝을 따라간다
  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [asked, received, phase]);

  // 시연 순서: 질문 쓰기, 보내기, 기다림과 받기 세 칸, 처음으로
  useDemo((tick) => {
    const step = (tick - 1) % 6;
    if (step === 0) {
      reset();
      if (composer === "suggest") setDraft(examples[0].question);
      else typeOut(examples[0].question);
    }
    if (step === 1) ask(0);
    if (step === 5) reset();
  });

  const visibleBlocks = blocks.filter((block) =>
    reveal === "word"
      ? block.segments[0].start < received
      : received >= (reveal === "block" ? block.end : total),
  );
  const started = example !== null && visibleBlocks.length > 0;
  const showPending = example !== null && busy && !started;

  const enter: Transition = {
    duration: seconds(ENTER_MS),
    ease: [...EASE_OUT_CUBIC],
  };
  const hidden = { opacity: 0, filter: "blur(4px)" };
  const shown = { opacity: 1, filter: "blur(0px)" };

  const words = (segment: Segment) =>
    segment.words.map((word, index) => {
      const at = segment.start + index;
      if (reveal === "word" && at >= received) return null;
      return (
        <span key={at}>
          {index > 0 && " "}
          {reveal === "word" ? (
            <motion.span
              className="ast-word"
              initial={hidden}
              animate={shown}
              transition={{
                duration: seconds(WORD_ENTER_MS),
                ease: [...EASE_OUT_CUBIC],
              }}
            >
              {word}
            </motion.span>
          ) : (
            word
          )}
        </span>
      );
    });

  const segmentView = (segment: Segment) => {
    const key = segment.start;
    // 낱말마다 받는 값은 아직 첫 낱말을 받지 않은 줄을 그리지 않는다. 빈 목록 점이 먼저 보이지 않게 한다
    if (reveal === "word" && segment.start >= received) return null;
    if (segment.role === "title") return <h5 key={key}>{words(segment)}</h5>;
    if (segment.role === "item") return <li key={key}>{words(segment)}</li>;
    const className = segment.role === "summary" ? "ast-summary" : undefined;
    return (
      <p key={key} className={className}>
        {words(segment)}
      </p>
    );
  };

  const blockView = (block: (typeof blocks)[number], index: number) => {
    const items = block.segments.filter(
      (segment) =>
        segment.role === "item" &&
        (reveal !== "word" || segment.start < received),
    );
    const others = block.segments.filter((segment) => segment.role !== "item");
    const body = (
      <>
        {others.filter((s) => s.role === "title").map(segmentView)}
        {items.length > 0 && <ul>{items.map(segmentView)}</ul>}
        {others.filter((s) => s.role !== "title").map(segmentView)}
      </>
    );
    // 낱말마다 나타나는 값은 낱말이 움직이므로 묶음은 그대로 둔다
    if (reveal === "word")
      return (
        <div key={index} className="ast-block">
          {body}
        </div>
      );
    return (
      <motion.div
        key={index}
        className="ast-block"
        initial={hidden}
        animate={shown}
        transition={{
          ...enter,
          // 한 번에 나타나는 값은 묶음을 위에서부터 80ms씩 늦춘다
          delay: reveal === "whole" ? seconds(STAGGER_MS * index) : 0,
        }}
      >
        {body}
      </motion.div>
    );
  };

  const pendingView = (
    <div className={`ast-pending pending-${pending}`} role="status">
      {pending === "dots" && (
        <span
          className="ast-dots"
          aria-label="답을 준비하고 있어요"
          style={{ ["--ast-cycle" as string]: `${seconds(1200)}s` }}
        >
          <i />
          <i />
          <i />
        </span>
      )}
      {pending === "shimmer" && (
        <span
          className="ast-shimmer"
          style={{ ["--ast-cycle" as string]: `${seconds(1600)}s` }}
        >
          {stepsDone === 0 ? "상황을 읽고 있어요" : "관련 제도를 찾고 있어요"}
        </span>
      )}
      {pending === "steps" && (
        <ol className="ast-steps">
          {STEPS.map((label, index) => {
            const done = index < stepsDone;
            const current = index === stepsDone;
            return (
              <li
                key={label}
                className={done ? "is-done" : current ? "is-current" : ""}
              >
                <span className="ast-step-mark" aria-hidden="true">
                  {done && <Check size={12} strokeWidth={2.5} />}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  // 단계 목록은 답이 보이기 시작하면 한 줄로 접힌다
  const stepsSummary = pending === "steps" && started && (
    <motion.p
      className="ast-steps-done"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={enter}
    >
      <Check size={13} strokeWidth={2.25} aria-hidden="true" />
      {STEPS.length}단계로 분석했어요
    </motion.p>
  );

  const answer = example && (
    <div className="ast-turn" aria-busy={busy}>
      {stepsSummary}
      <AnimatePresence initial={false} mode="popLayout">
        {showPending && (
          <motion.div
            key="pending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={enter}
          >
            {pendingView}
          </motion.div>
        )}
      </AnimatePresence>
      {started && (
        <div className={`ast-answer layout-${layout}`}>
          {visibleBlocks.map(blockView)}
        </div>
      )}
    </div>
  );

  const sendButton = (
    <button
      type="submit"
      className="ast-send"
      aria-label="보내기"
      disabled={!draft.trim() || busy}
    >
      <ArrowUp size={18} strokeWidth={2} aria-hidden="true" />
    </button>
  );

  if (composer === "form")
    return (
      <div className="ast-page">
        <h3>내 상황으로 분석하기</h3>
        <form
          className="ast-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor={inputId}>내 상황</label>
          <textarea
            id={inputId}
            rows={3}
            value={draft}
            placeholder="사는 곳, 집 형태, 나이처럼 판단에 필요한 것을 적어 주세요"
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="ast-form-actions">
            <button
              type="submit"
              className="ast-primary"
              disabled={!draft.trim() || busy}
            >
              분석하기
            </button>
          </div>
        </form>
        <div className="ast-result" ref={threadRef}>
          {answer}
        </div>
      </div>
    );

  return (
    <div className="ast-page">
      <h3>내 상황으로 분석하기</h3>
      <div className="ast-thread" ref={threadRef}>
        {example === null && composer === "dock" && (
          <p className="ast-hint">
            사는 곳, 집 형태, 나이를 적으면 해당하는 주거 제도를 찾아 드려요.
          </p>
        )}
        {example && (
          <motion.p
            key={`q-${asked}`}
            className="ast-question"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={enter}
          >
            {example.question}
          </motion.p>
        )}
        {answer}
      </div>
      {composer === "suggest" && example === null && (
        <div className="ast-examples" aria-label="예시 질문">
          {examples.map((item, index) => (
            <button
              key={item.label}
              type="button"
              className="ast-example"
              onClick={() => ask(index)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <form
        className="ast-bar"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="ast-sr" htmlFor={inputId}>
          내 상황
        </label>
        <input
          id={inputId}
          value={draft}
          placeholder="내 상황을 적어 주세요"
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
        />
        {sendButton}
      </form>
    </div>
  );
}
