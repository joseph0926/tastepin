import { useEffect, useRef } from "react";
import { animate, type AnimationPlaybackControls } from "motion/react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./ListRow.css";

// params: lines(one | two | three), meta(badge | text | none), group(flat | header | sticky)
// 같이 재생은 목록 영역을 한 번 내림, 한 번 더 내림, 맨 위로를 한다. 머리글 고정은 CSS sticky라 손으로 스크롤해도 같다.

const statuses = {
  received: "접수",
  progress: "진행 중",
  done: "완료",
} as const;

type Period = "thisWeek" | "lastWeek" | "earlier";

interface Report {
  id: number;
  title: string;
  summary: string;
  date: string;
  author: string;
  status: keyof typeof statuses;
  category: string;
  period: Period;
}

// 최신순이다. 묶지 않음은 이 순서를 그대로 쓴다
const reports: Report[] = [
  {
    id: 1,
    title: "시장 앞 버스 정류장 안내 화면이 꺼져 있어요",
    summary:
      "사흘째 화면이 켜지지 않아 도착 시간을 알 수 없습니다. 전원 문제인지 통신 문제인지 확인 부탁드립니다.",
    date: "2026-11-05",
    author: "이서준",
    status: "received",
    category: "교통",
    period: "thisWeek",
  },
  {
    id: 2,
    title: "놀이터 그네 줄 교체",
    summary:
      "그네 줄이 닳아 보풀이 일어나 있습니다. 아이들이 많이 타는 곳이라 빨리 바꿔 주셨으면 합니다.",
    date: "2026-11-04",
    author: "박지민",
    status: "progress",
    category: "안전",
    period: "thisWeek",
  },
  {
    id: 3,
    title: "분리수거장 주변 무단 투기",
    summary:
      "주말마다 큰 봉투가 쌓여 냄새가 납니다. 안내문을 붙이거나 수거 횟수를 늘릴 수 있을까요?",
    date: "2026-11-03",
    author: "최유진",
    status: "progress",
    category: "환경",
    period: "thisWeek",
  },
  {
    id: 4,
    title: "초등학교 앞 횡단보도 신호가 짧아 어르신들이 다 건너지 못해요",
    summary:
      "초록불이 켜진 뒤 절반쯤 건넜을 때 깜빡이기 시작합니다. 신호 시간을 조금 늘려 주세요.",
    date: "2026-10-30",
    author: "정하은",
    status: "progress",
    category: "교통",
    period: "lastWeek",
  },
  {
    id: 5,
    title: "산책로 가로등 두 개 고장",
    summary:
      "공원 북쪽 산책로 가로등 두 개가 밤에 켜지지 않습니다. 저녁 산책길이 어둡습니다.",
    date: "2026-10-29",
    author: "김도윤",
    status: "done",
    category: "시설",
    period: "lastWeek",
  },
  {
    id: 6,
    title: "하천 산책길 악취",
    summary:
      "비가 온 뒤로 하천 아래쪽에서 냄새가 심하게 납니다. 물이 고인 곳이 있는지 봐 주세요.",
    date: "2026-10-28",
    author: "윤서아",
    status: "done",
    category: "환경",
    period: "lastWeek",
  },
  {
    id: 7,
    title: "어린이집 앞 불법 주차 단속 요청",
    summary: "등원 시간마다 차가 길가에 서 있어 아이들이 차도로 걸어 다닙니다.",
    date: "2026-10-27",
    author: "한지우",
    status: "done",
    category: "교통",
    period: "lastWeek",
  },
  {
    id: 8,
    title: "도서관 열람실 난방이 약해요",
    summary:
      "오후가 되면 열람실이 추워 겉옷을 입고 있어야 합니다. 난방 시간을 확인해 주세요.",
    date: "2026-10-21",
    author: "오민재",
    status: "done",
    category: "시설",
    period: "earlier",
  },
  {
    id: 9,
    title: "골목길 보도블록 들뜸",
    summary: "세탁소 옆 골목 보도블록 몇 장이 들떠 걸려 넘어질 뻔했습니다.",
    date: "2026-10-16",
    author: "서예린",
    status: "done",
    category: "안전",
    period: "earlier",
  },
  {
    id: 10,
    title: "경로당 앞 쉼터에 벤치를 놓아 주세요",
    summary:
      "경로당 앞에서 버스를 기다리는 어르신이 많은데 앉을 곳이 없습니다.",
    date: "2026-10-09",
    author: "강태오",
    status: "done",
    category: "시설",
    period: "earlier",
  },
];

const sections = (
  [
    { id: "thisWeek", label: "이번 주" },
    { id: "lastWeek", label: "지난주" },
    { id: "earlier", label: "이전" },
  ] as const
).map((period) => ({
  ...period,
  reports: reports.filter((report) => report.period === period.id),
}));

// 한 번 내릴 때 움직이는 거리. 목록 영역 높이에 대한 비율이라 줄 수가 달라도 머리글이 붙고 밀려나는 구간을 지난다
const PAGE_RATIO = 0.6;
const SCROLL_MS = 600;

export default function ListRow({ params }: SpecimenProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolling = useRef<AnimationPlaybackControls | null>(null);
  const seconds = useSeconds();
  const { lines, meta, group } = params;

  useEffect(() => () => scrolling.current?.stop(), []);

  const stopScrolling = () => {
    scrolling.current?.stop();
    scrolling.current = null;
  };

  const glideTo = (box: HTMLDivElement, top: number) => {
    stopScrolling();
    scrolling.current = animate(box.scrollTop, top, {
      duration: seconds(SCROLL_MS),
      ease: EASE_OUT,
      onUpdate: (latest) => {
        box.scrollTop = latest;
      },
    });
  };

  useDemo((tick) => {
    const box = scrollRef.current;
    if (!box) return;
    const step = (tick - 1) % 3;
    const page = Math.round(box.clientHeight * PAGE_RATIO);
    const bottom = box.scrollHeight - box.clientHeight;
    glideTo(box, step === 2 ? 0 : Math.min(bottom, page * (step + 1)));
  });

  const row = (report: Report) => (
    <Row key={report.id} report={report} lines={lines} meta={meta} />
  );

  return (
    <div
      className="lst-page"
      data-lines={lines}
      data-meta={meta}
      data-group={group}
    >
      <h3>민원 처리 현황</h3>
      {/* 사용자가 직접 스크롤하기 시작하면 진행 중인 시연 스크롤을 멈춰 손을 이기지 않게 한다 */}
      <div
        ref={scrollRef}
        className="lst-scroll"
        onWheel={stopScrolling}
        onTouchStart={stopScrolling}
        onPointerDown={stopScrolling}
        onKeyDown={stopScrolling}
      >
        {group === "flat" ? (
          <ul className="lst-list">{reports.map(row)}</ul>
        ) : (
          sections.map((section) => (
            <section key={section.id} className="lst-group">
              <h4 className="lst-head">{section.label}</h4>
              <ul className="lst-list">{section.reports.map(row)}</ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function Row({
  report,
  lines,
  meta,
}: {
  report: Report;
  lines: string;
  meta: string;
}) {
  const status = statuses[report.status];
  const [, month, day] = report.date.split("-").map(Number);

  const title = (
    <div className="lst-title-line">
      <span className="lst-title">{report.title}</span>
      {meta === "badge" && (
        <span className="lst-badges">
          <span className="lst-badge" data-status={report.status}>
            {status}
          </span>
          <span className="lst-badge">{report.category}</span>
        </span>
      )}
    </div>
  );
  const aside = (
    <>
      {meta === "text" && (
        <span className="lst-meta-text">
          {status}, {report.category}
        </span>
      )}
      <time className="lst-date" dateTime={report.date}>
        {month}월 {day}일
      </time>
    </>
  );

  if (lines === "one") {
    return (
      <li className="lst-row">
        <div className="lst-line">
          {title}
          <span className="lst-aside">{aside}</span>
        </div>
      </li>
    );
  }

  if (lines === "two") {
    return (
      <li className="lst-row">
        {title}
        <div className="lst-line">
          <span className="lst-summary">{report.summary}</span>
          <span className="lst-aside">{aside}</span>
        </div>
      </li>
    );
  }

  return (
    <li className="lst-row">
      {title}
      <p className="lst-summary">{report.summary}</p>
      <div className="lst-byline">
        {aside}
        <span className="lst-author">{report.author}</span>
      </div>
    </li>
  );
}
