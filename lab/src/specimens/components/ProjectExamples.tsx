export const projects = [
  {
    id: "design",
    name: "디자인 시스템 정리",
    owner: "박서윤",
    status: "진행 중",
    due: "11월 20일",
    progress: "65%",
    budget: "240만 원",
    description:
      "버튼과 입력 필드의 공통 규칙을 정리하고 사용 예제를 보완합니다.",
  },
  {
    id: "guide",
    name: "신규 입사자 안내",
    owner: "최민준",
    status: "검토 중",
    due: "11월 18일",
    progress: "90%",
    budget: "80만 원",
    description: "첫 주에 필요한 계정과 업무 안내를 한곳에 모읍니다.",
  },
  {
    id: "report",
    name: "분기 보고서",
    owner: "정하은",
    status: "진행 중",
    due: "11월 25일",
    progress: "40%",
    budget: "120만 원",
    description: "이번 분기의 진행 상황과 다음 분기 계획을 정리합니다.",
  },
  {
    id: "interview",
    name: "고객 인터뷰",
    owner: "이도윤",
    status: "예정",
    due: "12월 2일",
    progress: "10%",
    budget: "160만 원",
    description: "최근 가입한 사용자를 만나 첫 사용 과정의 어려움을 듣습니다.",
  },
  {
    id: "release",
    name: "릴리스 노트",
    owner: "김지민",
    status: "완료",
    due: "11월 12일",
    progress: "100%",
    budget: "40만 원",
    description: "바뀐 기능과 해결한 문제를 사용자가 읽을 말로 정리합니다.",
  },
  {
    id: "budget",
    name: "다음 달 예산안",
    owner: "서지안",
    status: "검토 중",
    due: "11월 28일",
    progress: "80%",
    budget: "320만 원",
    description: "팀별 비용을 모으고 우선순위에 따라 예산을 배분합니다.",
  },
];

export type Project = (typeof projects)[number];

export function ProjectFacts({ project }: { project: Project }) {
  return (
    <dl className="sx-facts">
      <div>
        <dt>담당자</dt>
        <dd>{project.owner}</dd>
      </div>
      <div>
        <dt>상태</dt>
        <dd>{project.status}</dd>
      </div>
      <div>
        <dt>마감</dt>
        <dd>{project.due}</dd>
      </div>
      <div>
        <dt>진행률</dt>
        <dd>{project.progress}</dd>
      </div>
      <div>
        <dt>예산</dt>
        <dd>{project.budget}</dd>
      </div>
    </dl>
  );
}
