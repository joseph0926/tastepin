import type { SpecimenProps } from "../types";
import "./Blog.css";

const messages = [
  {
    from: "user",
    name: "나",
    text: "필터를 바꾸면 목록이 두 번 갱신됩니다. 검색 조건을 어디에 두는 게 좋을까요?",
  },
  {
    from: "assistant",
    name: "AI",
    text: "주소와 컴포넌트가 각각 조건을 갖고 있는지 확인해 보세요. 주소를 기준으로 삼으면 뒤로 가기와 링크 공유에서도 같은 결과를 보여 줄 수 있습니다.",
  },
  {
    from: "user",
    name: "나",
    text: "입력 중인 검색어까지 바로 주소에 넣으면 한 글자마다 이동하지 않나요?",
  },
  {
    from: "assistant",
    name: "AI",
    text: "입력 중인 값과 확정한 검색 조건은 역할이 다릅니다. 입력값은 검색창에 두고, 검색을 실행할 때 주소를 갱신하는 방법을 비교해 보세요.",
  },
];

export default function Conversation({ params }: SpecimenProps) {
  return (
    <article className="blog-sample">
      <h3>조건의 주인을 정하기까지</h3>
      <p>구현을 바꾸기 전에 나눈 대화입니다.</p>
      <ol
        className="conversation-sample"
        aria-label="검색 조건에 관한 대화"
        data-align={params.align}
        data-look={params.look}
        data-width={params.width}
      >
        {messages.map((message, index) => (
          <li key={index} data-from={message.from}>
            <span className="conversation-author">{message.name}</span>
            <p>{message.text}</p>
          </li>
        ))}
      </ol>
      <p>이후 주소에는 확정한 조건만 남겼습니다.</p>
    </article>
  );
}
