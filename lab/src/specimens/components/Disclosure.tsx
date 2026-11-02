import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Disclosure.css";

// params: height(glide | instant), reveal(rise | fade | none), marker(chevron | plus | caret), multiple(many | single)

const payments = [
  {
    id: "plan",
    title: "10월 정기 결제",
    amount: "49,000원",
    rows: [
      ["결제 수단", "법인카드 끝자리 4021"],
      ["청구 기간", "10월 1일부터 10월 31일까지"],
      ["포함 좌석", "기본 5석"],
    ],
  },
  {
    id: "seats",
    title: "좌석 추가 3석",
    amount: "27,000원",
    rows: [
      ["추가한 사람", "김하늘"],
      ["일할 계산", "10월 12일부터 20일분"],
    ],
  },
  {
    id: "refund",
    title: "중복 결제 환불",
    amount: "-9,000원",
    rows: [
      ["사유", "같은 좌석을 두 번 결제"],
      ["환불 예정일", "10월 18일"],
      ["처리 담당", "결제 지원팀"],
    ],
  },
];

// 시연 순서: 첫 항목 열기, 둘째 열기, 첫 항목 닫기, 둘째 닫기.
// 하나만 열림(single)에서는 같은 순서가 첫째와 둘째를 번갈아 열며 열린 항목을 닫는다
const demoSteps = ["plan", "seats", "plan", "seats"];

function Marker({ kind, open }: { kind: string; open: boolean }) {
  const seconds = useSeconds();
  const turn = {
    duration: seconds(kind === "caret" ? 160 : 200),
    ease: EASE_OUT,
  };

  if (kind === "plus") {
    return (
      <span className="dsc-plus" aria-hidden="true">
        <span />
        <motion.span animate={{ scaleY: open ? 0 : 1 }} transition={turn} />
      </span>
    );
  }
  if (kind === "caret") {
    return (
      <motion.svg
        className="dsc-caret"
        viewBox="0 0 10 10"
        aria-hidden="true"
        animate={{ rotate: open ? 90 : 0 }}
        transition={turn}
      >
        <path d="M3 1.5 7.5 5 3 8.5Z" />
      </motion.svg>
    );
  }
  return (
    <motion.span
      className="dsc-chevron"
      aria-hidden="true"
      animate={{ rotate: open ? 180 : 0 }}
      transition={turn}
    >
      <ChevronDown size={18} strokeWidth={1.75} />
    </motion.span>
  );
}

function revealMotion(reveal: string, seconds: (ms: number) => number) {
  if (reveal === "rise") {
    return {
      initial: { opacity: 0, y: 4 },
      animate: {
        opacity: 1,
        y: 0,
        transition: {
          duration: seconds(160),
          delay: seconds(40),
          ease: EASE_OUT,
        },
      },
      exit: {
        opacity: 0,
        y: 4,
        transition: { duration: seconds(160), ease: EASE_OUT },
      },
    };
  }
  if (reveal === "fade") {
    return {
      initial: { opacity: 0 },
      animate: {
        opacity: 1,
        transition: { duration: seconds(160), ease: EASE_OUT },
      },
      exit: {
        opacity: 0,
        transition: { duration: seconds(160), ease: EASE_OUT },
      },
    };
  }
  return {};
}

export default function Disclosure({ params }: SpecimenProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const seconds = useSeconds();
  const baseId = useId();
  const glide = params.height === "glide";
  const marker = params.marker;

  const single = params.multiple === "single";

  const toggle = (id: string) =>
    setOpen((current) => {
      if (current.has(id)) {
        const next = new Set(current);
        next.delete(id);
        return next;
      }
      return single ? new Set([id]) : new Set(current).add(id);
    });

  useDemo((tick) => toggle(demoSteps[(tick - 1) % demoSteps.length]));

  return (
    <div className="dsc">
      <h3 className="dsc-heading">결제 내역</h3>
      <ul className="dsc-list">
        {payments.map((payment) => {
          const isOpen = open.has(payment.id);
          const panelId = `${baseId}-${payment.id}`;
          return (
            <li key={payment.id} className="dsc-item">
              <button
                type="button"
                className={`dsc-trigger marker-${marker}`}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(payment.id)}
              >
                {marker === "caret" && <Marker kind="caret" open={isOpen} />}
                <span className="dsc-title">{payment.title}</span>
                <span className="dsc-amount">{payment.amount}</span>
                {marker !== "caret" && <Marker kind={marker} open={isOpen} />}
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="panel"
                    id={panelId}
                    className="dsc-panel"
                    initial={{ height: 0 }}
                    animate={{
                      height: "auto",
                      transition: {
                        duration: glide ? seconds(220) : 0,
                        ease: EASE_OUT,
                      },
                    }}
                    exit={{
                      height: 0,
                      transition: {
                        duration: glide ? seconds(220) : 0,
                        ease: EASE_OUT,
                      },
                    }}
                  >
                    <motion.dl
                      className="dsc-body"
                      {...revealMotion(params.reveal, seconds)}
                    >
                      {payment.rows.map(([term, value]) => (
                        <div key={term}>
                          <dt>{term}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </motion.dl>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <p className="dsc-memo">
        <strong>메모</strong>
        다음 결제일은 11월 1일입니다. 좌석을 줄이면 다음 달부터 반영됩니다.
      </p>
    </div>
  );
}
