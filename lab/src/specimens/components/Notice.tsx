import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, type Transition } from "motion/react";
import { CircleAlert, Info, X } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Notice.css";

// params: look(tint | plain | outline), place(top | item), tone(neutral | color | icon), dismiss(close | none | ack)
// 안내문은 처음부터 보이고, 사라질 때만 높이가 접힌다. 나타나며 아래를 미는 장면은 비교하지 않는다.
// 같이 재생은 카드 바꾸기(주의 안내가 풀림), 일반 안내 닫기, 처음으로를 한다. 닫기 없음이면 일반 안내는 남는다.

type Kind = "warning" | "info";

const CARD = {
  old: { label: "신한카드 ···· 1234", expires: "2026년 12월 만료" },
  renewed: { label: "신한카드 ···· 5678", expires: "2030년 3월 만료" },
};

export default function Notice({ params }: SpecimenProps) {
  const [renewed, setRenewed] = useState(false);
  const [infoClosed, setInfoClosed] = useState(false);
  const [warningClosed, setWarningClosed] = useState(false);
  const seconds = useSeconds();
  const { look, place, tone, dismiss } = params;
  const fold = { duration: seconds(200), ease: EASE_OUT };
  const card = renewed ? CARD.renewed : CARD.old;
  const showWarning = !renewed && !warningClosed;

  const renew = () => setRenewed(true);

  useDemo((tick) => {
    const step = (tick - 1) % 3;
    if (step === 0) renew();
    if (step === 1 && dismiss !== "none") setInfoClosed(true);
    if (step === 2) {
      setRenewed(false);
      setInfoClosed(false);
      setWarningClosed(false);
    }
  });

  const warning = (
    <Fold key="warning" show={showWarning} transition={fold}>
      <Message
        kind="warning"
        look={look}
        tone={tone}
        dismiss={dismiss}
        onDismiss={() => setWarningClosed(true)}
        action={
          <button type="button" className="ntc-action" onClick={renew}>
            카드 바꾸기
          </button>
        }
      >
        이 카드는 12월에 만료돼요. 1월 결제 전에 바꿔 주세요.
      </Message>
    </Fold>
  );

  return (
    <div className="ntc-page">
      <h3>결제 설정</h3>

      <section className="ntc-section">
        <h4>결제 수단</h4>
        {place === "top" && warning}
        <div className="ntc-row">
          <span className="ntc-row-text">
            <b>{card.label}</b>
            <span>{card.expires}</span>
          </span>
          <button type="button" className="ntc-link" onClick={renew}>
            변경
          </button>
        </div>
        {place === "item" && warning}
      </section>

      <section className="ntc-section">
        <h4>청구서</h4>
        {place === "top" && (
          <InfoNotice
            show={!infoClosed}
            look={look}
            tone={tone}
            dismiss={dismiss}
            transition={fold}
            onDismiss={() => setInfoClosed(true)}
          />
        )}
        <div className="ntc-row">
          <span className="ntc-row-text">
            <b>받는 이메일</b>
            <span>billing@team.kr</span>
          </span>
          <button type="button" className="ntc-link">
            변경
          </button>
        </div>
        {place === "item" && (
          <InfoNotice
            show={!infoClosed}
            look={look}
            tone={tone}
            dismiss={dismiss}
            transition={fold}
            onDismiss={() => setInfoClosed(true)}
          />
        )}
      </section>
    </div>
  );
}

function InfoNotice({
  show,
  look,
  tone,
  dismiss,
  transition,
  onDismiss,
}: {
  show: boolean;
  look: string;
  tone: string;
  dismiss: string;
  transition: Transition;
  onDismiss: () => void;
}) {
  return (
    <Fold show={show} transition={transition}>
      <Message
        kind="info"
        look={look}
        tone={tone}
        dismiss={dismiss}
        onDismiss={onDismiss}
      >
        이메일을 바꾸면 다음 달 청구서부터 새 주소로 보내요.
      </Message>
    </Fold>
  );
}

function Message({
  kind,
  look,
  tone,
  dismiss,
  onDismiss,
  action,
  children,
}: {
  kind: Kind;
  look: string;
  tone: string;
  dismiss: string;
  onDismiss: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  const Icon = kind === "warning" ? CircleAlert : Info;
  // 주의 안내는 바로 알려야 하므로 alert, 일반 안내는 status로 읽힌다
  const role = kind === "warning" ? "alert" : "status";

  return (
    <div
      className="ntc"
      role={role}
      data-kind={kind}
      data-look={look}
      data-tone={tone}
    >
      <Icon className="ntc-icon" size={16} strokeWidth={2} aria-hidden="true" />
      <p className="ntc-text">
        {children}
        {action}
        {dismiss === "ack" && (
          <button type="button" className="ntc-action" onClick={onDismiss}>
            확인
          </button>
        )}
      </p>
      {dismiss === "close" && (
        <button
          type="button"
          className="ntc-close"
          aria-label="안내 닫기"
          onClick={onDismiss}
        >
          <X size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

// 사라질 때 높이를 접는다. 처음 그릴 때는 펼친 채로 두어 나타나며 아래를 밀지 않는다
function Fold({
  show,
  transition,
  children,
}: {
  show: boolean;
  transition: Transition;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          className="ntc-fold"
          initial={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={transition}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
