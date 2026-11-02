import { useEffect, useId, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  type TargetAndTransition,
} from "motion/react";
import { X } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Dialog.css";

// params: enter(scale | rise | fade), backdrop(dim | soft | blur), tempo(quick | medium | slow)
// 시편 무대 안에 갇혀 보이도록 대화상자를 무대 기준 absolute로 그린다. 실제 화면에서는 포털과
// 포커스 가두기를 프로젝트의 프리미티브(Radix Dialog, <dialog> 등)에 맡기고 모양과 모션 값만 옮긴다.

const tempos: Record<string, { enter: number; exit: number }> = {
  // 퇴장은 등장과 같은 길이로 고정한다('반응과 퇴장'의 mirror 값)
  quick: { enter: 160, exit: 160 },
  medium: { enter: 220, exit: 220 },
  slow: { enter: 300, exit: 300 },
};

const panelPaths: Record<
  string,
  { from: TargetAndTransition; exit: TargetAndTransition }
> = {
  scale: {
    from: { opacity: 0, scale: 0.96 },
    exit: { opacity: 0, scale: 0.96 },
  },
  rise: { from: { opacity: 0, y: 12 }, exit: { opacity: 0, y: 12 } },
  fade: { from: { opacity: 0 }, exit: { opacity: 0 } },
};

const members = [
  ["박서윤", "관리자"],
  ["이도윤", "편집자"],
  ["최민준", "보기 전용"],
];

export default function Dialog({ params }: SpecimenProps) {
  const [open, setOpen] = useState(false);
  // 시연으로 열었을 때는 포커스를 옮기지 않는다. 다른 무대나 평가 입력의 포커스를 빼앗지 않기 위해서다
  const [byUser, setByUser] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const seconds = useSeconds();
  const titleId = useId();
  const tempo = tempos[params.tempo] ?? tempos.medium;
  const path = panelPaths[params.enter] ?? panelPaths.scale;

  useDemo((tick) => {
    setByUser(false);
    setOpen(tick % 2 === 1);
  });

  useEffect(() => {
    if (open && byUser) emailRef.current?.focus();
  }, [open, byUser]);

  const close = () => {
    setOpen(false);
    if (byUser) triggerRef.current?.focus();
  };

  const enter = { duration: seconds(tempo.enter), ease: EASE_OUT };
  const exit = { duration: seconds(tempo.exit), ease: EASE_OUT };

  return (
    <div className="dlg-page">
      <div className="dlg-page-head">
        <div>
          <h3>팀 멤버</h3>
          <p>3명이 이 워크스페이스에 참여하고 있어요.</p>
        </div>
        <button
          ref={triggerRef}
          type="button"
          className="dlg-button is-primary"
          onClick={() => {
            setByUser(true);
            setOpen(true);
          }}
        >
          멤버 초대
        </button>
      </div>
      <ul className="dlg-members">
        {members.map(([name, role]) => (
          <li key={name}>
            <span className="dlg-avatar" aria-hidden="true">
              {name[0]}
            </span>
            <b>{name}</b>
            <span>{role}</span>
          </li>
        ))}
      </ul>

      <AnimatePresence>
        {open && (
          <div
            key="layer"
            className="dlg-layer"
            onKeyDown={(event) => event.key === "Escape" && close()}
          >
            <motion.div
              className={`dlg-backdrop backdrop-${params.backdrop}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: enter }}
              exit={{ opacity: 0, transition: exit }}
              onClick={close}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="dlg-panel"
              initial={path.from}
              animate={{ opacity: 1, scale: 1, y: 0, transition: enter }}
              exit={{ ...path.exit, transition: exit }}
            >
              <div className="dlg-panel-head">
                <h4 id={titleId}>멤버 초대</h4>
                <button
                  type="button"
                  className="dlg-icon"
                  aria-label="닫기"
                  onClick={close}
                >
                  <X size={18} strokeWidth={1.75} />
                </button>
              </div>
              <label className="dlg-field">
                <span>이메일</span>
                <input
                  ref={emailRef}
                  type="email"
                  placeholder="name@company.com"
                />
              </label>
              <label className="dlg-field">
                <span>역할</span>
                <select defaultValue="editor">
                  <option value="admin">관리자</option>
                  <option value="editor">편집자</option>
                  <option value="viewer">보기 전용</option>
                </select>
              </label>
              <div className="dlg-actions">
                <button type="button" className="dlg-button" onClick={close}>
                  취소
                </button>
                <button
                  type="button"
                  className="dlg-button is-primary"
                  onClick={close}
                >
                  초대 보내기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
