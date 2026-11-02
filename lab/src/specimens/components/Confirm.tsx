import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileText } from "lucide-react";
import { EASE_OUT_CUBIC, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Confirm.css";

// params: pattern(dialog | undo | inline), wording(plain | object | consequence), danger(solid | text | neutral), removal(collapse | fade | instant)
// 확인 대화상자는 대화상자 시편의 한 조합(커지며 등장, 흐린 배경, 300ms)으로, 되돌리기 알림은 토스트 시편의 한 조합(오른쪽 아래, 가장자리에서)으로 고정해 그린다.

const initial = [
  { id: "a", name: "10월 예산안", meta: "박서윤, 10월 15일" },
  { id: "b", name: "디자인 리뷰 회의록", meta: "이도윤, 10월 16일" },
  { id: "c", name: "신규 입사자 안내", meta: "최민준, 10월 14일" },
  { id: "d", name: "분기 보고서 초안", meta: "이도윤, 10월 9일" },
];
type Doc = (typeof initial)[number];
const UNDO_MS = 5000;
const ARM_MS = 3000;
const TARGET = "a";

export default function Confirm({ params }: SpecimenProps) {
  const [docs, setDocs] = useState(initial);
  const [asking, setAsking] = useState<Doc | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ doc: Doc; index: number } | null>(
    null,
  );
  const timer = useRef<number>(undefined);
  const titleId = useId();
  const seconds = useSeconds();
  const { pattern, wording, danger, removal } = params;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const remove = (doc: Doc) => {
    const index = docs.findIndex((item) => item.id === doc.id);
    setDocs((current) => current.filter((item) => item.id !== doc.id));
    setAsking(null);
    setArmed(null);
    if (pattern === "undo") {
      setRemoved({ doc, index });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => setRemoved(null),
        seconds(UNDO_MS) * 1000,
      );
    }
  };

  const undo = () => {
    if (!removed) return;
    setDocs((current) => {
      const next = [...current];
      next.splice(removed.index, 0, removed.doc);
      return next;
    });
    setRemoved(null);
  };

  const ask = (doc: Doc) => {
    if (pattern === "undo") return remove(doc);
    if (pattern === "dialog") return setAsking(doc);
    if (armed === doc.id) return remove(doc);
    setArmed(doc.id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setArmed(null),
      seconds(ARM_MS) * 1000,
    );
  };

  // 시연 순서: 지우기 누르기, 확인(또는 한 번 더), 되돌리기, 처음으로
  useDemo((tick) => {
    const step = (tick - 1) % 4;
    const target = docs.find((doc) => doc.id === TARGET);
    if (step === 0 && target) ask(target);
    if (step === 1) {
      if (pattern === "dialog" && asking) remove(asking);
      if (pattern === "inline" && target) remove(target);
    }
    if (step === 2) undo();
    if (step === 3) {
      setDocs(initial);
      setAsking(null);
      setArmed(null);
      setRemoved(null);
    }
  });

  const label = {
    plain: {
      title: "삭제할까요?",
      body: "",
      action: "삭제",
      armed: "정말 삭제",
    },
    object: {
      title: `'${asking?.name ?? ""}'을 삭제할까요?`,
      body: "",
      action: "문서 삭제",
      armed: "문서 삭제?",
    },
    consequence: {
      title: `'${asking?.name ?? ""}'을 삭제할까요?`,
      body: "삭제하면 되돌릴 수 없고 공유한 사람도 볼 수 없어요.",
      action: "영구 삭제",
      armed: "영구 삭제?",
    },
  }[wording] ?? {
    title: "삭제할까요?",
    body: "",
    action: "삭제",
    armed: "정말 삭제",
  };

  const out = {
    duration: seconds(removal === "instant" ? 0 : 220),
    ease: EASE_OUT_CUBIC,
  };
  const exit =
    removal === "collapse"
      ? { opacity: 0, height: 0, transition: out }
      : removal === "fade"
        ? {
            opacity: 0,
            height: 0,
            transition: {
              opacity: { duration: seconds(160), ease: EASE_OUT_CUBIC },
              height: {
                duration: seconds(220),
                delay: seconds(160),
                ease: EASE_OUT_CUBIC,
              },
            },
          }
        : { opacity: 0, height: 0, transition: { duration: 0 } };
  const dialogTiming = { duration: seconds(300), ease: EASE_OUT_CUBIC };

  return (
    <div
      className="cfm-page"
      data-danger={danger}
      onKeyDown={(event) => event.key === "Escape" && setAsking(null)}
    >
      <h3>문서</h3>
      <ul className="cfm-list">
        <AnimatePresence initial={false}>
          {docs.map((doc) => (
            <motion.li
              key={doc.id}
              initial={
                removal === "instant" ? false : { opacity: 0, height: 0 }
              }
              animate={{ opacity: 1, height: "auto", transition: out }}
              exit={exit}
            >
              <div className="cfm-row">
                <FileText size={16} strokeWidth={1.75} aria-hidden />
                <span className="cfm-name">{doc.name}</span>
                <span className="cfm-meta">{doc.meta}</span>
                <button
                  type="button"
                  className={
                    armed === doc.id ? "cfm-delete is-armed" : "cfm-delete"
                  }
                  onClick={() => ask(doc)}
                >
                  {armed === doc.id ? label.armed : "삭제"}
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <AnimatePresence>
        {asking && (
          <div key="dialog" className="cfm-layer">
            <motion.div
              className="cfm-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={dialogTiming}
              onClick={() => setAsking(null)}
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="cfm-dialog"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={dialogTiming}
            >
              <h4 id={titleId}>{label.title}</h4>
              {label.body && <p>{label.body}</p>}
              <div className="cfm-actions">
                <button
                  type="button"
                  className="cfm-button"
                  onClick={() => setAsking(null)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="cfm-button is-danger"
                  onClick={() => remove(asking)}
                >
                  {label.action}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="cfm-toasts" aria-live="polite">
        <AnimatePresence>
          {removed && (
            <motion.div
              key={removed.doc.id}
              className="cfm-toast"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: seconds(200), ease: EASE_OUT_CUBIC }}
            >
              <span>'{removed.doc.name}'을 삭제했어요</span>
              <button type="button" onClick={undo}>
                되돌리기
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
