import { useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { FormControl, FormDialogShell } from "./FormDialogShared";
import "./SpecimenExtensions.css";

const original = "주간 개발 모임";

export default function FormClose({ params }: SpecimenProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(original);
  const [saved, setSaved] = useState(original);
  const [confirm, setConfirm] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const userOpened = useRef(false);
  const start = (byUser: boolean) => {
    userOpened.current = byUser;
    setName(saved);
    setConfirm(false);
    setOpen(true);
  };
  const requestClose = () => {
    if (name !== saved) setConfirm(true);
    else setOpen(false);
  };
  const discard = () => {
    setName(saved);
    setConfirm(false);
    setOpen(false);
  };
  useDemo((tick) => {
    const step = tick % 6;
    if (step === 1) start(false);
    if (step === 2) setName("금요일 개발 모임");
    if (step === 3 || step === 5) requestClose();
    if (step === 4) setConfirm(false);
    if (step === 0) {
      discard();
      setSaved(original);
    }
  });
  const confirmation = (
    <p className="sx-confirm-copy" role="status">
      {confirm ? "저장하지 않은 변경이 있습니다. 계속 작성할까요?" : ""}
    </p>
  );
  return (
    <div className="mfd-stage">
      <div className="mfd-workspace" inert={open}>
        <h3>{saved}</h3>
        <button
          ref={triggerRef}
          type="button"
          className="mfd-button"
          onClick={() => start(true)}
        >
          이름 수정
        </button>
      </div>
      <FormDialogShell
        open={open}
        userOpened={userOpened.current}
        title="모임 이름 수정"
        triggerRef={triggerRef}
        formRef={formRef}
        focus={confirm ? "heading" : "field"}
        onClose={requestClose}
        onSubmit={() => {
          if (!confirm && name.trim()) {
            setSaved(name.trim());
            setOpen(false);
          }
        }}
        actions={
          <div className="sx-close-confirm" data-place={params.place}>
            {params.place === "footer" && confirmation}
            <div className="sx-actions">
              {confirm ? (
                <>
                  <button
                    type="button"
                    className="mfd-button"
                    onClick={discard}
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
                  <button
                    type="button"
                    className="mfd-button"
                    onClick={requestClose}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="mfd-button is-primary"
                    disabled={!name.trim()}
                  >
                    저장
                  </button>
                </>
              )}
            </div>
          </div>
        }
      >
        {params.place === "body" && confirmation}
        {!(confirm && params.place === "body") && (
          <fieldset className="mfd-fields" disabled={confirm}>
            <FormControl
              name="name"
              label="모임 이름"
              value={name}
              onChange={setName}
              initial
            />
          </fieldset>
        )}
      </FormDialogShell>
    </div>
  );
}
