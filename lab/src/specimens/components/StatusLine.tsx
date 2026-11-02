import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./StatusLine.css";

// params: place(reserve | beside | overlay), enter(fade | rise | none), dwell(stay | timed | settle)
// 어느 값이든 문구가 나타나고 바뀌고 사라질 때 아래 목록은 움직이지 않는다. 비교하는 것은 그 자리를 어떻게 마련하느냐다.

const files = [
  { id: "brief", name: "기획 초안.pdf", size: "2.4MB" },
  { id: "notes", name: "회의록 10월 12일.docx", size: "180KB" },
  { id: "shots", name: "화면 캡처 모음.zip", size: "18.2MB" },
  { id: "terms", name: "용어 정리.xlsx", size: "96KB" },
];
const TIMED_MS = 4000;
const SETTLE_MS = 2000;

// 시연 순서: 하나 선택, 둘 선택, 다운로드, 문구가 머무는 동안 지켜보기 4번. 다음 바퀴의 첫 선택이 문구를 지운다
const DEMO_SELECTIONS = [["brief"], ["brief", "shots"]];
const DEMO_DOWNLOAD_STEP = 2;
// registry.ts의 demoSteps와 같아야 한다
const DEMO_STEPS = 7;

interface Message {
  id: number;
  count: number;
}

export default function StatusLine({ params }: SpecimenProps) {
  const [selected, setSelected] = useState<string[]>(["brief", "shots"]);
  const [message, setMessage] = useState<Message | null>(null);
  const [settled, setSettled] = useState(false);
  const nextId = useRef(1);
  const seconds = useSeconds();
  const { place, enter, dwell } = params;

  const select = (ids: string[]) => {
    setSelected(ids);
    // 선택을 바꾸면 방금 문구는 더 이상 지금 상태를 설명하지 않는다
    setMessage(null);
  };

  const download = () => {
    if (selected.length === 0) return;
    setSettled(false);
    setMessage({ id: nextId.current++, count: selected.length });
  };

  useDemo((tick) => {
    const step = (tick - 1) % DEMO_STEPS;
    if (step < DEMO_SELECTIONS.length) select(DEMO_SELECTIONS[step]);
    if (step === DEMO_DOWNLOAD_STEP) download();
  });

  const messageId = message?.id;
  useEffect(() => {
    if (messageId === undefined || dwell === "stay") return;
    const timer = window.setTimeout(
      () => (dwell === "timed" ? setMessage(null) : setSettled(true)),
      seconds(dwell === "timed" ? TIMED_MS : SETTLE_MS) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [messageId, dwell, seconds]);

  // 사라질 때는 나타난 길을 같은 길이로 되돌아간다
  const hidden = enter === "rise" ? { opacity: 0, y: 4 } : { opacity: 0, y: 0 };
  const timing = {
    duration: enter === "none" ? 0 : seconds(160),
    ease: EASE_OUT,
  };

  const status = (
    <div className="sts-slot" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {message && (
          <motion.p
            key={message.id}
            className="sts-message"
            initial={hidden}
            animate={{ opacity: 1, y: 0 }}
            exit={hidden}
            transition={timing}
          >
            <motion.span
              className="sts-icon"
              aria-hidden="true"
              initial={false}
              animate={{ opacity: settled ? 0 : 1 }}
              transition={{ duration: seconds(200), ease: EASE_OUT }}
            >
              <Check size={16} strokeWidth={2} />
            </motion.span>
            <motion.span
              className="sts-text"
              initial={false}
              animate={{ opacity: settled ? 0.6 : 1 }}
              transition={{ duration: seconds(200), ease: EASE_OUT }}
            >
              파일 {message.count}개를 다운로드했어요
            </motion.span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );

  const toggle = (id: string) =>
    select(
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id],
    );

  return (
    <div className="sts-page" data-place={place}>
      <div className="sts-toolbar">
        <div className="sts-actions">
          <button
            type="button"
            className="sts-download"
            disabled={selected.length === 0}
            onClick={download}
          >
            다운로드
          </button>
          {place === "beside" && status}
          {place === "overlay" && status}
        </div>
        {place === "reserve" && status}
      </div>

      <ul className="sts-files">
        {files.map((file) => (
          <li key={file.id}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(file.id)}
                onChange={() => toggle(file.id)}
              />
              <span className="sts-name">{file.name}</span>
              <span className="sts-size">{file.size}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
