import type { CSSProperties } from "react";
import { Bell, ChevronRight, Globe, Lock, Moon, User } from "lucide-react";
import type { SpecimenProps } from "../types";
import "./Phone.css";

// params: gutter(g16 | g20 | g24), body(b15 | b16 | b17), row(r44 | r52 | r60)
// 휴대폰 화면 하나에 좌우 여백, 본문 글자, 누르는 목록 행 높이를 함께 그린다. 움직임이 없어 같이 재생을 숨긴다.

const gutters: Record<string, number> = { g16: 16, g20: 20, g24: 24 };
const bodies: Record<string, [number, number]> = {
  b15: [15, 1.55],
  b16: [16, 1.6],
  b17: [17, 1.65],
};
const rows: Record<string, number> = { r44: 44, r52: 52, r60: 60 };

const sections = [
  {
    title: "알림",
    items: [
      { label: "새 댓글", value: "켜짐", Icon: Bell },
      { label: "방해 금지 시간", value: "오후 10시부터", Icon: Moon },
    ],
  },
  {
    title: "계정",
    items: [
      { label: "프로필", value: "김하늘", Icon: User },
      { label: "비밀번호", value: "", Icon: Lock },
      { label: "언어", value: "한국어", Icon: Globe },
    ],
  },
];

export default function MobilePage({ params }: SpecimenProps) {
  const [size, leading] = bodies[params.body] ?? bodies.b15;
  const style = {
    "--ppg-gutter": `${gutters[params.gutter] ?? 16}px`,
    "--ppg-row": `${rows[params.row] ?? 44}px`,
    fontSize: `${size}px`,
    lineHeight: leading,
  } as CSSProperties;

  return (
    <div className="ph-frame" style={style}>
      <div className="ph-head">
        <h3>설정</h3>
      </div>
      <div className="ph-body ppg-body">
        <p className="ppg-intro">
          알림과 계정 정보를 바꿀 수 있어요. 바꾼 내용은 다른 기기에도 바로
          반영돼요.
        </p>
        {sections.map((section) => (
          <section key={section.title} aria-label={section.title}>
            <h4 className="ppg-section">{section.title}</h4>
            <ul className="ppg-rows">
              {section.items.map(({ label, value, Icon }) => (
                <li key={label}>
                  <button type="button" className="ppg-row">
                    <Icon size={18} strokeWidth={1.75} aria-hidden />
                    <span className="ppg-row-inner">
                      <b>{label}</b>
                      {value && <span>{value}</span>}
                      <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
