import { useId, useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import {
  focusFormField,
  FormControl,
  useFormSave,
  validEmail,
} from "../components/FormDialogShared";
import { ScreenFrame, ScreenStatus } from "./ScreenShared";

const initial = {
  name: "제품 개발팀",
  description: "팀의 프로젝트와 문서를 함께 관리합니다.",
  email: "team@example.com",
  digest: "weekly",
  access: "members",
};
const sections = [
  {
    id: "basic",
    title: "기본 정보",
    description: "팀을 처음 만나는 사람이 알아볼 이름과 소개를 적어 주세요.",
  },
  {
    id: "notifications",
    title: "알림",
    description:
      "중요한 변경을 놓치지 않도록 알림을 받을 곳과 주기를 정합니다.",
  },
  {
    id: "access",
    title: "공개 범위",
    description: "프로젝트와 문서를 볼 수 있는 사람을 정합니다.",
  },
];

export default function SettingsScreen({ params }: SpecimenProps) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [phase, setPhase] = useState<"idle" | "failed" | "saved">("idle");
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const { saving, save, cancel } = useFormSave();
  const change = (key: keyof typeof initial, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const dirty = Object.keys(initial).some(
    (key) =>
      values[key as keyof typeof initial] !==
      saved[key as keyof typeof initial],
  );
  const errors = {
    name: values.name.trim() ? "" : "팀 이름을 입력해 주세요",
    email: validEmail(values.email) ? "" : "이메일 주소를 확인해 주세요",
  };
  const moveTo = (key: string, byUser = false) => {
    const scroller = scrollRef.current;
    const target = document.getElementById(`${id}-${key}`);
    if (scroller && target)
      scroller.scrollTop +=
        target.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        12;
    if (byUser)
      target?.querySelector<HTMLElement>("h4")?.focus({ preventScroll: true });
  };
  const submit = (byUser: boolean) => {
    if (saving || !dirty) return;
    const firstError = errors.name ? "name" : errors.email ? "email" : "";
    if (firstError) {
      if (byUser) focusFormField(formRef.current, firstError);
      return;
    }
    const retry = phase === "failed";
    const snapshot = { ...values };
    setPhase("idle");
    save(() => {
      if (retry) {
        setSaved(snapshot);
        setPhase("saved");
      } else setPhase("failed");
    });
  };
  useDemo((tick) => {
    const step = tick % 7;
    if (step === 1) change("email", "team@");
    if (step === 2) {
      change("email", "updates@example.com");
      change("name", "제품과 디자인팀");
    }
    if (step === 3 || step === 5) submit(false);
    if (step === 6) moveTo("notifications");
    if (step === 0) {
      cancel();
      setValues(initial);
      setSaved(initial);
      setPhase("idle");
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  });
  const changed = (keys: (keyof typeof initial)[]) =>
    keys.some((key) => values[key] !== saved[key]);
  return (
    <ScreenFrame title="팀 설정" section="설정" scrollRef={scrollRef}>
      <nav className="sc-section-nav" aria-label="설정 구역">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className="sc-text-button"
            onClick={() => moveTo(section.id, true)}
          >
            {section.title}
          </button>
        ))}
      </nav>
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit(true);
        }}
      >
        <fieldset className="sc-settings-fields" disabled={saving}>
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={`${id}-${section.id}`}
              className="sc-setting-group"
              data-description={params.description}
            >
              <div className="sc-setting-description">
                <h4 tabIndex={-1}>
                  {section.title}
                  {changed(
                    index === 0
                      ? ["name", "description"]
                      : index === 1
                        ? ["email", "digest"]
                        : ["access"],
                  ) && <span className="sc-change-mark">변경됨</span>}
                </h4>
                <p>{section.description}</p>
              </div>
              <div className="mfd-fields">
                {index === 0 ? (
                  <>
                    <FormControl
                      name="name"
                      label="팀 이름"
                      value={values.name}
                      error={errors.name}
                      onChange={(value) => change("name", value)}
                    />
                    <FormControl
                      name="description"
                      label="팀 소개"
                      kind="textarea"
                      value={values.description}
                      onChange={(value) => change("description", value)}
                    />
                  </>
                ) : index === 1 ? (
                  <>
                    <FormControl
                      name="email"
                      label="알림 이메일"
                      kind="email"
                      value={values.email}
                      error={errors.email}
                      onChange={(value) => change("email", value)}
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
                  </>
                ) : (
                  <FormControl
                    name="access"
                    label="볼 수 있는 사람"
                    kind="select"
                    value={values.access}
                    onChange={(value) => change("access", value)}
                    options={[
                      { value: "members", label: "멤버만" },
                      { value: "public", label: "누구나" },
                    ]}
                  />
                )}
              </div>
            </section>
          ))}
        </fieldset>
        <footer className="sc-save-footer">
          <p className="sc-save-error" role="alert">
            {phase === "failed"
              ? "연결이 끊겨 저장하지 못했습니다. 입력은 남아 있습니다."
              : ""}
          </p>
          <div className="sc-actions">
            <button
              type="button"
              className="mfd-button"
              onClick={() => {
                cancel();
                setValues(saved);
                setPhase("idle");
              }}
            >
              변경 취소
            </button>
            <button
              type="submit"
              className="mfd-button is-primary"
              disabled={saving || !dirty}
            >
              {saving ? "저장 중" : phase === "failed" ? "다시 저장" : "저장"}
            </button>
          </div>
          <ScreenStatus>
            {phase === "saved"
              ? "팀 설정을 저장했습니다"
              : dirty
                ? "저장하지 않은 변경이 있습니다"
                : ""}
          </ScreenStatus>
        </footer>
      </form>
    </ScreenFrame>
  );
}
