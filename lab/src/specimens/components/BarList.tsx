import { useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./BarList.css";

// params: bar(behind | under | none), more(fade | footer | scroll), head(tabs | select | segmented)
// 기준(유입처, 페이지, 국가)을 바꾸면 행의 이름과 막대 길이가 바뀐다. 기준마다 12행이고 처음에는 6행만 보인다

const groups = [
  {
    id: "source",
    label: "유입처",
    rows: [
      ["검색", 6420],
      ["직접 방문", 4180],
      ["사내 메신저", 2960],
      ["뉴스레터", 1840],
      ["코드 저장소", 1210],
      ["기술 블로그", 880],
      ["개발자 커뮤니티", 610],
      ["행사 안내 페이지", 340],
      ["협력사 포털", 220],
      ["동영상 설명란", 140],
      ["번역 사이트", 90],
      ["기타", 60],
    ],
  },
  {
    id: "page",
    label: "페이지",
    rows: [
      ["/시작하기", 5310],
      ["/api/인증", 3870],
      ["/가이드/배포", 2440],
      ["/api/웹훅", 1980],
      ["/변경 기록", 1460],
      ["/가이드/권한", 1120],
      ["/요금", 760],
      ["/api/한도", 520],
      ["/문의", 310],
      ["/가이드/백업", 240],
      ["/용어", 150],
      ["/보안", 80],
    ],
  },
  {
    id: "country",
    label: "국가",
    rows: [
      ["대한민국", 11240],
      ["일본", 2310],
      ["미국", 1980],
      ["베트남", 870],
      ["독일", 540],
      ["싱가포르", 410],
      ["대만", 330],
      ["캐나다", 260],
      ["영국", 190],
      ["호주", 120],
      ["인도", 80],
      ["프랑스", 50],
    ],
  },
] as const;

type GroupId = (typeof groups)[number]["id"];

const COLLAPSED_ROWS = 6;

export default function BarList({ params }: SpecimenProps) {
  const [groupId, setGroupId] = useState<GroupId>("source");
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seconds = useSeconds();
  const baseId = useId();
  const { bar, more, head } = params;
  const group = groups.find((item) => item.id === groupId) ?? groups[0];
  const max = group.rows[0][1];

  // 카드 안 스크롤은 버튼 없이 모든 행을 담는다
  const showAll = more === "scroll" || expanded;
  const rows = showAll ? group.rows : group.rows.slice(0, COLLAPSED_ROWS);
  const fadeLast = more === "fade" && !expanded;

  const changeGroup = (id: GroupId) => {
    setGroupId(id);
    setExpanded(false);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const toggleMore = (open: boolean) => {
    if (more === "scroll") {
      const element = scrollRef.current;
      element?.scrollTo({
        top: open ? element.scrollHeight : 0,
        behavior: "smooth",
      });
      return;
    }
    setExpanded(open);
  };

  // 기준 바꾸기, 펼치기, 접기를 기준마다 차례로 시연한다
  useDemo((tick) => {
    const action = (tick - 1) % 3;
    if (action === 0) {
      const index = (Math.floor((tick - 1) / 3) + 1) % groups.length;
      changeGroup(groups[index].id);
    } else {
      toggleMore(action === 1);
    }
  });

  const panelId = `${baseId}-panel`;

  return (
    <section className="bl-card" data-bar={bar} data-more={more}>
      <header className="bl-head">
        {head === "select" ? (
          <label className="bl-select">
            <span className="bl-sr-only">목록 기준</span>
            <select
              value={groupId}
              onChange={(event) => changeGroup(event.target.value as GroupId)}
            >
              {groups.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
          </label>
        ) : (
          <div
            className={head === "segmented" ? "bl-segments" : "bl-tabs"}
            role="tablist"
            aria-label="목록 기준"
          >
            {groups.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === groupId}
                aria-controls={panelId}
                className="bl-tab"
                onClick={() => changeGroup(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <span className="bl-unit">방문자</span>
      </header>

      <div className="bl-body" id={panelId}>
        <div className="bl-scroll" ref={scrollRef}>
          <ul className="bl-rows">
            {rows.map(([label, value], index) => {
              const share = `${Math.max((value / max) * 100, 1)}%`;
              const faded = fadeLast && index === rows.length - 1;
              return (
                // 기준을 바꿔도 같은 자리의 막대가 새 길이로 이어서 바뀌도록 자리 번호를 키로 쓴다
                <li
                  key={index}
                  className="bl-row"
                  data-faded={faded || undefined}
                >
                  {bar !== "none" && (
                    <motion.span
                      aria-hidden
                      className="bl-bar"
                      initial={false}
                      animate={{ width: share }}
                      transition={{
                        duration: seconds(300),
                        ease: [0.2, 0.7, 0.2, 1],
                      }}
                    />
                  )}
                  <span className="bl-name">{label}</span>
                  <span className="bl-value">
                    {value.toLocaleString("ko-KR")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {more === "fade" && (
          <div className={expanded ? "bl-more-after" : "bl-more-over"}>
            <button
              type="button"
              className="bl-more"
              aria-expanded={expanded}
              onClick={() => toggleMore(!expanded)}
            >
              {expanded ? "접기" : "모두 보기"}
            </button>
          </div>
        )}
      </div>

      {more === "footer" && (
        <button
          type="button"
          className="bl-footer"
          aria-expanded={expanded}
          onClick={() => toggleMore(!expanded)}
        >
          {expanded ? "접기" : `${group.rows.length}개 모두 보기`}
        </button>
      )}
    </section>
  );
}
