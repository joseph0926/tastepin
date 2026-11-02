import type { Comparison, Conditions, LabState, Outcome } from "./types";

// vite.config.ts가 /taste-api를 취향 원장 서버(127.0.0.1:4870)의 /api로 넘긴다
const BASE = "/taste-api/lab";

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    BASE + path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload === null) {
    throw new Error(payload?.error ?? "취향 원장 서버에 연결하지 못했어요");
  }
  return payload as T;
}

export type View = Pick<Conditions, "theme" | "frame">;

// 보고 있는 테마와 폭을 같이 보내면 원장이 연 컴포넌트를 그 조건에서 다시 묻는다
export function fetchState(requested: string, view: View) {
  const query = new URLSearchParams({ c: requested, ...view });
  return request<LabState>(`/state?${query}`);
}

export interface JudgmentInput {
  comparison: Comparison;
  shown: string[];
  outcome: Outcome;
  choice: string | null;
  note: string;
  conditions: Conditions;
  requested: string;
}

export function sendJudgment({ comparison, ...rest }: JudgmentInput) {
  return request<{ judgment: { id: string }; state: LabState }>("/judge", {
    component: comparison.component,
    dimension: comparison.dimension,
    options: comparison.options,
    params: comparison.params,
    ...rest,
  });
}

export function undoJudgment(id: string, requested: string, view: View) {
  return request<{ state: LabState }>("/undo", { id, requested, view });
}
