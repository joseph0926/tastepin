import { useEffect, useRef, useState } from "react";
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

function screenUrl(study: string, revision: string, params: Params) {
  return `${API}/file/${study}/${revision}/screen.html?params=${encodeURIComponent(JSON.stringify(params))}`;
}

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
    <div className="study-screen">
      <iframe
        title={title}
        sandbox="allow-scripts"
        src={screenUrl(study, snapshot.revision.id, params)}
        style={{
          width: snapshot.revision.viewport.width,
          height: snapshot.revision.viewport.height,
        }}
      />
    </div>
  );
}

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
  const latest = [...study.events]
    .reverse()
    .find(
      (e) => e.revision === meta.id && ["adopt", "judge"].includes(e.action),
    );
  const [params, setParams] = useState<Params>(
    () =>
      latest?.params ??
      Object.fromEntries(meta.dimensions.map((d) => [d.id, d.values[0].id])),
  );
  const [dimension, setDimension] = useState(meta.dimensions[0].id);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<Record<string, unknown> | null>(null);
  const [previous, setPrevious] = useState("");
  const requestSequence = useRef(0);
  useEffect(
    () => () => {
      // 시안이나 수정본을 떠난 뒤 도착한 응답은 상위 화면에도 반영하지 않는다.
      requestSequence.current += 1;
    },
    [],
  );
  const verified = study.events.some(
    (e) => e.action === "reproduction" && e.digest === snapshot.digest,
  );
  const activeDimension = meta.dimensions.find((d) => d.id === dimension)!;
  const oldSnapshot = study.revisions.find((r) => r.revision.id === previous);
  const oldParams =
    [...study.events]
      .reverse()
      .find(
        (e) => e.revision === previous && ["adopt", "judge"].includes(e.action),
      )?.params ??
    Object.fromEntries(
      (oldSnapshot?.revision.dimensions ?? []).map((d) => [
        d.id,
        d.values[0].id,
      ]),
    );

  async function submit(body: Record<string, unknown>) {
    if (busy) return;
    const sequence = ++requestSequence.current;
    setBusy(true);
    setMessage("");
    try {
      const next = await request<Study>(API + "/event", body);
      if (sequence !== requestSequence.current) return;
      onChange(next);
      setRetry(null);
      setNote("");
      setMessage(
        body.action === "adopt"
          ? "이 화면에 적용할 결과를 저장했습니다"
          : "기록했습니다",
      );
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setMessage(error instanceof Error ? error.message : String(error));
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
      setMessage("저장 상태를 다시 읽었습니다");
    } catch (error) {
      if (sequence === requestSequence.current) setMessage(String(error));
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
      note,
      ...extra,
    });
  }
  const disabled = busy || retry !== null;
  const adopts = study.events.filter(
    (e) => e.action === "adopt" && e.id !== study.adopted?.id,
  );
  return (
    <>
      <section className="study-section">
        <div className="study-section-title">
          <h2>원본과 재현 확인</h2>
          <span>
            {meta.viewport.width} × {meta.viewport.height} / {meta.theme}
          </span>
        </div>
        <p>{meta.state}</p>
        <div className="study-pair">
          <figure>
            <figcaption>출발한 시안</figcaption>
            <img
              className="study-reference"
              src={`${API}/file/${study.id}/reference/${study.reference.image.file}`}
              alt="원본 레퍼런스"
            />
          </figure>
          <figure>
            <figcaption>현재 코드 시편</figcaption>
            <Screen
              study={study.id}
              snapshot={snapshot}
              params={params}
              title="현재 코드 시편"
            />
          </figure>
        </div>
        <p className="study-muted">
          대체한 이미지와 글꼴, 구현에서 달라진 부분도 확인하세요. 재현 확인은
          취향 채택과 별개입니다.
        </p>
        <button
          disabled={disabled || verified}
          onClick={() => event("reproduction")}
        >
          {verified ? "이 수정본의 재현 확인됨" : "재현 상태 확인했어요"}
        </button>
      </section>

      <section className="study-section">
        <h2>비교와 수정</h2>
        <div className="study-controls">
          <label>
            비교할 항목
            <select
              aria-label="비교할 항목"
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
            >
              {meta.dimensions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          {meta.dimensions
            .filter((d) => d.id !== dimension)
            .map((d) => (
              <label key={d.id}>
                {d.label}
                <select
                  aria-label={d.label}
                  value={params[d.id]}
                  onChange={(e) =>
                    setParams({ ...params, [d.id]: e.target.value })
                  }
                >
                  {d.values.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </div>
        <div className="study-comparisons">
          {activeDimension.values.map((value, i) => {
            const candidate = { ...params, [dimension]: value.id };
            return (
              <figure key={value.id}>
                <figcaption>{String.fromCharCode(65 + i)}</figcaption>
                <Screen
                  study={study.id}
                  snapshot={snapshot}
                  params={candidate}
                  title={`비교 ${String.fromCharCode(65 + i)}`}
                />
                <button
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
                  이쪽 선택
                </button>
              </figure>
            );
          })}
        </div>
        <div className="study-actions">
          <button
            disabled={disabled || !verified}
            onClick={() => event("judge", { dimension, outcome: "same" })}
          >
            차이 없음
          </button>
          <button
            disabled={disabled || !verified}
            onClick={() => event("judge", { dimension, outcome: "none" })}
          >
            다 별로
          </button>
        </div>
        <label className="study-note">
          수정할 부분 또는 선택 이유
          <textarea
            value={note}
            maxLength={4000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="유지할 부분과 바꾸고 싶은 부분을 적어 주세요"
          />
        </label>
        <div className="study-actions">
          <button
            disabled={disabled || !note.trim()}
            onClick={() => event("feedback")}
          >
            수정 요청 저장
          </button>
          <button
            disabled={!note.trim()}
            onClick={() => {
              void navigator.clipboard
                .writeText(`시안 ${study.id}, 수정본 ${meta.id}\n${note}`)
                .then(
                  () => setMessage("수정 요청을 복사했습니다"),
                  () =>
                    setMessage(
                      "복사하지 못했습니다. 입력한 문장을 직접 복사해 주세요",
                    ),
                );
            }}
          >
            대화로 가져갈 요청 복사
          </button>
        </div>
        <p className="study-muted">
          요청을 저장한 뒤 대화에서 이어서 수정을 요청하세요. AI가 새 수정본을
          등록하면 이곳에서 다시 비교할 수 있습니다.
        </p>
        {study.revisions.length > 1 && (
          <>
            <label>
              수정 전 기준
              <select
                aria-label="수정 전 기준"
                value={previous}
                onChange={(e) => setPrevious(e.target.value)}
              >
                <option value="">선택하지 않음</option>
                {study.revisions
                  .filter((r) => r.revision.id !== meta.id)
                  .map((r) => (
                    <option key={r.revision.id}>{r.revision.id}</option>
                  ))}
              </select>
            </label>
            {oldSnapshot && (
              <div className="study-pair">
                <figure>
                  <figcaption>수정 전 {previous}</figcaption>
                  <Screen
                    study={study.id}
                    snapshot={oldSnapshot}
                    params={oldParams}
                    title="수정 전"
                  />
                </figure>
                <figure>
                  <figcaption>수정 후 {meta.id}</figcaption>
                  <Screen
                    study={study.id}
                    snapshot={snapshot}
                    params={params}
                    title="수정 후"
                  />
                </figure>
              </div>
            )}
          </>
        )}
      </section>

      <section className="study-section">
        <h2>선택한 전체 화면</h2>
        <div className="study-controls">
          {meta.dimensions.map((d) => (
            <label key={d.id}>
              {d.label}
              <select
                aria-label={d.label}
                value={params[d.id]}
                onChange={(e) =>
                  setParams({ ...params, [d.id]: e.target.value })
                }
              >
                {d.values.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <Screen
          study={study.id}
          snapshot={snapshot}
          params={params}
          title="선택한 전체 화면"
        />
        <p>이 시안에만 적용합니다. 다른 화면의 기본 취향은 바뀌지 않습니다.</p>
        <button
          className="study-primary"
          disabled={disabled || !verified}
          onClick={() => event("adopt")}
        >
          이 전체 화면을 채택
        </button>
        <p>
          {study.adopted
            ? `현재 채택: ${study.adopted.revision}`
            : "아직 채택한 결과가 없습니다"}
        </p>
        {study.adopted && (
          <a
            target="_blank"
            rel="noreferrer"
            href={screenUrl(
              study.id,
              study.adopted.revision,
              study.adopted.params,
            )}
          >
            채택한 화면만 다시 열기
          </a>
        )}
        {adopts.length > 0 && (
          <label>
            이전 채택으로 되돌리기
            <select
              aria-label="이전 채택으로 되돌리기"
              defaultValue=""
              disabled={disabled}
              onChange={(e) => {
                if (e.target.value) event("revert", { target: e.target.value });
                e.target.value = "";
              }}
            >
              <option value="">이전 결과 선택</option>
              {adopts.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.revision} / {e.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
        )}
        {study.adopted && (
          <button
            disabled={disabled}
            onClick={() => event("revert", { target: null })}
          >
            채택 해제
          </button>
        )}
        <p className="study-muted">
          전체 화면 이미지와 재실행 자료가 필요하면 대화에서 이 시안의 채택 결과
          내보내기를 요청하세요. Viewgrain 등록 없이도 보관할 수 있습니다.
        </p>
      </section>
      <section className="study-section">
        <h2>수정과 선택 기록</h2>
        <ol>
          {[...study.events].reverse().map((e) => (
            <li key={e.id}>
              <b>
                {e.revision} /{" "}
                {
                  {
                    reproduction: "재현 확인",
                    judge: "비교",
                    feedback: "수정 요청",
                    adopt: "채택",
                    revert: "되돌리기",
                  }[e.action]
                }
              </b>
              {e.note && <p>{e.note}</p>}
            </li>
          ))}
        </ol>
      </section>
      {message && (
        <div className="study-message" role="status">
          {message}
          {retry && (
            <div>
              <button disabled={busy} onClick={() => void submit(retry)}>
                같은 요청 다시 보내기
              </button>
              <button disabled={busy} onClick={() => void reload()}>
                저장 상태 다시 읽기
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function StudyLab() {
  const [list, setList] = useState<{ id: string; title: string }[]>([]);
  const [selected, setSelected] = useState(
    new URLSearchParams(location.search).get("study") || "",
  );
  const [study, setStudy] = useState<Study | null>(null);
  const [revisionId, setRevisionId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request<{ studies: typeof list }>(API)
      .then((data) => {
        if (active) setList(data.studies);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (selected)
      request<Study>(`${API}?id=${selected}`)
        .then((data) => {
          if (active) {
            setStudy(data);
            setRevisionId(data.revisions.at(-1)?.revision.id || "");
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, [selected]);
  const snapshot =
    study?.id === selected
      ? study.revisions.find((r) => r.revision.id === revisionId)
      : undefined;
  return (
    <div className="study-app">
      <header>
        <div>
          <a href="/specimens">일반 시편</a>
          <h1>시안에서 고른 화면</h1>
        </div>
        <a href="/studies">목록 새로 읽기</a>
      </header>
      <div className="study-controls">
        <label>
          시안
          <select
            aria-label="시안"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              history.replaceState(
                null,
                "",
                `/studies?study=${e.target.value}`,
              );
            }}
          >
            <option value="">시안 선택</option>
            {list.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        {study && study.id === selected && (
          <label>
            수정본
            <select
              aria-label="수정본"
              value={revisionId}
              onChange={(e) => setRevisionId(e.target.value)}
            >
              {study.revisions.map((r) => (
                <option key={r.revision.id}>{r.revision.id}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {list.length === 0 && !error && (
        <p>
          아직 가져온 시안이 없습니다. 대화에서 이미지나 Viewgrain 시안을 지정해
          Lab 비교를 요청하세요.
        </p>
      )}
      {study && study.id === selected && (
        <>
          <h2>{study.reference.title}</h2>
          {study.reference.selection?.user_statement && (
            <blockquote>{study.reference.selection.user_statement}</blockquote>
          )}
          {snapshot ? (
            <Revision
              key={`${study.id}:${snapshot.digest}`}
              study={study}
              snapshot={snapshot}
              onChange={setStudy}
            />
          ) : (
            <p>
              이미지를 가져왔습니다. 대화에서 코드 시편 생성을 요청하면 이곳에서
              확인할 수 있습니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
