import { useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import {
  focusFormField,
  FormControl,
  FormDialogShell,
  useFormSave,
} from "./FormDialogShared";

const initial = {
  name: "",
  description: "",
  capacity: "20",
  access: "members",
};

export default function StepFormDialog({ params }: SpecimenProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(initial);
  const [created, setCreated] = useState<typeof initial | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const userOpened = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { saving, save, cancel } = useFormSave();
  const labels =
    params.review === "separate"
      ? ["행사 정보", "참가 설정", "확인"]
      : ["행사 정보", "참가 설정"];
  const last = step === labels.length - 1;
  const nameError = values.name.trim() ? "" : "행사 이름을 입력해 주세요";
  const change = (key: keyof typeof initial, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const close = () => {
    cancel();
    setOpen(false);
  };
  const start = (byUser: boolean) => {
    cancel();
    userOpened.current = byUser;
    setValues(initial);
    setStep(0);
    setSubmitted(false);
    setOpen(true);
  };
  const next = (byUser: boolean) => {
    if (!open || saving) return;
    setSubmitted(true);
    if (step === 0 && nameError) {
      if (byUser) focusFormField(formRef.current, "name");
      return;
    }
    if (last) {
      const snapshot = { ...values, name: values.name.trim() };
      save(() => {
        setCreated(snapshot);
        setOpen(false);
      });
    } else {
      setStep((current) => current + 1);
      setSubmitted(false);
    }
  };
  const previous = () => {
    if (!saving) {
      setStep((current) => Math.max(0, current - 1));
      setSubmitted(false);
    }
  };

  useDemo((tick) => {
    const action = tick % 8;
    if (action === 1) start(false);
    if (action === 2) {
      change("name", "금요일 코드 읽기");
      change("description", "짧은 코드를 함께 읽고 질문을 나눕니다.");
    }
    if (action === 3) next(false);
    if (action === 4) previous();
    if (action === 5) next(false);
    if (action === 6) next(false);
    if (action === 7 && params.review === "separate") next(false);
    if (action === 0) {
      close();
      setCreated(null);
      setValues(initial);
      setStep(0);
      setSubmitted(false);
    }
  });

  const review = (
    <dl className="mfd-summary">
      <div>
        <dt>행사</dt>
        <dd>{values.name}</dd>
      </div>
      <div>
        <dt>정원</dt>
        <dd>{values.capacity}명</dd>
      </div>
      <div>
        <dt>공개 범위</dt>
        <dd>{values.access === "members" ? "멤버만" : "누구나"}</dd>
      </div>
    </dl>
  );
  return (
    <div className="mfd-stage">
      <div className="mfd-workspace" inert={open}>
        <h3>예정된 행사</h3>
        <button
          ref={triggerRef}
          type="button"
          className="mfd-button is-primary"
          onClick={() => start(true)}
        >
          행사 만들기
        </button>
        <ul className="mfd-list">
          <li>
            주간 회고 <span>12명</span>
          </li>
          {created && (
            <li>
              {created.name} <span>{created.capacity}명</span>
            </li>
          )}
        </ul>
        <p className="mfd-status" role="status">
          {created ? `${created.name} 행사를 만들었습니다` : ""}
        </p>
      </div>
      <FormDialogShell
        open={open}
        userOpened={userOpened.current}
        title="행사 만들기"
        onClose={close}
        onSubmit={() => next(true)}
        triggerRef={triggerRef}
        formRef={formRef}
        height={params.height}
        actions={
          <>
            {step === 0 ? (
              <button type="button" className="mfd-button" onClick={close}>
                취소
              </button>
            ) : (
              <button
                type="button"
                className="mfd-button"
                onClick={previous}
                disabled={saving}
              >
                이전
              </button>
            )}
            <button
              type="submit"
              className="mfd-button is-primary"
              disabled={saving}
            >
              {saving ? "만드는 중" : last ? "만들기" : "다음"}
            </button>
          </>
        }
      >
        <div className="mfd-step-layout" data-navigation={params.navigation}>
          <nav aria-label="입력 단계" className="mfd-steps">
            {params.navigation === "count" ? (
              <span>
                {step + 1}/{labels.length} {labels[step]}
              </span>
            ) : (
              <ol>
                {labels.map((label, index) => (
                  <li
                    key={label}
                    aria-current={index === step ? "step" : undefined}
                  >
                    <span>{index + 1}</span>
                    {label}
                  </li>
                ))}
              </ol>
            )}
          </nav>
          <fieldset disabled={saving} className="mfd-fields mfd-step-fields">
            {step === 0 ? (
              <>
                <FormControl
                  name="name"
                  label="행사 이름"
                  value={values.name}
                  onChange={(value) => change("name", value)}
                  error={submitted ? nameError : ""}
                  initial
                />
                <FormControl
                  name="description"
                  label="소개"
                  kind="textarea"
                  value={values.description}
                  onChange={(value) => change("description", value)}
                />
              </>
            ) : step === 1 ? (
              <>
                <FormControl
                  name="capacity"
                  label="정원"
                  kind="select"
                  value={values.capacity}
                  onChange={(value) => change("capacity", value)}
                  options={[
                    { value: "20", label: "20명" },
                    { value: "40", label: "40명" },
                  ]}
                  initial
                />
                <FormControl
                  name="access"
                  label="공개 범위"
                  kind="select"
                  value={values.access}
                  onChange={(value) => change("access", value)}
                  options={[
                    { value: "members", label: "멤버만" },
                    { value: "public", label: "누구나" },
                  ]}
                />
                {params.review === "inline" && review}
              </>
            ) : (
              review
            )}
          </fieldset>
        </div>
      </FormDialogShell>
    </div>
  );
}
