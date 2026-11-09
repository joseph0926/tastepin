import { useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import {
  focusFormField,
  FormControl,
  FormDialogShell,
  useFormSave,
  validEmail,
} from "./FormDialogShared";

const empty = { name: "", email: "" };
const example = { name: "이서준", email: "seojun@example.com" };

export default function FormDialog({ params }: SpecimenProps) {
  const [phase, setPhase] = useState<"closed" | "editing" | "complete">(
    "closed",
  );
  const [values, setValues] = useState(empty);
  const [submitted, setSubmitted] = useState(false);
  const [member, setMember] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const userOpened = useRef(false);
  const { saving, save, cancel } = useFormSave();
  const errors = {
    name: values.name.trim() ? "" : "이름을 입력해 주세요",
    email: validEmail(values.email) ? "" : "이메일 주소를 확인해 주세요",
  };

  const close = () => {
    cancel();
    setPhase("closed");
  };
  const open = (byUser: boolean) => {
    cancel();
    userOpened.current = byUser;
    setValues(empty);
    setSubmitted(false);
    setPhase("editing");
  };
  const submit = (byUser: boolean) => {
    if (phase !== "editing" || saving) return;
    setSubmitted(true);
    const firstError = errors.name ? "name" : errors.email ? "email" : "";
    if (firstError) {
      if (byUser) focusFormField(formRef.current, firstError);
      return;
    }
    const name = values.name.trim();
    save(() => {
      setMember(name);
      setPhase(params.success === "receipt" ? "complete" : "closed");
    });
  };
  useDemo((tick) => {
    const step = tick % 6;
    if (step === 1) open(false);
    if (step === 2) submit(false);
    if (step === 3) setValues(example);
    if (step === 4) submit(false);
    if (step === 0) {
      close();
      setMember("");
      setValues(empty);
      setSubmitted(false);
    }
  });

  return (
    <div className="mfd-stage">
      <div className="mfd-workspace" inert={phase !== "closed"}>
        <h3>프로젝트 멤버</h3>
        <button
          ref={triggerRef}
          type="button"
          className="mfd-button is-primary"
          onClick={() => open(true)}
        >
          멤버 추가
        </button>
        <ul className="mfd-list">
          <li>
            박서윤 <span>관리자</span>
          </li>
          <li>
            최민준 <span>편집자</span>
          </li>
          {member && (
            <li>
              {member} <span>보기 전용</span>
            </li>
          )}
        </ul>
        <p className="mfd-status" role="status">
          {member ? `${member} 님을 추가했습니다` : ""}
        </p>
      </div>
      <FormDialogShell
        open={phase !== "closed"}
        userOpened={userOpened.current}
        title={phase === "complete" ? "멤버 추가 완료" : "멤버 추가"}
        onClose={close}
        onSubmit={() => submit(true)}
        triggerRef={triggerRef}
        formRef={formRef}
        focus={params.focus}
        actions={
          phase === "complete" ? (
            <button
              type="button"
              className="mfd-button is-primary"
              onClick={close}
            >
              완료
            </button>
          ) : (
            <>
              <button type="button" className="mfd-button" onClick={close}>
                취소
              </button>
              <button
                type="submit"
                className="mfd-button is-primary"
                disabled={saving}
              >
                {saving ? "추가 중" : "추가"}
              </button>
            </>
          )
        }
      >
        {phase === "complete" ? (
          <p className="mfd-receipt" role="status">
            {member} 님을 프로젝트에 추가했습니다.
          </p>
        ) : (
          <fieldset
            disabled={saving}
            className="mfd-fields"
            data-layout={params.layout}
          >
            <FormControl
              name="name"
              label="이름"
              value={values.name}
              error={submitted ? errors.name : ""}
              onChange={(name) =>
                setValues((current) => ({ ...current, name }))
              }
              initial
            />
            <FormControl
              name="email"
              label="이메일"
              kind="email"
              value={values.email}
              error={submitted ? errors.email : ""}
              onChange={(email) =>
                setValues((current) => ({ ...current, email }))
              }
            />
          </fieldset>
        )}
      </FormDialogShell>
    </div>
  );
}
