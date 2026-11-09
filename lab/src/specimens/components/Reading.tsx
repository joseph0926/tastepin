import type { SpecimenProps } from "../types";
import "./Reading.css";
import "./Blog.css";

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

// 긴 글의 폭과 단락 간격은 일반 UI의 전역 글 취향과 별도로 평가한다.
export function BlogReading({ params }: SpecimenProps) {
  return (
    <div
      className="blog-sample article-reading"
      data-width={params.width}
      data-paragraph={params.paragraph}
    >
      <div
        className="article-reading-scroll"
        role="region"
        aria-label="긴 기술 글 읽기 비교"
        tabIndex={0}
      >
        <article>
          <h3>검색 조건의 주인은 어디에 있어야 할까?</h3>
          <p>
            검색창에 글자를 입력하고 주제를 고른 뒤 다른 글을 읽었습니다. 뒤로
            돌아오니 검색창에는 이전 글자가 남아 있는데 목록은 전체 글을 보여
            주었습니다.
          </p>
          <p>
            주소와 화면이 각각 검색 조건을 기억하고 있었습니다. 한쪽만 바뀌면
            독자가 보는 입력값과 실제 요청에 쓰인 값이 달라졌습니다.
          </p>
          <h4>입력과 확정을 나누기</h4>
          <p>
            입력 중인 값은 아직 목록을 바꾸지 않습니다. 검색을 실행하면 그때의
            값을 주소에 반영하고, 목록은 주소에서 읽은 조건으로 갱신합니다.
          </p>
          <pre>
            <code>
              {
                "const query = input.trim();\nrouter.push(`/blog?q=${encodeURIComponent(query)}`);"
              }
            </code>
          </pre>
          <p>
            이 흐름에서는 새 창에서 링크를 열어도 같은 조건을 읽습니다. 검색
            버튼과 뒤로 가기가 서로 다른 상태를 복원하지 않게 됩니다.
          </p>
          <div
            className="article-reading-table"
            tabIndex={0}
            role="region"
            aria-label="검색 상태의 소유자 비교"
          >
            <table>
              <caption>각 값이 바뀌는 시점</caption>
              <thead>
                <tr>
                  <th>값</th>
                  <th>보관하는 곳</th>
                  <th>바뀌는 시점</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>입력 중인 글자</td>
                  <td>검색창</td>
                  <td>타이핑할 때</td>
                </tr>
                <tr>
                  <td>확정한 조건</td>
                  <td>주소</td>
                  <td>검색할 때</td>
                </tr>
                <tr>
                  <td>표시할 목록</td>
                  <td>조회 결과</td>
                  <td>조건이 바뀔 때</td>
                </tr>
              </tbody>
            </table>
          </div>
          <h4>다시 열어 확인하기</h4>
          <p>
            조건을 바꾼 뒤 링크를 복사해 새 창에서 열었습니다. 새로고침과 뒤로
            가기에서도 같은 목록이 보이는지 확인했습니다.
          </p>
          <p>
            검사는 값을 두 군데에 썼는지가 아니라 독자가 같은 조건으로 같은
            결과를 다시 볼 수 있는지를 기준으로 삼았습니다.
          </p>
        </article>
      </div>
    </div>
  );
}
