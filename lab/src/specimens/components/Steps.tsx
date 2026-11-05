import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { Check, ChevronLeft } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { Params, SpecimenProps } from "../types";
import "./Steps.css";

// params: progress(bar | count | dots), pace(one | group), advance(auto | bottom | inline), motion(slide | fade | instant), back(header | button)
// 정기 배송 설정을 원두, 주기, 주소, 확인 순서로 진행한다. pace가 group이면 원두와 주기를 한 화면에 묶는다.
// advance가 auto일 때 '다음' 버튼은 아래에 폭을 채워 고정한다. 확인 화면의 '시작하기'와 완료 뒤 '처음으로'도 같은 자리에 둔다.
// 같이 재생은 실제 초점을 옮기지 않고 원두 고름, 주기 고름, 주소 입력, 다음, 뒤로, 다시 앞으로, 처음으로를 한다.

type Choice = "bean" | "cycle";
type Question = Choice | "address";
type Answers = Record<Choice, string | null> & { address: string };

const choices: Record<
  Choice,
  {
    title: string;
    label: string;
    options: { id: string; name: string; note?: string }[];
  }
> = {
  bean: {
    title: "어떤 원두를 받을까요?",
    label: "원두",
    options: [
      { id: "ethiopia", name: "에티오피아", note: "꽃향, 밝은 산미" },
      { id: "brazil", name: "브라질", note: "고소함, 초콜릿" },
      { id: "colombia", name: "콜롬비아", note: "묵직한 단맛" },
    ],
  },
  cycle: {
    title: "얼마나 자주 받을까요?",
    label: "주기",
    options: [
      { id: "2w", name: "2주마다" },
      { id: "3w", name: "3주마다" },
      { id: "4w", name: "4주마다" },
    ],
  },
};

// 질문 화면 목록. 그 뒤에 확인 화면과 완료 화면이 이어진다
const flows: Record<string, Question[][]> = {
  one: [["bean"], ["cycle"], ["address"]],
  group: [["bean", "cycle"], ["address"]],
};

const empty: Answers = { bean: null, cycle: null, address: "" };
const AUTO_ADVANCE_MS = 300;
// 같이 재생에서 고른 뒤 '다음'을 누르기까지. 밝아진 버튼이 보일 만큼 둔다
const DEMO_PRESS_MS = 450;
const DEMO_ADDRESS = "서울시 마포구 연남로 12";

const demoSteps: {
  choose?: [Choice, string];
  type?: string;
  next?: true;
  back?: true;
  reset?: true;
}[] = [
  { choose: ["bean", "brazil"] },
  { choose: ["cycle", "2w"] },
  { type: DEMO_ADDRESS },
  { next: true },
  { back: true },
  { next: true },
  { reset: true },
];

function isAnswered(question: Question, answers: Answers) {
  return question === "address"
    ? answers.address.trim() !== ""
    : answers[question] !== null;
}

// 보기 하나를 고르는 질문이 혼자 있는 화면만 고르면 바로 넘어간다
function advancesOnChoice(questions: Question[], advance: string) {
  return (
    advance === "auto" && questions.length === 1 && questions[0] !== "address"
  );
}

function optionName(choice: Choice, id: string | null) {
  return choices[choice].options.find((option) => option.id === id)?.name;
}

export default function Steps({ params }: SpecimenProps) {
  // 한 화면의 양이 바뀌면 단계 수가 달라지므로 처음부터 다시 진행한다
  return <Flow key={params.pace} params={params} />;
}

function Flow({ params }: { params: Params }) {
  const [answers, setAnswers] = useState<Answers>(empty);
  const [position, setPosition] = useState<{
    index: number;
    direction: number;
  }>({ index: 0, direction: 1 });
  const timer = useRef<number | undefined>(undefined);
  const seconds = useSeconds();
  const { progress, pace, advance, back } = params;
  const change = params.motion;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const asks = flows[pace];
  const stepCount = asks.length + 1;
  const confirmIndex = asks.length;
  const doneIndex = asks.length + 1;
  const { index, direction } = position;
  const questions = asks[index] ?? [];
  const answered = questions.every((question) => isAnswered(question, answers));
  const autoAdvances = advancesOnChoice(questions, advance);
  const canGoBack = index > 0 && index < doneIndex;
  const current = Math.min(index + 1, stepCount);

  const go = (nextIndex: number, nextDirection: number) => {
    window.clearTimeout(timer.current);
    setPosition({ index: nextIndex, direction: nextDirection });
  };

  const goNext = () => {
    if (index >= doneIndex || (index < confirmIndex && !answered)) return;
    go(index + 1, 1);
  };

  const goBack = () => {
    if (canGoBack) go(index - 1, -1);
  };

  const reset = () => {
    window.clearTimeout(timer.current);
    setAnswers(empty);
    setPosition({ index: 0, direction: -1 });
  };

  // 화면을 옮기거나 다시 고르면 타이머를 지우므로 예약한 화면에서만 넘어간다
  const advanceLater = (from: number, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setPosition({ index: from + 1, direction: 1 }),
      seconds(ms) * 1000,
    );
  };

  const choose = (choice: Choice, value: string) => {
    window.clearTimeout(timer.current);
    setAnswers((previous) => ({ ...previous, [choice]: value }));
    if (autoAdvances) advanceLater(index, AUTO_ADVANCE_MS);
  };

  const setAddress = (value: string) =>
    setAnswers((previous) => ({ ...previous, address: value }));

  useDemo((tick) => {
    const step = demoSteps[(tick - 1) % demoSteps.length];
    if (step.reset) reset();
    if (step.next) goNext();
    if (step.back) goBack();
    if (step.type !== undefined && questions.includes("address"))
      setAddress(step.type);
    if (step.choose && questions.includes(step.choose[0])) {
      const [choice, value] = step.choose;
      choose(choice, value);
      const next = { ...answers, [choice]: value };
      // 저절로 넘어가지 않는 화면은 '다음'을 누르는 것까지 이 단계에서 한다
      if (!autoAdvances && questions.every((q) => isAnswered(q, next)))
        advanceLater(index, DEMO_PRESS_MS);
    }
  });

  const offset = change === "slide" ? 24 : 0;
  const hiddenOpacity = change === "instant" ? 1 : 0;
  const variants: Variants = {
    enter: (dir: number) => ({ x: offset * dir, opacity: hiddenOpacity }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: -offset * dir, opacity: hiddenOpacity }),
  };
  const duration = change === "slide" ? 220 : change === "fade" ? 160 : 0;

  const primary =
    index < confirmIndex
      ? autoAdvances
        ? null
        : { label: "다음", disabled: !answered, onClick: goNext }
      : index === confirmIndex
        ? { label: "시작하기", disabled: false, onClick: goNext }
        : { label: "처음으로", disabled: false, onClick: reset };
  const showPrevious = back === "button" && canGoBack;
  const actions = (primary || showPrevious) && (
    <div className="stp-actions">
      {showPrevious && (
        <button type="button" className="stp-previous" onClick={goBack}>
          이전
        </button>
      )}
      {primary && (
        <button
          type="button"
          className="stp-next"
          disabled={primary.disabled}
          onClick={primary.onClick}
        >
          {primary.label}
        </button>
      )}
    </div>
  );

  const screen =
    index < confirmIndex ? (
      questions.map((question) =>
        question === "address" ? (
          <AddressQuestion
            key={question}
            value={answers.address}
            onChange={setAddress}
            onSubmit={goNext}
          />
        ) : (
          <ChoiceQuestion
            key={question}
            choice={question}
            value={answers[question]}
            onChoose={(value) => choose(question, value)}
          />
        ),
      )
    ) : index === confirmIndex ? (
      <section className="stp-question">
        <h4>이대로 시작할까요?</h4>
        <dl className="stp-summary">
          <div>
            <dt>{choices.bean.label}</dt>
            <dd>{optionName("bean", answers.bean)}</dd>
          </div>
          <div>
            <dt>{choices.cycle.label}</dt>
            <dd>{optionName("cycle", answers.cycle)}</dd>
          </div>
          <div>
            <dt>주소</dt>
            <dd>{answers.address}</dd>
          </div>
        </dl>
      </section>
    ) : (
      <section className="stp-done">
        <span className="stp-done-icon">
          <Check size={22} strokeWidth={2} aria-hidden />
        </span>
        <h4>정기 배송을 시작했어요</h4>
      </section>
    );

  return (
    <div className="stp-frame" data-pace={pace}>
      {progress === "bar" && (
        <div
          className="stp-bar"
          role="progressbar"
          aria-label="진행"
          aria-valuemin={1}
          aria-valuemax={stepCount}
          aria-valuenow={current}
        >
          <motion.span
            initial={false}
            animate={{ scaleX: current / stepCount }}
            transition={{ duration: seconds(220), ease: EASE_OUT }}
          />
        </div>
      )}
      <header className="stp-header">
        {back === "header" && (
          <button
            type="button"
            className={canGoBack ? "stp-back" : "stp-back is-hidden"}
            aria-label="이전 단계"
            onClick={goBack}
          >
            <ChevronLeft size={22} strokeWidth={1.75} />
          </button>
        )}
        {progress === "count" && (
          <span className="stp-count">
            {current}/{stepCount}
          </span>
        )}
        {progress === "dots" && (
          <span
            className="stp-dots"
            role="img"
            aria-label={`${stepCount}단계 중 ${current}단계`}
          >
            {Array.from({ length: stepCount }, (_, dot) => (
              <span key={dot} className={dot < current ? "is-on" : undefined} />
            ))}
          </span>
        )}
      </header>
      <div className="stp-body">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={index}
            className="stp-screen"
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: seconds(duration), ease: EASE_OUT }}
          >
            {screen}
            {advance === "inline" && actions}
          </motion.div>
        </AnimatePresence>
      </div>
      {advance !== "inline" && actions && (
        <footer className="stp-footer">{actions}</footer>
      )}
    </div>
  );
}

function ChoiceQuestion({
  choice,
  value,
  onChoose,
}: {
  choice: Choice;
  value: string | null;
  onChoose: (value: string) => void;
}) {
  const titleId = useId();
  const { title, options } = choices[choice];

  return (
    <section className="stp-question">
      <h4 id={titleId}>{title}</h4>
      <div
        role="group"
        aria-labelledby={titleId}
        className="stp-options"
        data-choice={choice}
      >
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="stp-option"
            aria-pressed={value === option.id}
            onClick={() => onChoose(option.id)}
          >
            <span className="stp-option-name">{option.name}</span>
            {option.note && (
              <span className="stp-option-note">{option.note}</span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function AddressQuestion({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const inputId = useId();

  return (
    <section className="stp-question">
      <h4>
        <label htmlFor={inputId}>어디로 보내 드릴까요?</label>
      </h4>
      <input
        id={inputId}
        className="stp-input"
        autoComplete="off"
        placeholder="도로명 주소"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing)
            onSubmit();
        }}
      />
    </section>
  );
}
