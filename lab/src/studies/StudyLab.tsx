import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ChevronLeft, Images } from "lucide-react";
import {
  Badge,
  EASE,
  Segmented,
  StatusSlot,
  useNotice,
  type Tone,
} from "./controls";
import "./studies.css";

type Params = Record<string, string>;
interface Dimension {
  id: string;
  label: string;
  values: { id: string; label: string; spec: string }[];
}
interface Snapshot {
  digest: string;
  revision: {
    id: string;
    dimensions: Dimension[];
    viewport: { width: number; height: number };
    theme: string;
    state: string;
  };
}
interface StudyEvent {
  id: string;
  revision: string;
  action: string;
  params: Params;
  note: string;
  digest: string;
  dimension?: string;
  outcome?: string;
  choice?: string;
  target?: string | null;
}
interface Study {
  id: string;
  reference: {
    title: string;
    image: { file: string };
    selection?: { user_statement?: string };
    notes?: string;
  };
  revisions: Snapshot[];
  events: StudyEvent[];
  adopted: StudyEvent | null;
  expected: string | null;
}
interface StudyItem {
  id: string;
  title: string;
}
const API = "/taste-api/studies";

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "시안 작업에 실패했습니다");
  return data as T;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function screenUrl(study: string, revision: string, params: Params) {
  return `${API}/file/${study}/${revision}/screen.html?params=${encodeURIComponent(JSON.stringify(params))}`;
}

function lastParams(study: Study, snapshot: Snapshot | undefined) {
  if (!snapshot) return {};
  const recorded = [...study.events]
    .reverse()
    .find(
      (e) =>
        e.revision === snapshot.revision.id &&
        ["adopt", "judge"].includes(e.action),
    )?.params;
  return (
    recorded ??
    Object.fromEntries(
      snapshot.revision.dimensions.map((d) => [d.id, d.values[0].id]),
    )
  );
}

function isVerified(study: Study, snapshot: Snapshot) {
  return study.events.some(
    (e) => e.action === "reproduction" && e.digest === snapshot.digest,
  );
}

function sameParams(a: Params, b: Params) {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  );
}

const ACTION_LABELS: Record<string, string> = {
  reproduction: "재현 확인",
  judge: "비교",
  feedback: "수정 요청",
  adopt: "채택",
  revert: "되돌리기",
};
const OUTCOME_LABELS: Record<string, string> = {
  same: "차이 없음",
  none: "다 별로",
};

function eventDetail(study: Study, e: StudyEvent) {
  if (e.action === "judge") {
    if (e.outcome && OUTCOME_LABELS[e.outcome])
      return OUTCOME_LABELS[e.outcome];
    const dimension = study.revisions
      .find((r) => r.revision.id === e.revision)
      ?.revision.dimensions.find((d) => d.id === e.dimension);
    const value = dimension?.values.find((v) => v.id === e.choice);
    return dimension && value ? `${dimension.label}: ${value.label}` : "";
  }
  if (e.action === "revert") return e.target ? "이전 채택" : "채택 해제";
  return "";
}

// 같은 장면 전환 값: 옆으로 24px, 흐림 2px, 겹쳐 교차 240ms
const slide = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction * 24,
    filter: "blur(2px)",
  }),
  center: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -24,
    filter: "blur(2px)",
  }),
};
const slideTransition = { duration: 0.24, ease: EASE };

function Screen({
  study,
  snapshot,
  params,
  title,
}: {
  study: string;
  snapshot: Snapshot;
  params: Params;
  title: string;
}) {
  return (
    <iframe
      className="study-frame"
      title={title}
      sandbox="allow-scripts"
      src={screenUrl(study, snapshot.revision.id, params)}
      style={{
        width: snapshot.revision.viewport.width,
        height: snapshot.revision.viewport.height,
      }}
    />
  );
}

type Mode = "reference" | "compare" | "revisions";

function Revision({
  study,
  snapshot,
  onChange,
}: {
  study: Study;
  snapshot: Snapshot;
  onChange: (study: Study) => void;
}) {
  const meta = snapshot.revision;
  const verified = isVerified(study, snapshot);
  const others = study.revisions.filter((r) => r.revision.id !== meta.id);
  const modes: { id: Mode; label: string }[] = [
    { id: "reference", label: "원본과 비교" },
    { id: "compare", label: "항목 비교" },
    ...(others.length > 0
      ? [{ id: "revisions" as const, label: "수정 전후" }]
      : []),
  ];
  const [params, setParams] = useState<Params>(() =>
    lastParams(study, snapshot),
  );
  const [mode, setMode] = useState<Mode>(verified ? "compare" : "reference");
  const [direction, setDirection] = useState(1);
  const [dimension, setDimension] = useState(meta.dimensions[0].id);
  const [previous, setPrevious] = useState(() => {
    const index = study.revisions.findIndex((r) => r.revision.id === meta.id);
    return (study.revisions[index - 1] ?? others[0])?.revision.id ?? "";
  });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<Record<string, unknown> | null>(null);
  const status = useNotice();
  const requestSequence = useRef(0);
  useEffect(
    () => () => {
      // 시안이나 수정본을 떠난 뒤 도착한 응답은 상위 화면에도 반영하지 않는다.
      requestSequence.current += 1;
    },
    [],
  );
  const activeDimension = meta.dimensions.find((d) => d.id === dimension)!;
  const oldSnapshot = others.find((r) => r.revision.id === previous);
  const disabled = busy || retry !== null;
  const adoptedHere =
    study.adopted?.revision === meta.id &&
    sameParams(study.adopted.params, params);

  function changeMode(next: Mode) {
    const from = modes.findIndex((m) => m.id === mode);
    const to = modes.findIndex((m) => m.id === next);
    setDirection(to >= from ? 1 : -1);
    setMode(next);
  }

  async function submit(body: Record<string, unknown>) {
    if (busy) return;
    const sequence = ++requestSequence.current;
    setBusy(true);
    status.clear();
    try {
      const next = await request<Study>(API + "/event", body);
      if (sequence !== requestSequence.current) return;
      onChange(next);
      setRetry(null);
      setNote("");
      if (body.action === "reproduction") changeMode("compare");
      status.show(
        "done",
        body.action === "adopt" ? "채택했습니다" : "기록했습니다",
      );
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      status.show("failed", errorText(error));
      setRetry(body);
    } finally {
      if (sequence === requestSequence.current) setBusy(false);
    }
  }
  async function reload() {
    if (busy) return;
    const sequence = ++requestSequence.current;
    setBusy(true);
    try {
      const next = await request<Study>(`${API}?id=${study.id}`);
      if (sequence !== requestSequence.current) return;
      onChange(next);
      setRetry(null);
      status.show("done", "다시 읽었습니다");
    } catch (error) {
      if (sequence === requestSequence.current)
        status.show("failed", errorText(error));
    } finally {
      if (sequence === requestSequence.current) setBusy(false);
    }
  }
  function event(action: string, extra: Record<string, unknown> = {}) {
    void submit({
      study: study.id,
      revision: meta.id,
      digest: snapshot.digest,
      params,
      expected: study.expected,
      request_id: crypto.randomUUID(),
      action,
      // 메모는 다음 기록 하나에 붙는다. 채택의 메모는 내보낸 결과의 사용자 원문이 된다.
      note,
      ...extra,
    });
  }
  function copyNote() {
    void navigator.clipboard
      .writeText(`시안 ${study.id}, 수정본 ${meta.id}\n${note}`)
      .then(
        () => status.show("done", "복사했습니다"),
        () => status.show("done", "복사하지 못했습니다. 직접 복사해 주세요"),
      );
  }

  const primary = verified
    ? {
        label: "채택",
        run: () => event("adopt"),
        off: disabled || adoptedHere,
      }
    : { label: "재현 확인", run: () => event("reproduction"), off: disabled };

  return (
    <div className="study-workspace">
      <div className="study-stage">
        <Segmented
          label="보기"
          options={modes}
          value={mode}
          onChange={(id) => changeMode(id as Mode)}
        />
        <div className="study-stage-body">
          <AnimatePresence initial={false} mode="popLayout" custom={direction}>
            <motion.div
              key={mode}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
            >
              {mode === "reference" && (
                <>
                  <div className="study-frames">
                    <figure>
                      <img
                        className="study-frame"
                        style={{ width: meta.viewport.width }}
                        src={`${API}/file/${study.id}/reference/${study.reference.image.file}`}
                        alt="원본 시안"
                      />
                      <figcaption>원본</figcaption>
                    </figure>
                    <figure>
                      <Screen
                        study={study.id}
                        snapshot={snapshot}
                        params={params}
                        title="코드 시편"
                      />
                      <figcaption>코드 시편</figcaption>
                    </figure>
                  </div>
                  {meta.state && <p className="study-state">{meta.state}</p>}
                </>
              )}
              {mode === "compare" && (
                <>
                  {meta.dimensions.length > 1 && (
                    <Segmented
                      label="비교할 항목"
                      options={meta.dimensions}
                      value={dimension}
                      onChange={setDimension}
                    />
                  )}
                  <div className="study-frames">
                    {activeDimension.values.map((value, i) => {
                      const candidate = { ...params, [dimension]: value.id };
                      const letter = String.fromCharCode(65 + i);
                      return (
                        <figure key={value.id}>
                          <Screen
                            study={study.id}
                            snapshot={snapshot}
                            params={candidate}
                            title={`비교 ${letter}`}
                          />
                          <figcaption>
                            {letter}
                            <button
                              className="study-button"
                              disabled={disabled || !verified}
                              onClick={() => {
                                setParams(candidate);
                                event("judge", {
                                  params: candidate,
                                  dimension,
                                  outcome: "chose",
                                  choice: value.id,
                                });
                              }}
                            >
                              {letter} 선택
                            </button>
                          </figcaption>
                        </figure>
                      );
                    })}
                  </div>
                  <div className="study-row-actions">
                    <button
                      className="study-text-button"
                      disabled={disabled || !verified}
                      onClick={() =>
                        event("judge", { dimension, outcome: "same" })
                      }
                    >
                      차이 없음
                    </button>
                    <button
                      className="study-text-button"
                      disabled={disabled || !verified}
                      onClick={() =>
                        event("judge", { dimension, outcome: "none" })
                      }
                    >
                      다 별로
                    </button>
                  </div>
                </>
              )}
              {mode === "revisions" && oldSnapshot && (
                <>
                  {others.length > 1 && (
                    <Segmented
                      label="비교할 수정본"
                      options={others.map((r) => ({
                        id: r.revision.id,
                        label: r.revision.id,
                      }))}
                      value={previous}
                      onChange={setPrevious}
                    />
                  )}
                  <div className="study-frames">
                    <figure>
                      <Screen
                        study={study.id}
                        snapshot={oldSnapshot}
                        params={lastParams(study, oldSnapshot)}
                        title={`수정 전 ${previous}`}
                      />
                      <figcaption>{previous}</figcaption>
                    </figure>
                    <figure>
                      <Screen
                        study={study.id}
                        snapshot={snapshot}
                        params={params}
                        title={`지금 ${meta.id}`}
                      />
                      <figcaption>{meta.id}</figcaption>
                    </figure>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <aside className="study-panel">
        <div className="study-primary-row">
          <button
            className="study-button is-primary"
            disabled={primary.off}
            onClick={primary.run}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={primary.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.16, delay: 0.04, ease: EASE },
                }}
                exit={{
                  opacity: 0,
                  y: -6,
                  transition: { duration: 0.1, ease: EASE },
                }}
              >
                {primary.label}
              </motion.span>
            </AnimatePresence>
          </button>
          <StatusSlot notice={status.notice}>
            {retry && (
              <>
                <button
                  className="study-text-button"
                  disabled={busy}
                  onClick={() => void submit(retry)}
                >
                  다시 시도
                </button>
                <button
                  className="study-text-button"
                  disabled={busy}
                  onClick={() => void reload()}
                >
                  다시 읽기
                </button>
              </>
            )}
          </StatusSlot>
        </div>

        <section className="study-group">
          <h2>선택 값</h2>
          {meta.dimensions.map((d) => (
            <div key={d.id} className="study-field">
              <span className="study-label">{d.label}</span>
              <Segmented
                label={d.label}
                options={d.values}
                value={params[d.id]}
                onChange={(id) => setParams({ ...params, [d.id]: id })}
              />
            </div>
          ))}
          {study.adopted && (
            <div className="study-adopted">
              <span>
                채택{" "}
                <span className="study-mono">{study.adopted.revision}</span>
              </span>
              <a
                className="study-text-button"
                target="_blank"
                rel="noreferrer"
                href={screenUrl(
                  study.id,
                  study.adopted.revision,
                  study.adopted.params,
                )}
              >
                새 창에서 열기
              </a>
              <button
                className="study-text-button"
                disabled={disabled}
                onClick={() => event("revert", { target: null })}
              >
                해제
              </button>
            </div>
          )}
        </section>

        <section className="study-group">
          <label className="study-field">
            <span className="study-label">메모</span>
            <textarea
              className="study-input"
              value={note}
              maxLength={4000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="선택 이유나 바꿀 부분"
            />
          </label>
          <div className="study-row-actions">
            <button
              className="study-button"
              disabled={disabled || !note.trim()}
              onClick={() => event("feedback")}
            >
              수정 요청
            </button>
            <button
              className="study-text-button"
              disabled={!note.trim()}
              onClick={copyNote}
            >
              복사
            </button>
          </div>
        </section>

        <section className="study-group">
          <h2>기록</h2>
          <ol className="study-history">
            {[...study.events].reverse().map((e) => {
              const detail = eventDetail(study, e);
              const restorable =
                e.action === "adopt" && e.id !== study.adopted?.id;
              return (
                <li key={e.id}>
                  <div className="study-history-head">
                    <span className="study-mono">{e.revision}</span>
                    <b>{ACTION_LABELS[e.action] ?? e.action}</b>
                    {detail && <span>{detail}</span>}
                    {restorable && (
                      <button
                        className="study-text-button"
                        disabled={disabled}
                        onClick={() => event("revert", { target: e.id })}
                      >
                        되돌리기
                      </button>
                    )}
                  </div>
                  {e.note && <p>{e.note}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      </aside>
    </div>
  );
}

function StudyDetail({
  study,
  revisionId,
  onRevision,
  onChange,
}: {
  study: Study;
  revisionId: string;
  onRevision: (id: string) => void;
  onChange: (study: Study) => void;
}) {
  const snapshot = study.revisions.find((r) => r.revision.id === revisionId);
  let badge: { tone: Tone; label: string } | null = null;
  if (snapshot) {
    if (study.adopted?.revision === revisionId)
      badge = { tone: "done", label: "채택됨" };
    else if (isVerified(study, snapshot))
      badge = { tone: "neutral", label: "확인됨" };
    else badge = { tone: "waiting", label: "확인 전" };
  }
  const statement = study.reference.selection?.user_statement;
  return (
    <>
      <div className="study-title">
        <div>
          <h1>{study.reference.title}</h1>
          {statement && <p className="study-statement">“{statement}”</p>}
        </div>
        <div className="study-title-side">
          {study.revisions.length > 1 ? (
            <Segmented
              label="수정본"
              options={study.revisions.map((r) => ({
                id: r.revision.id,
                label: r.revision.id,
              }))}
              value={revisionId}
              onChange={onRevision}
            />
          ) : (
            snapshot && <span className="study-mono">{revisionId}</span>
          )}
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </div>
      </div>
      {snapshot ? (
        <Revision
          key={`${study.id}:${snapshot.digest}`}
          study={study}
          snapshot={snapshot}
          onChange={onChange}
        />
      ) : (
        <div className="study-frames">
          <figure>
            <img
              className="study-frame study-reference"
              src={`${API}/file/${study.id}/reference/${study.reference.image.file}`}
              alt="원본 시안"
            />
            <figcaption>대화에서 코드 시편을 요청하세요</figcaption>
          </figure>
        </div>
      )}
    </>
  );
}

function StudyList({
  list,
  error,
  focusId,
  onOpen,
  onRetry,
}: {
  list: StudyItem[] | null;
  error: string;
  focusId: string;
  onOpen: (id: string) => void;
  onRetry: () => void;
}) {
  if (error)
    return (
      <p className="study-failure" role="alert">
        {error}
        <button className="study-text-button" onClick={onRetry}>
          다시 시도
        </button>
      </p>
    );
  if (!list) return null;
  if (list.length === 0)
    return (
      <div className="study-empty">
        <Images size={32} strokeWidth={1.5} aria-hidden />
        <p>대화에서 시안 이미지를 지정해 시작하세요</p>
      </div>
    );
  return (
    <ul className="study-list">
      {list.map((item) => (
        <li key={item.id}>
          <button
            className="study-list-row"
            autoFocus={item.id === focusId}
            onClick={() => onOpen(item.id)}
          >
            <span className="study-list-title">{item.title}</span>
            <span className="study-mono">{item.id}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function selectedFromUrl() {
  return new URLSearchParams(location.search).get("study") || "";
}

export default function StudyLab() {
  const [list, setList] = useState<StudyItem[] | null>(null);
  const [listError, setListError] = useState("");
  const [listAttempt, setListAttempt] = useState(0);
  const [selected, setSelected] = useState(selectedFromUrl);
  const [focusId, setFocusId] = useState("");
  const [study, setStudy] = useState<Study | null>(null);
  const [revisionId, setRevisionId] = useState("");
  const [studyError, setStudyError] = useState("");
  const [studyAttempt, setStudyAttempt] = useState(0);

  useEffect(() => {
    const onPop = () => setSelected(selectedFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    let active = true;
    request<{ studies: StudyItem[] }>(API)
      .then((data) => {
        if (active) {
          setList(data.studies);
          setListError("");
        }
      })
      .catch((e) => {
        if (active) setListError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [listAttempt]);
  useEffect(() => {
    let active = true;
    if (selected)
      request<Study>(`${API}?id=${selected}`)
        .then((data) => {
          if (active) {
            setStudy(data);
            setRevisionId(data.revisions.at(-1)?.revision.id || "");
            setStudyError("");
          }
        })
        .catch((e) => {
          if (active) setStudyError(errorText(e));
        });
    return () => {
      active = false;
    };
  }, [selected, studyAttempt]);

  function open(id: string) {
    history.pushState(null, "", `/studies?study=${encodeURIComponent(id)}`);
    setStudyError("");
    setSelected(id);
  }
  function back() {
    history.pushState(null, "", "/studies");
    setFocusId(selected);
    setSelected("");
  }
  const current = study?.id === selected ? study : null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="study-app">
        <nav className="study-nav">
          <a href="/specimens">일반 시편</a>
          <a href="/studies" aria-current="page">
            시안
          </a>
        </nav>
        <AnimatePresence
          initial={false}
          mode="popLayout"
          custom={selected ? 1 : -1}
        >
          <motion.main
            key={selected ? "detail" : "list"}
            custom={selected ? 1 : -1}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
          >
            {selected ? (
              <>
                <button className="study-back" onClick={back}>
                  <ChevronLeft size={16} aria-hidden />
                  시안 목록
                </button>
                {studyError && (
                  <p className="study-failure" role="alert">
                    {studyError}
                    <button
                      className="study-text-button"
                      onClick={() => setStudyAttempt((n) => n + 1)}
                    >
                      다시 시도
                    </button>
                  </p>
                )}
                {current && (
                  <StudyDetail
                    study={current}
                    revisionId={revisionId}
                    onRevision={setRevisionId}
                    onChange={setStudy}
                  />
                )}
              </>
            ) : (
              <>
                <h1>시안</h1>
                <StudyList
                  list={list}
                  error={listError}
                  focusId={focusId}
                  onOpen={open}
                  onRetry={() => setListAttempt((n) => n + 1)}
                />
              </>
            )}
          </motion.main>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
