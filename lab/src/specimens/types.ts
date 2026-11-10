import catalogJson from "./catalog.json";

export interface CatalogValue {
  id: string;
  label: string;
  spec: string;
  // 에이전트에게 보일 짧은 설명. 다른 차원이 덮은 숫자나 비교 맥락이 spec에 있을 때만 둔다.
  // spec은 판정 스냅숏과 재확인 계산의 기준이라 고치지 않는다
  brief?: string;
  // 고르면 taste.py tokens가 CSS 변수, Tailwind 테마, Motion 프리셋으로 내보낼 값. 한 차원의 값들은 같은 이름을 쓴다
  tokens?: Record<string, string>;
}

export interface CatalogDimension {
  id: string;
  label: string;
  question: string;
  requires?: Record<string, string[]>;
  // 이 차원이 컴포넌트의 곡선과 길이를 직접 비교한다. 고르면 원장 주입이 기초 취향의 곡선보다 이 값을 앞세운다
  curve?: boolean;
  values: CatalogValue[];
}

export interface CatalogComponent {
  id: string;
  label: string;
  // global이면 요청에 컴포넌트가 나오지 않아도 화면 작업마다 전역 취향과 함께 주입된다
  scope?: "global";
  // 전역 시편이 시각 요청과 모션 요청 중 어디에 들어가는지
  axis?: "visual" | "motion";
  // phone이면 시편이 무대 안에 휴대폰 화면을 직접 그린다. 원장은 평가 화면의 폭(M)과 관계없이 휴대폰에서 본 판정으로 센다
  frame?: "phone";
  // 화면 조합은 두 시안을 한 줄씩 충분한 폭으로 비교한다.
  layout?: "screen";
  file: string;
  aliases: string[];
  dimensions: CatalogDimension[];
}

// taste의 tastelib/lab.py가 같은 파일을 읽어 검증하므로 여기서는 모양만 선언한다
export const catalog = catalogJson as {
  version: number;
  components: CatalogComponent[];
};

export type Params = Record<string, string>;

export interface SpecimenProps {
  params: Params;
}

export type PreferenceStatus =
  "미평가" | "관찰" | "확정" | "무관" | "새 값 필요" | "해당 없음";

export interface PreferenceCore {
  status: PreferenceStatus;
  // 고른 값의 구현 설명이 마지막으로 고를 때와 달라져 다시 묻는 중이다
  changed: boolean;
  value: string;
  // 다음 비교에 보일 값. "다 별로" 뒤에는 그 뒤에 더한 값만 담긴다
  offer: string[];
  chosen: number;
  judged: number;
  last: string | null;
  notes: string[];
}

export interface Preference extends PreferenceCore {
  // 처음 확정될 때까지 고른 테마와 폭. 이 밖의 조건에서 고른 판정은 variants로 따로 센다
  conditions: { theme: string[]; frame: string[] };
  // 재확인 조건("mobile", "light", "light+mobile")별 선호
  variants: Record<string, PreferenceCore>;
}

export interface Comparison {
  component: string;
  dimension: string;
  options: string[];
  params: Params;
  // 확정한 값을 기준 밖의 조건에서 다시 묻는 비교. base는 기준 조건에서 고른 값이다
  recheck?: { key: string; label: string; base: string };
}

export interface ComponentState {
  id: string;
  label: string;
  // lab.py가 전역 시편이면 "global", 컴포넌트 시편이면 빈 문자열로 보낸다
  scope: string;
  demand: number;
  judged: number;
  preferences: Record<string, Preference>;
  params: Params;
  next: Comparison | null;
}

export interface LabState {
  components: ComponentState[];
  queue: Comparison[];
}

export type Outcome = "chose" | "same" | "none";

export interface Conditions {
  theme: "light" | "dark";
  frame: "desktop" | "mobile";
  slow: boolean;
}
