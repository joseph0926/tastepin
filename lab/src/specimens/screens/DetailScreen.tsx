import { useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { projects, ProjectFacts } from "../components/ProjectExamples";
import {
  FormControl,
  FormDialogShell,
  useFormSave,
} from "../components/FormDialogShared";
import { ScreenFrame, ScreenStatus } from "./ScreenShared";

const initial = projects[0];

export default function DetailScreen({ params }: SpecimenProps) {
  const [project, setProject] = useState(initial);
  const [draft, setDraft] = useState({
    name: initial.name,
    description: initial.description,
  });
  const [view, setView] = useState<"detail" | "list">("detail");
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const byUser = useRef(false);
  const { saving, save, cancel } = useFormSave();
  const dirty =
    draft.name !== project.name || draft.description !== project.description;
  const start = (user: boolean) => {
    cancel();
    byUser.current = user;
    setDraft({ name: project.name, description: project.description });
    setConfirm(false);
    setOpen(true);
  };
  const close = () => {
    if (dirty) {
      cancel();
      setConfirm(true);
    } else {
      cancel();
      setOpen(false);
    }
  };
  const submit = () => {
    if (!draft.name.trim() || saving || confirm) return;
    const snapshot = { ...draft, name: draft.name.trim() };
    save(() => {
      setProject((current) => ({ ...current, ...snapshot }));
      setOpen(false);
      setMessage("프로젝트를 저장했습니다");
    });
  };
  useDemo((tick) => {
    const step = tick % 7;
    if (step === 1) start(false);
    if (step === 2)
      setDraft((current) => ({
        ...current,
        description: "공통 규칙과 사용 예제를 정리하고 팀 검토를 진행합니다.",
      }));
    if (step === 3) close();
    if (step === 4) setConfirm(false);
    if (step === 5) submit();
    if (step === 6) setView("list");
    if (step === 0) {
      cancel();
      setProject(initial);
      setView("detail");
      setOpen(false);
      setConfirm(false);
      setMessage("");
    }
  });
  const editor = (
    <FormDialogShell
      open={open}
      userOpened={byUser.current}
      title="프로젝트 수정"
      triggerRef={triggerRef}
      formRef={formRef}
      onClose={close}
      onSubmit={submit}
      actions={
        <div className="sc-edit-actions">
          <p className="sc-confirm" role="status">
            {confirm ? "저장하지 않은 변경이 있습니다. 계속 작성할까요?" : ""}
          </p>
          <div className="sc-actions">
            {confirm ? (
              <>
                <button
                  type="button"
                  className="mfd-button"
                  onClick={() => {
                    cancel();
                    setOpen(false);
                    setConfirm(false);
                  }}
                >
                  변경 버리고 닫기
                </button>
                <button
                  type="button"
                  className="mfd-button is-primary"
                  onClick={() => setConfirm(false)}
                >
                  계속 작성
                </button>
              </>
            ) : (
              <>
                <button type="button" className="mfd-button" onClick={close}>
                  취소
                </button>
                <button
                  type="submit"
                  className="mfd-button is-primary"
                  disabled={saving || !draft.name.trim()}
                >
                  {saving ? "저장 중" : "저장"}
                </button>
              </>
            )}
          </div>
        </div>
      }
    >
      <fieldset className="mfd-fields" disabled={saving || confirm}>
        <FormControl
          name="name"
          label="프로젝트 이름"
          value={draft.name}
          error={draft.name.trim() ? "" : "프로젝트 이름을 입력해 주세요"}
          onChange={(name) => setDraft((current) => ({ ...current, name }))}
          initial
        />
        <FormControl
          name="description"
          label="설명"
          kind="textarea"
          value={draft.description}
          onChange={(description) =>
            setDraft((current) => ({ ...current, description }))
          }
        />
      </fieldset>
    </FormDialogShell>
  );
  return (
    <ScreenFrame
      blocked={open}
      overlay={editor}
      title={view === "detail" ? project.name : "프로젝트 목록"}
      actions={
        view === "detail" && (
          <button
            ref={triggerRef}
            type="button"
            className="mfd-button is-primary"
            disabled={open}
            onClick={() => start(true)}
          >
            수정
          </button>
        )
      }
    >
      <div inert={open}>
        {view === "list" ? (
          <div className="sc-related-list">
            {projects.map((item, index) => (
              <div key={item.id}>
                <b>{index === 0 ? project.name : item.name}</b>
                <span>{item.status}</span>
                {index === 0 && (
                  <button
                    type="button"
                    className="mfd-button"
                    onClick={() => setView("detail")}
                  >
                    상세 보기
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <>
            <button
              type="button"
              className="sc-text-button"
              onClick={() => setView("list")}
            >
              목록으로
            </button>
            <ScreenStatus>{message}</ScreenStatus>
            <div className="sc-detail-layout" data-summary={params.summary}>
              <section
                className="sc-project-summary"
                aria-label="프로젝트 요약"
              >
                <h4>프로젝트 요약</h4>
                <ProjectFacts project={project} />
              </section>
              <div className="sc-detail-body">
                <section>
                  <h4>이 프로젝트에서 할 일</h4>
                  <p>{project.description}</p>
                  <ul>
                    <li>현재 사용 중인 입력과 버튼을 정리합니다.</li>
                    <li>빠진 상태와 접근성 안내를 보완합니다.</li>
                    <li>팀 검토를 거쳐 공통 예제를 확정합니다.</li>
                  </ul>
                </section>
                <section>
                  <h4>최근 활동</h4>
                  <ol className="sc-activity">
                    <li>
                      <b>박서윤</b> 이름과 범위를 정리했습니다.
                      <span>오늘 오전 10:00</span>
                    </li>
                    <li>
                      <b>최민준</b> 검토할 항목을 추가했습니다.
                      <span>어제 오후 3:20</span>
                    </li>
                    <li>
                      <b>정하은</b> 예산을 확인했습니다.<span>11월 8일</span>
                    </li>
                  </ol>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </ScreenFrame>
  );
}
