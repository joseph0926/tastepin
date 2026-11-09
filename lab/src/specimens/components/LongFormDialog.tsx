import { useRef, useState, type ReactNode } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import {
  focusFormField,
  FormControl,
  FormDialogShell,
  useFormSave,
  validEmail,
} from "./FormDialogShared";

const initial = {
  name: "주간 개발 모임",
  email: "",
  description: "개발하며 배운 내용을 나누는 모임입니다.",
  channel: "email",
  digest: "weekly",
  access: "members",
  capacity: "20",
};

export default function LongFormDialog({ params }: SpecimenProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const userOpened = useRef(false);
  const { saving, save, cancel } = useFormSave();
  const errors = {
    name: values.name.trim() ? "" : "모임 이름을 입력해 주세요",
    email: validEmail(values.email) ? "" : "담당자 이메일을 확인해 주세요",
  };
  const change = (key: keyof typeof initial, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const close = () => {
    cancel();
    setOpen(false);
  };
  const start = (byUser: boolean) => {
    cancel();
    userOpened.current = byUser;
    setValues(saved);
    setSubmitted(false);
    setOpen(true);
  };
  const submit = (byUser: boolean) => {
    if (!open || saving) return;
    setSubmitted(true);
    const firstError = errors.name ? "name" : errors.email ? "email" : "";
    if (firstError) {
      if (byUser) focusFormField(formRef.current, firstError);
      return;
    }
    const snapshot = { ...values };
    save(() => {
      setSaved(snapshot);
      setSavedOnce(true);
      setOpen(false);
    });
  };
  useDemo((tick) => {
    const step = tick % 6;
    if (step === 1) start(false);
    if (step === 2) {
      const scroller =
        params.scroll === "whole"
          ? formRef.current
          : formRef.current?.querySelector<HTMLElement>(".mfd-content");
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }
    if (step === 3) {
      submit(false);
      if (formRef.current) formRef.current.scrollTop = 0;
      const content =
        formRef.current?.querySelector<HTMLElement>(".mfd-content");
      if (content) content.scrollTop = 0;
    }
    if (step === 4) change("email", "owner@example.com");
    if (step === 5) submit(false);
    if (step === 0) {
      close();
      setSaved(initial);
      setValues(initial);
      setSavedOnce(false);
      setSubmitted(false);
    }
  });
  const group = (title: string, children: ReactNode, expanded = false) =>
    params.groups === "fold" ? (
      <details className="mfd-group" open={expanded}>
        <summary>{title}</summary>
        <div>{children}</div>
      </details>
    ) : (
      <section className="mfd-group">
        <h5>{title}</h5>
        <div>{children}</div>
      </section>
    );

  return (
    <div className="mfd-stage">
      <div className="mfd-workspace" inert={open}>
        <h3>모임 설정</h3>
        <p>{saved.name}</p>
        <button
          ref={triggerRef}
          type="button"
          className="mfd-button"
          onClick={() => start(true)}
        >
          설정 수정
        </button>
        <dl className="mfd-summary">
          <div>
            <dt>정원</dt>
            <dd>{saved.capacity}명</dd>
          </div>
          <div>
            <dt>알림</dt>
            <dd>{saved.digest === "weekly" ? "주간 요약" : "매일"}</dd>
          </div>
        </dl>
        <p className="mfd-status" role="status">
          {savedOnce ? "설정을 저장했습니다" : ""}
        </p>
      </div>
      <FormDialogShell
        open={open}
        userOpened={userOpened.current}
        title="모임 설정"
        onClose={close}
        onSubmit={() => submit(true)}
        triggerRef={triggerRef}
        formRef={formRef}
        scroll={params.scroll}
        actions={
          <>
            <button type="button" className="mfd-button" onClick={close}>
              취소
            </button>
            <button
              type="submit"
              className="mfd-button is-primary"
              disabled={saving}
            >
              {saving ? "저장 중" : "저장"}
            </button>
          </>
        }
      >
        <fieldset className="mfd-fields" disabled={saving}>
          {params.errors === "summary" && (
            <div
              className="mfd-error-summary"
              role={
                submitted && (errors.name || errors.email) ? "alert" : undefined
              }
            >
              {submitted && (errors.name || errors.email) && (
                <>
                  <b>입력한 내용을 확인해 주세요</b>
                  {Object.entries(errors)
                    .filter(([, error]) => error)
                    .map(([name, error]) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => focusFormField(formRef.current, name)}
                      >
                        {error}
                      </button>
                    ))}
                </>
              )}
            </div>
          )}
          {group(
            "기본 정보",
            <>
              <FormControl
                name="name"
                label="모임 이름"
                value={values.name}
                onChange={(value) => change("name", value)}
                error={submitted ? errors.name : ""}
                initial
              />
              <FormControl
                name="email"
                label="담당자 이메일"
                kind="email"
                value={values.email}
                onChange={(value) => change("email", value)}
                error={submitted ? errors.email : ""}
              />
              <FormControl
                name="description"
                label="소개"
                kind="textarea"
                value={values.description}
                onChange={(value) => change("description", value)}
              />
            </>,
            true,
          )}
          {group(
            "알림",
            <>
              <FormControl
                name="channel"
                label="받는 곳"
                kind="select"
                value={values.channel}
                onChange={(value) => change("channel", value)}
                options={[
                  { value: "email", label: "이메일" },
                  { value: "app", label: "앱 안에서" },
                ]}
              />
              <FormControl
                name="digest"
                label="요약 주기"
                kind="select"
                value={values.digest}
                onChange={(value) => change("digest", value)}
                options={[
                  { value: "weekly", label: "일주일에 한 번" },
                  { value: "daily", label: "매일" },
                ]}
              />
            </>,
          )}
          {group(
            "참가",
            <>
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
            </>,
          )}
        </fieldset>
      </FormDialogShell>
    </div>
  );
}
