import { useEffect, useId, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  type TargetAndTransition,
  type Transition,
} from "motion/react";
import { X } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Dialog.css";

// params: enter(scale | rise | fade), backdrop(dim | soft | blur), tempo(quick | medium | slow),
// desc(none | one | long), actions(right | full | stack), close(both | cancel | x), late(reserve | grow | wait)
// 팀 목록은 열 때마다 따로 불러오는 것으로 흉내 내 late 값의 차이(높이 변화)를 보인다.
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

const LOAD_MS = 600;

const teams = ["디자인", "프론트엔드", "제품"];

const descriptions: Record<string, string> = {
  one: "초대한 사람에게 메일이 가요.",
  long: "초대할 사람의 회사 이메일을 적고 역할을 고르세요. 관리자는 멤버를 초대하고 내보낼 수 있고, 편집자는 문서를 고칠 수 있으며, 보기 전용은 읽기만 할 수 있어요.",
};

const members = [
  ["박서윤", "관리자"],
  ["이도윤", "편집자"],
  ["최민준", "보기 전용"],
];

// closed에서 열기를 누르면 late가 wait일 때만 opening(버튼에 진행 표시)을 거친다.
// loading은 패널이 열렸고 팀 목록을 받는 중, ready는 다 받은 상태다
type Phase = "closed" | "opening" | "loading" | "ready";

export default function Dialog({ params }: SpecimenProps) {
  const [phase, setPhase] = useState<Phase>("closed");
  // 시연으로 열었을 때는 포커스를 옮기지 않는다. 다른 무대나 평가 입력의 포커스를 빼앗지 않기 위해서다
  const [byUser, setByUser] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const loadTimer = useRef<number | undefined>(undefined);
  const seconds = useSeconds();
  const titleId = useId();
  const tempo = tempos[params.tempo] ?? tempos.medium;
  const path = panelPaths[params.enter] ?? panelPaths.scale;
  const { desc, actions, close: closeMark, late } = params;
  const open = phase === "loading" || phase === "ready";

  useEffect(() => () => window.clearTimeout(loadTimer.current), []);

  const show = (fromUser: boolean) => {
    if (phase !== "closed") return;
    setByUser(fromUser);
    setPhase(late === "wait" ? "opening" : "loading");
    window.clearTimeout(loadTimer.current);
    loadTimer.current = window.setTimeout(
      () => setPhase("ready"),
      seconds(LOAD_MS) * 1000,
    );
  };

  useDemo((tick) => {
    if (tick % 2 === 1) show(false);
    else {
      window.clearTimeout(loadTimer.current);
      setByUser(false);
      setPhase("closed");
    }
  });

  useEffect(() => {
    if (open && byUser) emailRef.current?.focus();
  }, [open, byUser]);

  const close = () => {
    window.clearTimeout(loadTimer.current);
    setPhase("closed");
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
          className="dlg-button is-primary dlg-trigger"
          disabled={phase === "opening"}
          onClick={() => show(true)}
        >
          {phase === "opening" ? "불러오는 중" : "멤버 초대"}
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
                {closeMark !== "cancel" && (
                  <button
                    type="button"
                    className="dlg-icon"
                    aria-label="닫기"
                    onClick={close}
                  >
                    <X size={18} strokeWidth={1.75} />
                  </button>
                )}
              </div>
              {descriptions[desc] && (
                <p className="dlg-desc">{descriptions[desc]}</p>
              )}
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
              <Teams
                late={late}
                ready={phase === "ready"}
                transition={{ duration: seconds(220), ease: EASE_OUT }}
              />
              <div className="dlg-actions" data-actions={actions}>
                {closeMark !== "x" && (
                  <button type="button" className="dlg-button" onClick={close}>
                    취소
                  </button>
                )}
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

// 늦게 오는 팀 목록. reserve는 같은 높이의 스켈레톤으로 자리를 잡고, grow는 받은 뒤 높이를 펼치며,
// wait는 다 받은 뒤에 패널이 열리므로 처음부터 목록이 있다
function Teams({
  late,
  ready,
  transition,
}: {
  late: string;
  ready: boolean;
  transition: Transition;
}) {
  const labelId = useId();
  // fieldset은 브라우저 기본 여백 때문에 같은 내용이어도 스켈레톤보다 높아져 group 역할의 div로 둔다
  const list = (
    <div className="dlg-teams" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="dlg-teams-label">
        팀
      </span>
      {teams.map((team, index) => (
        <label key={team} className="dlg-team">
          <input type="checkbox" defaultChecked={index === 0} />
          {team}
        </label>
      ))}
    </div>
  );

  if (late === "grow")
    return (
      <AnimatePresence initial={false}>
        {ready && (
          <motion.div
            key="teams"
            className="dlg-grow"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            transition={transition}
          >
            {list}
          </motion.div>
        )}
      </AnimatePresence>
    );

  if (late === "reserve" && !ready)
    return (
      <div className="dlg-teams" aria-busy="true">
        <span className="dlg-skeleton is-label" />
        {teams.map((team) => (
          <span key={team} className="dlg-skeleton" />
        ))}
      </div>
    );

  return list;
}
