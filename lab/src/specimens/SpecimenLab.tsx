import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
} from "motion/react";
import {
  Check,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Smartphone,
  Sun,
  Turtle,
} from "lucide-react";
import {
  fetchState,
  sendJudgment,
  undoJudgment,
  type View as LabView,
} from "./api";
import { specimens } from "./registry";
import { DemoContext, EASE_OUT, SpeedContext } from "./stage";
import { catalog } from "./types";
import type {
  CatalogComponent,
  Comparison,
  ComponentState,
  Conditions,
  LabState,
  Outcome,
} from "./types";
import "./lab.css";

const LETTERS = ["A", "B", "C"];
const SLOW_FACTOR = 4;
const DEMO_ROUNDS = 2;
const VIEW_KEY = "tastepin-specimen-view";
const TASTE_OPEN_COMMAND = "python3 -B taste.py open --no-browser";

type Phase =
  | { kind: "choose" }
  | {
      kind: "explain";
      outcome: Exclude<Outcome, "same">;
      choice: string | null;
    };

interface View {
  theme: Conditions["theme"];
  frame: Conditions["frame"];
  slow: boolean;
}

function readView(): View {
  const fallback: View = {
    theme: window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
    frame: "desktop",
    slow: false,
  };
  try {
    return {
      ...fallback,
      ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}"),
    };
  } catch {
    return fallback;
  }
}

function saveView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // 보기 설정을 저장하지 못해도 평가는 계속한다
  }
}

function requestedFromUrl() {
  return new URLSearchParams(window.location.search).get("c") ?? "";
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function findComponent(id: string): CatalogComponent | undefined {
  return catalog.components.find((component) => component.id === id);
}

function valueOf(
  component: CatalogComponent,
  dimensionId: string,
  valueId: string,
) {
  return component.dimensions
    .find((d) => d.id === dimensionId)
    ?.values.find((v) => v.id === valueId);
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/* 왼쪽 목록: 컴포넌트마다 차원별 진행 점 */

function ProgressDots({
  state,
  component,
}: {
  state: ComponentState;
  component: CatalogComponent;
}) {
  return (
    <span className="lab-dots" aria-hidden="true">
      {component.dimensions.map((dimension) => {
        const status = state.preferences[dimension.id]?.status ?? "미평가";
        return (
          <span
            key={dimension.id}
            className="lab-dot"
            data-status={status}
            title={`${dimension.label}: ${status}`}
          />
        );
      })}
    </span>
  );
}

function ComponentIndex({
  state,
  current,
  onPick,
}: {
  state: LabState;
  current: string;
  onPick: (id: string) => void;
}) {
  return (
    <nav className="lab-index" aria-label="시편">
      {state.components.map((item) => {
        const component = findComponent(item.id);
        if (!component) return null;
        return (
          <button
            key={item.id}
            type="button"
            className="lab-index-item"
            aria-current={item.id === current ? "true" : undefined}
            onClick={() => onPick(item.id)}
          >
            <span className="lab-index-label">
              {item.label}
              {component.scope === "global" && (
                <span className="lab-index-scope">전역</span>
              )}
              {component.frame === "phone" && (
                <span className="lab-index-scope">휴대폰</span>
              )}
              {!item.next && (
                <Check
                  className="lab-index-done"
                  size={14}
                  strokeWidth={2}
                  aria-label="평가 끝"
                />
              )}
            </span>
            <ProgressDots state={item} component={component} />
            {item.demand > 0 && (
              <span className="lab-index-demand">
                최근 작업 {item.demand}회
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

/* 무대: 같은 시편을 한 차원만 바꿔 나란히 */

function Stage({
  letter,
  comparison,
  option,
  revealed,
  chosen,
  demo,
  speed,
  resetKey,
}: {
  letter: string;
  comparison: Comparison;
  option: string;
  revealed: boolean;
  chosen: boolean;
  demo: number;
  speed: number;
  resetKey: number;
}) {
  const entry = specimens[comparison.component];
  const component = findComponent(comparison.component);
  const value = component
    ? valueOf(component, comparison.dimension, option)
    : undefined;
  const params = { ...comparison.params, [comparison.dimension]: option };
  const groupId = `${comparison.component}-${comparison.dimension}-${option}`;

  return (
    <section
      className="stage"
      data-chosen={chosen}
      aria-label={`변형 ${letter}`}
    >
      <header className="stage-head">
        <span className="stage-letter">{letter}</span>
        {revealed && value && (
          <span className="stage-value">{value.label}</span>
        )}
      </header>
      <div className="stage-viewport">
        {entry ? (
          <LayoutGroup id={groupId}>
            <SpeedContext.Provider value={speed}>
              <DemoContext.Provider value={demo}>
                <entry.Component key={resetKey} params={params} />
              </DemoContext.Provider>
            </SpeedContext.Provider>
          </LayoutGroup>
        ) : (
          <p className="lab-empty">
            이 컴포넌트의 시편이 registry.ts에 없습니다.
          </p>
        )}
      </div>
      {revealed && value && <p className="stage-spec">{value.spec}</p>}
    </section>
  );
}

/* 판정 막대 */

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="lab-kbd">{children}</kbd>;
}

function PlaybackControls({
  animated,
  playing,
  onPlay,
  onReset,
  label = "같이 재생",
}: {
  animated: boolean;
  playing: boolean;
  onPlay: () => void;
  onReset: () => void;
  label?: string;
}) {
  return (
    <div className="lab-question-actions">
      {animated && (
        <button
          type="button"
          className="lab-play"
          aria-pressed={playing}
          onClick={onPlay}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
          {playing ? "멈춤" : label}
          <Kbd>Space</Kbd>
        </button>
      )}
      <button type="button" className="lab-text-button" onClick={onReset}>
        <RotateCcw size={14} />
        처음 상태로 <Kbd>R</Kbd>
      </button>
    </div>
  );
}

function SelectedPreview({
  component,
  state,
  demo,
  speed,
  resetKey,
}: {
  component: CatalogComponent;
  state: ComponentState;
  demo: number;
  speed: number;
  resetKey: number;
}) {
  const entry = specimens[component.id];
  if (!entry) return null;
  return (
    <div className="lab-preview-layout" data-layout={component.layout}>
      <section className="stage" aria-label={`${component.label} 미리보기`}>
        <div className="stage-viewport">
          <LayoutGroup id={`preview-${component.id}`}>
            <SpeedContext.Provider value={speed}>
              <DemoContext.Provider value={demo}>
                <entry.Component
                  key={`${component.id}-${resetKey}`}
                  params={state.params}
                />
              </DemoContext.Provider>
            </SpeedContext.Provider>
          </LayoutGroup>
        </div>
      </section>
      <dl className="lab-preview-values">
        {component.dimensions.map((dimension) => (
          <div key={dimension.id}>
            <dt>{dimension.label}</dt>
            <dd>
              {
                valueOf(component, dimension.id, state.params[dimension.id])
                  ?.label
              }
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function JudgeBar({
  options,
  phase,
  note,
  saving,
  savedCount,
  canUndo,
  onChoose,
  onSame,
  onNone,
  onSkip,
  onNote,
  onSave,
  onCancel,
  onUndo,
  choiceLabel,
}: {
  options: string[];
  phase: Phase;
  note: string;
  saving: boolean;
  savedCount: number;
  canUndo: boolean;
  onChoose: (index: number) => void;
  onSame: () => void;
  onNone: () => void;
  onSkip: () => void;
  onNote: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onUndo: () => void;
  choiceLabel: string;
}) {
  const noteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phase.kind === "explain") noteRef.current?.focus();
  }, [phase.kind]);

  return (
    <footer className="lab-judge">
      <div className="lab-judge-inner">
        {phase.kind === "choose" ? (
          <div className="lab-judge-row">
            <span className="lab-judge-prompt">어느 쪽이 좋나요?</span>
            <div className="lab-choices">
              {options.map((_, index) => (
                <button
                  key={LETTERS[index]}
                  type="button"
                  className="lab-choice"
                  onClick={() => onChoose(index)}
                >
                  {LETTERS[index]}
                </button>
              ))}
            </div>
            <div className="lab-judge-secondary">
              <button
                type="button"
                className="lab-text-button"
                onClick={onSame}
              >
                차이 없음 <Kbd>=</Kbd>
              </button>
              <button
                type="button"
                className="lab-text-button"
                onClick={onNone}
              >
                다 별로 <Kbd>X</Kbd>
              </button>
              <button
                type="button"
                className="lab-text-button"
                onClick={onSkip}
              >
                나중에 <Kbd>S</Kbd>
              </button>
            </div>
          </div>
        ) : (
          <form
            className="lab-judge-row"
            onSubmit={(event) => {
              event.preventDefault();
              onSave();
            }}
          >
            <span className="lab-judge-prompt">{choiceLabel}</span>
            <input
              ref={noteRef}
              className="lab-note"
              value={note}
              maxLength={400}
              placeholder={
                phase.outcome === "none"
                  ? "무엇이 별로인가요? 다음 값을 만들 때 씁니다 (선택)"
                  : "한마디 남기기 (선택)"
              }
              onChange={(event) => onNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onCancel();
              }}
            />
            <button type="submit" className="lab-save" disabled={saving}>
              저장 <Kbd>↵</Kbd>
            </button>
            <button
              type="button"
              className="lab-text-button"
              onClick={onCancel}
            >
              다시 고르기 <Kbd>Esc</Kbd>
            </button>
          </form>
        )}
        <div className="lab-judge-meta">
          {savedCount > 0 && <span>이번에 {savedCount}개 평가</span>}
          {canUndo && (
            <button type="button" className="lab-text-button" onClick={onUndo}>
              되돌리기 <Kbd>U</Kbd>
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}

/* 끝난 상태: 고른 값 요약 */

function Summary({ state }: { state: LabState }) {
  return (
    <div className="lab-summary">
      <h1>지금 평가할 비교가 없어요</h1>
      <p>
        고른 값은 다음 UI 작업에서 해당 컴포넌트가 나오면 자동으로 들어갑니다.
      </p>
      <dl>
        {state.components.map((item) => {
          const component = findComponent(item.id);
          if (!component) return null;
          return (
            <div key={item.id}>
              <dt>{item.label}</dt>
              <dd>
                {component.dimensions
                  .filter((d) =>
                    ["확정", "관찰"].includes(item.preferences[d.id]?.status),
                  )
                  .map(
                    (d) =>
                      `${d.label} ${valueOf(component, d.id, item.preferences[d.id].value)?.label ?? ""}`,
                  )
                  .join(", ") || "고른 값 없음"}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function Offline({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="lab-summary">
      <h1>취향 원장 서버에 연결하지 못했어요</h1>
      <p>
        {message}. 평가는 취향 원장 서버(127.0.0.1:4871)에 저장됩니다. 아래
        명령으로 띄운 뒤 다시 시도하세요.
      </p>
      <div className="lab-command">
        <code>{TASTE_OPEN_COMMAND}</code>
        <button
          type="button"
          className="lab-text-button"
          onClick={() => {
            navigator.clipboard?.writeText(TASTE_OPEN_COMMAND).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? "복사했어요" : "복사"}
        </button>
      </div>
      <button type="button" className="lab-save" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}

/* 화면 */

export default function SpecimenLab() {
  const [state, setState] = useState<LabState | null>(null);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(requestedFromUrl);
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [phase, setPhase] = useState<Phase>({ kind: "choose" });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<View>(readView);
  const [demo, setDemo] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [motionOverride, setMotionOverride] = useState(false);

  const load = useCallback(async (target: string, current: LabView) => {
    try {
      setState(await fetchState(target, current));
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, []);

  useEffect(() => {
    document.title = "시편 평가";
    void load(requested, { theme: view.theme, frame: view.frame });
  }, [load, requested, view.theme, view.frame]);

  useEffect(() => saveView(view), [view]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const previewState = state?.components.find(
    (item) => item.id === requested && !item.next,
  );
  const previewComponent = previewState
    ? findComponent(previewState.id)
    : undefined;
  const comparison = useMemo(() => {
    if (!state || state.queue.length === 0 || previewState) return null;
    return (
      state.queue.find((item) => !skipped.has(item.component)) ?? state.queue[0]
    );
  }, [state, skipped, previewState]);

  const component = comparison
    ? findComponent(comparison.component)
    : undefined;
  const dimension = component?.dimensions.find(
    (d) => d.id === comparison?.dimension,
  );
  const componentState = state?.components.find(
    (item) => item.id === comparison?.component,
  );
  const comparisonKey = comparison
    ? `${comparison.component}:${comparison.dimension}:${comparison.recheck?.key ?? ""}:${componentState?.judged ?? 0}`
    : previewState
      ? `preview:${previewState.id}`
      : "";
  // 자리 효과를 피하려고 비교마다 순서를 섞고 글자로만 보여 준다
  const shown = useMemo(
    () => (comparison ? shuffle(comparison.options) : []),
    [comparisonKey],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const speed = view.slow ? SLOW_FACTOR : 1;
  const entry = comparison
    ? specimens[comparison.component]
    : previewState
      ? specimens[previewState.id]
      : undefined;
  // 전역 시편(화면 표면, 글과 밀도)은 움직임이 없어 같이 재생할 것이 없다
  const animated = (entry?.demoSteps ?? 0) > 0;

  // 비교가 바뀌면 판정 단계, 재생, 무대 상태를 처음으로 되돌린다
  useEffect(() => {
    setPhase({ kind: "choose" });
    setNote("");
    setPlaying(false);
    setDemo(0);
    setResetKey((key) => key + 1);
  }, [comparisonKey]);

  // 같이 재생: 모든 무대에 같은 시연 동작을 같은 시각에 보낸다
  useEffect(() => {
    if (!playing || !entry || !animated) return;
    let ticks = 0;
    const total = entry.demoSteps * DEMO_ROUNDS;
    setDemo((value) => value + 1);
    const timer = window.setInterval(() => {
      ticks += 1;
      if (ticks >= total) {
        setPlaying(false);
        return;
      }
      setDemo((value) => value + 1);
    }, entry.demoInterval * speed);
    return () => window.clearInterval(timer);
  }, [playing, entry, animated, speed]);

  const conditions: Conditions = {
    theme: view.theme,
    frame: view.frame,
    slow: view.slow,
  };

  const submit = useCallback(
    async (outcome: Outcome, choice: string | null, text: string) => {
      if (!comparison || saving) return;
      setSaving(true);
      try {
        const result = await sendJudgment({
          comparison,
          shown,
          outcome,
          choice,
          note: text,
          conditions,
          requested,
        });
        setSavedIds((ids) => [...ids, result.judgment.id]);
        setState(result.state);
        setToast(
          outcome === "same" ? "차이 없음으로 저장했어요" : "저장했어요",
        );
      } catch (failure) {
        setToast(
          failure instanceof Error ? failure.message : "저장하지 못했어요",
        );
      } finally {
        setSaving(false);
      }
    },
    [comparison, saving, shown, conditions, requested],
  );

  const undo = useCallback(async () => {
    const last = savedIds.at(-1);
    if (!last) return;
    try {
      const result = await undoJudgment(last, requested, {
        theme: view.theme,
        frame: view.frame,
      });
      setSavedIds((ids) => ids.slice(0, -1));
      setState(result.state);
      setToast("마지막 평가를 되돌렸어요");
    } catch (failure) {
      setToast(
        failure instanceof Error ? failure.message : "되돌리지 못했어요",
      );
    }
  }, [savedIds, requested, view.theme, view.frame]);

  const pick = (id: string) => {
    setRequested(id);
    setSkipped(new Set());
    const url = new URL(window.location.href);
    url.searchParams.set("c", id);
    window.history.replaceState(null, "", url);
  };

  const choose = (index: number) => {
    if (index < shown.length)
      setPhase({ kind: "explain", outcome: "chose", choice: shown[index] });
  };

  const skip = () => {
    if (!comparison) return;
    setSkipped((current) => {
      const next = new Set(current).add(comparison.component);
      return next.size >= (state?.queue.length ?? 0) ? new Set() : next;
    });
    if (requested === comparison.component) setRequested("");
  };

  // 전역 단축키. 입력 중이거나 무대 안 컨트롤에 포커스가 있으면 그 컨트롤의 키를 가로채지 않는다
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTyping(event.target)
      )
        return;
      const inStage =
        event.target instanceof Element &&
        event.target.closest(".stage-viewport");
      const key = event.key.toLowerCase();
      if (
        inStage &&
        [
          " ",
          "enter",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "escape",
        ].includes(key)
      )
        return;
      const actions: Record<string, () => void> = {
        d: () =>
          setView((v) => ({
            ...v,
            theme: v.theme === "dark" ? "light" : "dark",
          })),
        m: () =>
          setView((v) => ({
            ...v,
            frame: v.frame === "mobile" ? "desktop" : "mobile",
          })),
        l: () => setView((v) => ({ ...v, slow: !v.slow })),
        u: () => void undo(),
      };
      if (comparison && phase.kind === "choose") {
        Object.assign(actions, {
          a: () => choose(0),
          b: () => choose(1),
          c: () => choose(2),
          "1": () => choose(0),
          "2": () => choose(1),
          "3": () => choose(2),
          "=": () => void submit("same", null, ""),
          "0": () => void submit("same", null, ""),
          x: () => setPhase({ kind: "explain", outcome: "none", choice: null }),
          s: skip,
          r: () => setResetKey((value) => value + 1),
        });
        if (animated) actions[" "] = () => setPlaying((value) => !value);
      }
      if (previewState) {
        actions.r = () => setResetKey((value) => value + 1);
        if (animated) actions[" "] = () => setPlaying((value) => !value);
      }
      const action = actions[key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const choiceLabel =
    phase.kind === "explain" &&
    phase.outcome === "chose" &&
    component &&
    comparison &&
    phase.choice
      ? `${LETTERS[shown.indexOf(phase.choice)]}를 골랐어요: ${valueOf(component, comparison.dimension, phase.choice)?.label}`
      : "다 별로예요";

  return (
    <MotionConfig reducedMotion={motionOverride ? "never" : "user"}>
      <div className="lab" data-theme={view.theme} data-frame={view.frame}>
        <header className="lab-top">
          <div className="lab-brand">
            <b>시편 평가</b>
            <span>고른 값이 다음 UI 작업의 기본값이 됩니다</span>
          </div>
          <div className="lab-toggles" role="group" aria-label="보기">
            <button
              type="button"
              className="lab-toggle"
              aria-pressed={view.theme === "dark"}
              onClick={() =>
                setView((v) => ({
                  ...v,
                  theme: v.theme === "dark" ? "light" : "dark",
                }))
              }
            >
              {view.theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
              {view.theme === "dark" ? "다크" : "라이트"}
              <Kbd>D</Kbd>
            </button>
            <button
              type="button"
              className="lab-toggle"
              aria-pressed={view.frame === "mobile"}
              onClick={() =>
                setView((v) => ({
                  ...v,
                  frame: v.frame === "mobile" ? "desktop" : "mobile",
                }))
              }
            >
              <Smartphone size={16} />
              휴대폰 폭<Kbd>M</Kbd>
            </button>
            <button
              type="button"
              className="lab-toggle"
              aria-pressed={view.slow}
              onClick={() => setView((v) => ({ ...v, slow: !v.slow }))}
            >
              <Turtle size={16} />
              느리게
              <Kbd>L</Kbd>
            </button>
          </div>
        </header>

        {reducedMotion && !motionOverride && (
          <div className="lab-notice" role="status">
            시스템의 동작 줄이기가 켜져 있어 모션 차이가 보이지 않아요.
            <button
              type="button"
              className="lab-text-button"
              onClick={() => setMotionOverride(true)}
            >
              이 화면에서만 모션 보기
            </button>
          </div>
        )}

        <div className="lab-body">
          {state && (
            <ComponentIndex
              state={state}
              current={comparison?.component ?? previewState?.id ?? ""}
              onPick={pick}
            />
          )}

          <main className="lab-main">
            {error ? (
              <Offline
                message={error}
                onRetry={() =>
                  void load(requested, {
                    theme: view.theme,
                    frame: view.frame,
                  })
                }
              />
            ) : !state ? (
              <p className="lab-empty">불러오는 중</p>
            ) : previewState && previewComponent ? (
              <div className="lab-comparison lab-preview">
                <div className="lab-question">
                  <div>
                    <h1>선택한 {previewComponent.label}</h1>
                    <p className="lab-hint">
                      고른 값으로 동작을 다시 확인하세요. 취향 기록은 바뀌지
                      않아요.
                    </p>
                  </div>
                  <PlaybackControls
                    animated={animated}
                    playing={playing}
                    onPlay={() => setPlaying((v) => !v)}
                    onReset={() => setResetKey((v) => v + 1)}
                    label="재생"
                  />
                </div>
                <SelectedPreview
                  component={previewComponent}
                  state={previewState}
                  demo={demo}
                  speed={speed}
                  resetKey={resetKey}
                />
                {savedIds.length > 0 && (
                  <button
                    type="button"
                    className="lab-text-button"
                    onClick={() => void undo()}
                  >
                    마지막 평가 되돌리기 <Kbd>U</Kbd>
                  </button>
                )}
              </div>
            ) : !comparison || !component || !dimension ? (
              <Summary state={state} />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={comparisonKey}
                  className="lab-comparison"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: EASE_OUT }}
                >
                  <div className="lab-question">
                    <div>
                      <p className="lab-kicker">
                        {component.label} / {dimension.label}
                        {comparison.recheck
                          ? ` / ${comparison.recheck.label}에서 다시 확인`
                          : componentState?.preferences[dimension.id]
                              ?.status === "관찰" && " / 다시 확인"}
                      </p>
                      <h1>{dimension.question}</h1>
                      <p className="lab-hint">
                        {comparison.recheck
                          ? `${comparison.recheck.label}에서 다시 묻는 비교예요. 처음 고른 값은 그대로 두고, 이 조건에서 고른 값을 따로 기록해요.`
                          : component.layout === "screen"
                            ? "같은 작업을 두 화면에서 진행하며 배치를 비교하세요. 같이 재생으로 흐름도 볼 수 있어요."
                            : component.frame === "phone"
                              ? "무대 안에 휴대폰 화면을 그린 시편이에요. 휴대폰 폭(M)은 바꾸지 않아도 돼요. 직접 눌러 보거나 같이 재생으로 비교하세요."
                              : animated
                                ? "무대 안에서 직접 눌러 보거나 같이 재생으로 나란히 비교하세요."
                                : componentState?.scope === "global"
                                  ? "화면 전체에 적용되는 값이에요. 라이트와 다크(D), 휴대폰 폭(M)에서도 보고 고르세요."
                                  : "움직임이 없는 시편이에요. 라이트와 다크(D), 휴대폰 폭(M)에서도 보고 고르세요."}
                      </p>
                    </div>
                    <PlaybackControls
                      animated={animated}
                      playing={playing}
                      onPlay={() => setPlaying((v) => !v)}
                      onReset={() => setResetKey((v) => v + 1)}
                    />
                  </div>

                  <div
                    className="lab-stages"
                    data-count={shown.length}
                    data-layout={component.layout}
                  >
                    {shown.map((option, index) => (
                      <Stage
                        key={option}
                        letter={LETTERS[index]}
                        comparison={comparison}
                        option={option}
                        revealed={phase.kind === "explain"}
                        chosen={
                          phase.kind === "explain" && phase.choice === option
                        }
                        demo={demo}
                        speed={speed}
                        resetKey={resetKey}
                      />
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>

        {comparison && !error && (
          <JudgeBar
            options={shown}
            phase={phase}
            note={note}
            saving={saving}
            savedCount={savedIds.length}
            canUndo={savedIds.length > 0}
            onChoose={choose}
            onSame={() => void submit("same", null, "")}
            onNone={() =>
              setPhase({ kind: "explain", outcome: "none", choice: null })
            }
            onSkip={skip}
            onNote={setNote}
            onSave={() => {
              if (phase.kind === "explain")
                void submit(phase.outcome, phase.choice, note);
            }}
            onCancel={() => setPhase({ kind: "choose" })}
            onUndo={() => void undo()}
            choiceLabel={choiceLabel}
          />
        )}

        <AnimatePresence>
          {toast && (
            <motion.div
              className="lab-toast"
              role="status"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
