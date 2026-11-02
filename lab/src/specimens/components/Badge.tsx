import type { SpecimenProps } from "../types";
import "./Badge.css";

// params: surface(tint | outline | dot), shape(small | pill | square), color(state | mono | focus), code(badge | mono | prefix)
// 움직임이 없는 시편이다. 같은 목록 행에 상태 배지, 분류 태그, 식별 번호를 함께 두어 서로의 위계를 비교한다.

type Tone = "done" | "pending" | "rejected";

const documents: {
  title: string;
  code: [string, string];
  status: [Tone, string];
  tags: string[];
}[] = [
  {
    title: "지하 주차장 배수 공사 계약서",
    code: ["P", "9247586-13"],
    status: ["pending", "검토 중"],
    tags: ["계약", "시설"],
  },
  {
    title: "10월 협력사 정산 내역",
    code: ["S", "3318204-02"],
    status: ["done", "완료"],
    tags: ["정산"],
  },
  {
    title: "출입 카드 재발급 신청",
    code: ["R", "7710395-08"],
    status: ["rejected", "반려"],
    tags: ["보안", "인사"],
  },
];

export default function Badge({ params }: SpecimenProps) {
  const { surface, shape, color, code } = params;

  return (
    <div
      className="bdg-page"
      data-surface={surface}
      data-shape={shape}
      data-color={color}
      data-code={code}
    >
      <header className="bdg-head">
        <h3>결재 문서</h3>
        <p>이번 주에 올라온 문서 3건</p>
      </header>

      <ul className="bdg-list">
        {documents.map((document) => (
          <li key={document.code[1]}>
            <div className="bdg-title-line">
              <b>{document.title}</b>
              <span
                className={`bdg-badge bdg-status tone-${document.status[0]}`}
              >
                {surface === "dot" && (
                  <span className="bdg-dot" aria-hidden="true" />
                )}
                {document.status[1]}
              </span>
            </div>
            <div className="bdg-meta">
              <span
                className={code === "badge" ? "bdg-badge bdg-code" : "bdg-code"}
              >
                <span className="bdg-code-prefix">{document.code[0]}</span>
                <span className="bdg-code-number">{document.code[1]}</span>
              </span>
              {document.tags.map((tag) => (
                <span key={tag} className="bdg-badge bdg-tag">
                  {tag}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
