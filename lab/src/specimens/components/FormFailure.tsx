import { useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { FormControl, FormDialogShell, useFormSave } from "./FormDialogShared";
import "./SpecimenExtensions.css";

const original = "주간 독서 모임";

export default function FormFailure({ params }: SpecimenProps) {
  const [phase, setPhase] = useState<"closed" | "editing" | "failed">("closed");
  const [name, setName] = useState(original);
  const [saved, setSaved] = useState(original);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const userOpened = useRef(false);
  const { saving, save, cancel } = useFormSave();
  const start = (byUser: boolean) => {
    cancel();
    userOpened.current = byUser;
    setName(saved);
    setPhase("editing");
  };
  const close = () => {
    cancel();
    setPhase("closed");
  };
  // 첫 저장은 실패하고 재시도는 성공한다. 서버 오류 안내의 위치만 비교한다.
  const submit = () => {
    if (phase === "closed" || saving || !name.trim()) return;
    const retry = phase === "failed";
    const snapshot = name.trim();
    setPhase("editing");
    save(() => {
      if (retry) {
        setSaved(snapshot);
        setPhase("closed");
      } else setPhase("failed");
    });
  };
  useDemo((tick) => {
    const step = tick % 6;
    if (step === 1) start(false);
    if (step === 2) setName("금요일 독서 모임");
    if (step === 3 || step === 5) submit();
    if (step === 0) {
      close();
      setSaved(original);
    }
  });
  const error = (
    <p className="sx-save-error" role="alert">
      {phase === "failed"
        ? "연결이 끊겨 저장하지 못했습니다. 입력은 남아 있습니다."
        : ""}
    </p>
  );
  return (
    <div className="mfd-stage">
      <div className="mfd-workspace" inert={phase !== "closed"}>
        <h3>{saved}</h3>
        <button
          ref={triggerRef}
          type="button"
          className="mfd-button"
          onClick={() => start(true)}
        >
          이름 수정
        </button>
        <p className="mfd-status" role="status">
          {saved !== original ? "변경한 이름을 저장했습니다" : ""}
        </p>
      </div>
      <FormDialogShell
        open={phase !== "closed"}
        userOpened={userOpened.current}
        title="모임 이름 수정"
        triggerRef={triggerRef}
        formRef={formRef}
        onClose={close}
        onSubmit={submit}
        actions={
          <div className="sx-save-actions">
            {params.place === "footer" && error}
            <div className="sx-actions">
              <button type="button" className="mfd-button" onClick={close}>
                취소
              </button>
              <button
                type="submit"
                className="mfd-button is-primary"
                disabled={saving || !name.trim()}
              >
                {saving ? "저장 중" : phase === "failed" ? "다시 저장" : "저장"}
              </button>
            </div>
          </div>
        }
      >
        {params.place === "top" && error}
        <fieldset className="mfd-fields" disabled={saving}>
          <FormControl
            name="name"
            label="모임 이름"
            value={name}
            onChange={setName}
            initial
          />
        </fieldset>
      </FormDialogShell>
    </div>
  );
}
