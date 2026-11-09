import { useId, useRef } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import "./Blog.css";

export default function ArticleAside({ params }: SpecimenProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const headingId = useId();

  useDemo((tick) => {
    if (detailsRef.current) detailsRef.current.open = tick % 2 === 1;
  });

  return (
    <article
      className="blog-sample aside-sample"
      data-quote={params.quote}
      data-tone={params.tone}
    >
      <h3>상태를 한 곳에 모으는 이유</h3>
      <p>
        검색 조건이 여러 곳에 있으면 같은 동작에도 다른 결과가 나올 수 있습니다.
        기준을 정하면 어느 값을 고쳐야 하는지도 분명해집니다.
      </p>
      <blockquote>
        <p>같은 조건으로 들어왔다면 같은 목록을 보여 주어야 한다.</p>
        <cite>구현 전 적어 둔 기준</cite>
      </blockquote>
      <p>
        주소를 기준으로 삼으면 새로고침과 뒤로 가기에서도 조건을 복원할 수
        있습니다.
      </p>
      {params.supplement === "fold" ? (
        <details ref={detailsRef} className="article-supplement">
          <summary>입력 중인 값은 어디에 두나요?</summary>
          <p>
            아직 검색하지 않은 글자는 입력창에 남깁니다. 검색을 실행한 순간의
            값만 주소에 반영하면 입력과 탐색의 역할을 나눌 수 있습니다.
          </p>
        </details>
      ) : (
        <aside className="article-supplement" aria-labelledby={headingId}>
          <h4 id={headingId}>입력 중인 값은 어디에 두나요?</h4>
          <p>
            아직 검색하지 않은 글자는 입력창에 남깁니다. 검색을 실행한 순간의
            값만 주소에 반영하면 입력과 탐색의 역할을 나눌 수 있습니다.
          </p>
        </aside>
      )}
      <p>이 구분을 바탕으로 검색과 필터를 같은 흐름으로 처리했습니다.</p>
    </article>
  );
}
