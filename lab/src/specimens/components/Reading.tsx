import type { SpecimenProps } from "../types";
import "./Reading.css";

// params: body(tight | regular | airy), density(compact | regular | spacious), heading(scale | weight | serif),
// face(noto | pretendard | suit), titleweight(heavy | bold | semibold). titleweight는 heading이 weight일 때만 쓴다
// 컴포넌트 하나가 아니라 화면 전체의 글과 간격 값을 비교하는 전역 시편이다. 움직임은 없다.

const changes = [
  { title: "표 컴포넌트에 열 고정을 더했어요", meta: "이도윤, 2시간 전" },
  { title: "다크 모드 보조 글자색 대비를 올렸어요", meta: "최민준, 어제" },
  { title: "버튼 크기 토큰을 세 단계로 줄였어요", meta: "박서윤, 3일 전" },
  { title: "아이콘 32개를 새 선 굵기로 바꿨어요", meta: "정하은, 4일 전" },
];

export default function Reading({ params }: SpecimenProps) {
  const { body, density, heading, face, titleweight } = params;

  return (
    <article
      className="rdg"
      data-body={body}
      data-density={density}
      data-heading={heading}
      data-face={face}
      data-titleweight={heading === "weight" ? titleweight : undefined}
    >
      <header className="rdg-head">
        <h3>10월 둘째 주 릴리스 노트</h3>
        <p className="rdg-meta">2026년 10월 13일, 디자인 시스템팀</p>
      </header>

      <p className="rdg-body">
        이번 주에는 표와 버튼처럼 자주 쓰는 컴포넌트를 정리했습니다. 표는 가로로
        길어질 때 첫 열을 고정할 수 있고, 버튼은 크기 단계를 줄여 화면 사이의
        높이가 맞춰집니다.
      </p>
      <p className="rdg-body">
        다크 모드에서 보조 글자가 흐리게 보인다는 의견이 있어 대비를 다시
        쟀습니다. 바뀐 값은 모든 화면에 자동으로 반영되며, 직접 지정한 색은
        그대로 둡니다.
      </p>

      <section>
        <h4>이번 주 변경</h4>
        <ul className="rdg-list">
          {changes.map((change) => (
            <li key={change.title}>
              <span className="rdg-item-title">{change.title}</span>
              <span className="rdg-meta">{change.meta}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
