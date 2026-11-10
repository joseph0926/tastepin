import { useEffect, useId, useRef, useState } from "react";
import { useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import { FormControl, useFormSave } from "../components/FormDialogShared";
import { ScreenFrame, ScreenStatus } from "./ScreenShared";

const initial = {
  name: "주간 팀 회의",
  duration: "45",
  agenda: "진행 상황 공유\n막힌 일 논의\n다음 일정 확인",
};
const greeting = {
  id: 0,
  role: "assistant",
  text: "팀 회의 초안을 준비했습니다. 바꾸고 싶은 내용을 알려 주세요.",
};
type Message = { id: number; role: string; text: string };

export default function AssistantScreen({ params }: SpecimenProps) {
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [question, setQuestion] = useState("");
  const [draft, setDraft] = useState(initial);
  const [phase, setPhase] = useState<"idle" | "answering">("idle");
  const [notice, setNotice] = useState("");
  const [applied, setApplied] = useState<typeof initial | null>(null);
  const streamTimer = useRef<number>(undefined);
  const nextId = useRef(1);
  const id = useId();
  const seconds = useSeconds();
  const request = useFormSave();
  const applyRequest = useFormSave();
  const pending = request.saving || phase === "answering";
  useEffect(() => () => window.clearInterval(streamTimer.current), []);
  const stop = () => {
    request.cancel();
    window.clearInterval(streamTimer.current);
    setPhase("idle");
    setMessages((current) => current.filter((message) => message.text.trim()));
    setNotice("답변을 중지했습니다. 이전 초안은 남아 있습니다.");
  };
  // 응답과 문서 반영은 이 무대의 예제 데이터만 바꾼다. 실제 외부 요청은 보내지 않는다.
  const send = () => {
    if (!question.trim() || pending || applyRequest.saving) return;
    const prompt = question.trim();
    const snapshot = {
      ...draft,
      duration:
        prompt.includes("30") || prompt.includes("짧") ? "30" : draft.duration,
    };
    const answer = `회의 시간을 ${snapshot.duration}분으로 정리했습니다. 진행 상황을 짧게 공유하고 막힌 일과 다음 행동에 시간을 쓰는 초안입니다.`;
    const userMessageId = nextId.current++;
    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", text: prompt },
    ]);
    setQuestion("");
    setNotice("");
    request.save(() => {
      const messageId = nextId.current++;
      const words = answer.split(" ");
      let shown = 0;
      setPhase("answering");
      setMessages((current) => [
        ...current,
        { id: messageId, role: "assistant", text: "" },
      ]);
      streamTimer.current = window.setInterval(
        () => {
          shown += 1;
          setMessages((current) =>
            current.map((message) =>
              message.id === messageId
                ? { ...message, text: words.slice(0, shown).join(" ") }
                : message,
            ),
          );
          if (shown === words.length) {
            window.clearInterval(streamTimer.current);
            setPhase("idle");
            setDraft(snapshot);
            setNotice("초안을 갱신했습니다. 내용을 확인하고 반영해 주세요.");
          }
        },
        seconds(55) * 1000,
      );
    });
  };
  const apply = () => {
    if (pending || applyRequest.saving || !draft.name.trim()) return;
    const snapshot = { ...draft, name: draft.name.trim() };
    applyRequest.save(() => {
      setApplied(snapshot);
      setNotice("회의 초안을 프로젝트에 반영했습니다");
    });
  };
  useDemo((tick) => {
    const step = tick % 7;
    if (step === 1) setQuestion("회의를 30분으로 줄여 주세요");
    if (step === 2 || step === 6) send();
    if (step === 4) apply();
    if (step === 5) setQuestion("조금 더 짧게 정리해 주세요");
    if (step === 0) {
      request.cancel();
      applyRequest.cancel();
      window.clearInterval(streamTimer.current);
      setMessages([greeting]);
      setQuestion("");
      setDraft(initial);
      setPhase("idle");
      setNotice("");
      setApplied(null);
      nextId.current = 1;
    }
  });
  return (
    <ScreenFrame title="팀 회의 준비" section="AI와 함께 작업">
      <div className="sc-assistant-layout" data-result={params.result}>
        <section className="sc-conversation" aria-label="초안에 대한 대화">
          <h4>함께 다듬기</h4>
          <div className="sc-messages" role="log" aria-label="대화 기록">
            {messages.map((message) => (
              <div
                key={message.id}
                className="sc-bubble"
                data-role={message.role}
              >
                <span className="sc-message-author">
                  {message.role === "user" ? "나" : "도우미"}
                </span>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          <p className="sc-pending" role="status">
            {request.saving
              ? "초안을 살펴보고 있습니다"
              : phase === "answering"
                ? "답변을 작성하고 있습니다"
                : ""}
          </p>
          <form
            className="sc-composer"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <label htmlFor={`${id}-question`}>어떻게 바꿀까요?</label>
            <textarea
              id={`${id}-question`}
              name="question"
              rows={3}
              value={question}
              disabled={applyRequest.saving}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <div className="sc-actions">
              {pending && (
                <button type="button" className="mfd-button" onClick={stop}>
                  답변 중지
                </button>
              )}
              <button
                type="submit"
                className="mfd-button is-primary"
                disabled={pending || applyRequest.saving || !question.trim()}
              >
                보내기
              </button>
            </div>
          </form>
        </section>
        <section className="sc-result-preview" aria-label="회의 초안 미리보기">
          <h4>회의 초안</h4>
          <fieldset
            className="mfd-fields"
            disabled={pending || applyRequest.saving}
          >
            <FormControl
              name="name"
              label="회의 이름"
              value={draft.name}
              error={draft.name.trim() ? "" : "회의 이름을 입력해 주세요"}
              onChange={(name) => setDraft((current) => ({ ...current, name }))}
            />
            <FormControl
              name="duration"
              label="회의 시간"
              kind="select"
              value={draft.duration}
              onChange={(duration) =>
                setDraft((current) => ({ ...current, duration }))
              }
              options={[
                { value: "30", label: "30분" },
                { value: "45", label: "45분" },
              ]}
            />
            <FormControl
              name="agenda"
              label="다룰 내용"
              kind="textarea"
              value={draft.agenda}
              onChange={(agenda) =>
                setDraft((current) => ({ ...current, agenda }))
              }
            />
          </fieldset>
          <details className="sc-sources">
            <summary>참고한 자료 2개</summary>
            <ul>
              <li>
                <b>지난주 회의 기록</b>
                <p>
                  진행 상황 공유에 시간이 길어져 논의할 일을 충분히 다루지
                  못했습니다.
                </p>
              </li>
              <li>
                <b>팀 운영 안내</b>
                <p>회의를 마칠 때 다음 행동과 담당자를 정합니다.</p>
              </li>
            </ul>
          </details>
          <button
            type="button"
            className="mfd-button is-primary"
            disabled={pending || applyRequest.saving || !draft.name.trim()}
            onClick={apply}
          >
            {applyRequest.saving ? "반영 중" : "프로젝트에 반영"}
          </button>
          {applied && (
            <p className="sc-applied-result">
              반영한 회의: {applied.name} / {applied.duration}분
            </p>
          )}
        </section>
      </div>
      <ScreenStatus>{notice}</ScreenStatus>
    </ScreenFrame>
  );
}
