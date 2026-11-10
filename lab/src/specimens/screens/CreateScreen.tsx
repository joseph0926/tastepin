import { useLayoutEffect, useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import {
  focusFormField,
  FormControl,
  useFormSave,
} from "../components/FormDialogShared";
import { ScreenFrame, ScreenStatus } from "./ScreenShared";

const initial = { name: "", description: "", owner: "박서윤", capacity: "20" };
const steps = ["프로젝트 정보", "참가와 첨부", "최종 확인"];
type Attachment = Pick<File, "name" | "size">;
type Created = { values: typeof initial; attachment: Attachment | null };

export default function CreateScreen({ params }: SpecimenProps) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const userAction = useRef(false);
  const saveRequest = useFormSave();
  const upload = useFormSave();
  const nameError = values.name.trim() ? "" : "프로젝트 이름을 입력해 주세요";
  const change = (key: keyof typeof initial, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const attach = (file: Attachment) => {
    upload.cancel();
    setAttachment({ name: file.name, size: file.size });
    upload.save(() => {});
  };
  const next = (byUser: boolean) => {
    if (saveRequest.saving || upload.saving) return;
    userAction.current = byUser;
    if (step === 0 && nameError) {
      setTouched(true);
      if (byUser) focusFormField(formRef.current, "name");
      return;
    }
    if (step < 2) setStep((current) => current + 1);
    else if (step === 2) {
      const snapshot = {
        values: { ...values, name: values.name.trim() },
        attachment,
      };
      saveRequest.save(() => {
        setCreated(snapshot);
        setStep(3);
      });
    }
  };
  const previous = () => {
    if (!saveRequest.saving) {
      userAction.current = true;
      setStep((current) => Math.max(0, current - 1));
    }
  };
  const reset = () => {
    saveRequest.cancel();
    upload.cancel();
    setStep(0);
    setValues(initial);
    setTouched(false);
    setAttachment(null);
    setCreated(null);
  };
  useLayoutEffect(() => {
    if (userAction.current) headingRef.current?.focus({ preventScroll: true });
    userAction.current = false;
  }, [step]);
  useDemo((tick) => {
    const action = tick % 8;
    if (action === 1) {
      change("name", "금요일 코드 읽기");
      change("description", "짧은 코드를 함께 읽고 질문을 나눕니다.");
    }
    if (action === 2 || action === 5 || action === 6) next(false);
    if (action === 3) attach({ name: "프로젝트 안내.pdf", size: 245760 });
    if (action === 4) change("capacity", "40");
    if (action === 0) reset();
  });
  const summary = (
    <dl className="sc-create-summary">
      <div>
        <dt>프로젝트</dt>
        <dd>{values.name || "이름 입력 전"}</dd>
      </div>
      <div>
        <dt>소개</dt>
        <dd>{values.description || "소개 입력 전"}</dd>
      </div>
      <div>
        <dt>담당자</dt>
        <dd>{values.owner}</dd>
      </div>
      <div>
        <dt>정원</dt>
        <dd>{values.capacity}명</dd>
      </div>
      <div>
        <dt>첨부</dt>
        <dd>{attachment?.name || "없음"}</dd>
      </div>
    </dl>
  );
  return (
    <ScreenFrame title="프로젝트 만들기" section="새 프로젝트">
      {created ? (
        <section className="sc-complete">
          <h4 ref={headingRef} tabIndex={-1}>
            프로젝트를 만들었습니다
          </h4>
          <p>{created.values.name}</p>
          <p>
            정원 {created.values.capacity}명 / 첨부{" "}
            {created.attachment?.name || "없음"}
          </p>
          <button
            type="button"
            className="mfd-button is-primary"
            onClick={reset}
          >
            새 프로젝트 만들기
          </button>
        </section>
      ) : (
        <>
          <ol className="sc-steps" aria-label="입력 단계">
            {steps.map((label, index) => (
              <li
                key={label}
                aria-current={index === step ? "step" : undefined}
              >
                <span>{index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          <div
            className="sc-create-layout"
            data-live={params.summary === "live" && step < 2}
          >
            <form
              ref={formRef}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                next(true);
              }}
            >
              <h4 ref={headingRef} tabIndex={-1}>
                {steps[step]}
              </h4>
              <fieldset className="mfd-fields" disabled={saveRequest.saving}>
                {step === 0 ? (
                  <>
                    <FormControl
                      name="name"
                      label="프로젝트 이름"
                      value={values.name}
                      error={touched ? nameError : ""}
                      onChange={(value) => {
                        setTouched(true);
                        change("name", value);
                      }}
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
                      name="owner"
                      label="담당자"
                      kind="select"
                      value={values.owner}
                      onChange={(value) => change("owner", value)}
                      options={[
                        { value: "박서윤", label: "박서윤" },
                        { value: "최민준", label: "최민준" },
                      ]}
                    />
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
                    />
                    <label className="sc-upload">
                      안내 자료 첨부
                      <input
                        ref={fileRef}
                        type="file"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) attach(file);
                        }}
                      />
                    </label>
                    {attachment && (
                      <div
                        className="sc-attachment"
                        data-pending={upload.saving}
                      >
                        <span>{attachment.name}</span>
                        <span>{upload.saving ? "확인 중" : "첨부 완료"}</span>
                        <button
                          type="button"
                          className="sc-text-button"
                          onClick={() => {
                            upload.cancel();
                            setAttachment(null);
                            if (fileRef.current) fileRef.current.value = "";
                          }}
                        >
                          첨부 취소
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  summary
                )}
              </fieldset>
              <footer className="sc-save-footer">
                <div className="sc-actions">
                  {step > 0 && (
                    <button
                      type="button"
                      className="mfd-button"
                      disabled={saveRequest.saving}
                      onClick={previous}
                    >
                      이전
                    </button>
                  )}
                  <button
                    type="submit"
                    className="mfd-button is-primary"
                    disabled={saveRequest.saving || upload.saving}
                  >
                    {saveRequest.saving
                      ? "만드는 중"
                      : step === 2
                        ? "프로젝트 만들기"
                        : "다음"}
                  </button>
                </div>
              </footer>
            </form>
            {params.summary === "live" && step < 2 && (
              <aside className="sc-create-preview" aria-label="입력 내용 요약">
                <h4>지금까지 입력한 내용</h4>
                {summary}
              </aside>
            )}
          </div>
        </>
      )}
      <ScreenStatus>
        {upload.saving
          ? "첨부 자료를 확인하고 있습니다"
          : attachment
            ? `${attachment.name} 첨부 완료`
            : ""}
      </ScreenStatus>
    </ScreenFrame>
  );
}
