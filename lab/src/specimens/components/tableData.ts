// 표와 데이터 테이블 시편이 함께 쓰는 예시 정산 내역
export interface Payout {
  id: string;
  partner: string;
  date: string;
  team: string;
  amount: number;
}

export type SortKey = "partner" | "date" | "amount";
export interface Sort {
  key: SortKey;
  dir: "asc" | "desc";
}

export const payouts: Payout[] = [
  {
    id: "p1",
    partner: "한빛 인쇄",
    date: "2026-10-02",
    team: "운영",
    amount: 482000,
  },
  {
    id: "p2",
    partner: "누리 케이터링",
    date: "2026-10-05",
    team: "총무",
    amount: 1260000,
  },
  {
    id: "p3",
    partner: "가온 디자인",
    date: "2026-10-07",
    team: "디자인",
    amount: 3300000,
  },
  {
    id: "p4",
    partner: "바른 세무",
    date: "2026-10-09",
    team: "재무",
    amount: 880000,
  },
  {
    id: "p5",
    partner: "다솜 청소",
    date: "2026-10-12",
    team: "총무",
    amount: 360000,
  },
  {
    id: "p6",
    partner: "새벽 물류",
    date: "2026-10-14",
    team: "운영",
    amount: 2150000,
  },
  {
    id: "p7",
    partner: "온결 번역",
    date: "2026-10-15",
    team: "마케팅",
    amount: 540000,
  },
  {
    id: "p8",
    partner: "라온 영상",
    date: "2026-10-16",
    team: "마케팅",
    amount: 1980000,
  },
  {
    id: "p9",
    partner: "도담 법률",
    date: "2026-10-17",
    team: "재무",
    amount: 1100000,
  },
  {
    id: "p10",
    partner: "미르 조경",
    date: "2026-10-18",
    team: "총무",
    amount: 720000,
  },
];

export const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "partner", label: "거래처" },
  { key: "date", label: "날짜" },
  { key: "amount", label: "금액", numeric: true },
];

export function sorted(rows: Payout[], sort: Sort) {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[sort.key];
    const y = b[sort.key];
    return (
      (typeof x === "number"
        ? x - (y as number)
        : String(x).localeCompare(String(y), "ko")) * sign
    );
  });
}

export const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
export const shortDate = (date: string) =>
  `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`;

// 같은 열을 다시 누르면 방향을 바꾸고, 다른 열은 처음 누를 때 숫자와 날짜는 내림, 글자는 오름으로 정렬한다
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key)
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "partner" ? "asc" : "desc" };
}
