import { useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Phone.css";

// params: progress(bar | remaining | none), totop(upward | always | none), wide(scroll | fit | stack)
// 휴대폰 화면에 고정 헤더와 긴 기술 글을 그린다. 진행 표시는 본문 흐름에 넣지 않고 헤더에 붙인다(휴대폰 보조 띠 규칙).

const READ_MINUTES = 4;
const columns = ["방식", "첫 화면", "캐시", "번들 크기", "맞는 화면"];
const rows = [
  [
    "클라이언트 렌더링",
    "빈 화면 뒤 표시",
    "브라우저",
    "큼",
    "로그인 뒤 대시보드",
  ],
  ["서버 렌더링", "빠름", "요청마다", "보통", "자주 바뀌는 목록"],
  ["정적 생성", "가장 빠름", "빌드 결과", "작음", "블로그와 문서"],
  ["스트리밍", "차례로 채움", "부분별", "보통", "느린 데이터가 섞인 화면"],
];
const caption = "표 1. 렌더링 방식 비교";

export default function MobileReading({ params }: SpecimenProps) {
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: false });
  const bodyRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const lastTop = useRef(0);
  const seconds = useSeconds();
  const reduced = useReducedMotion();
  const behavior = reduced ? "auto" : "smooth";

  const measureEdges = () => {
    const box = tableRef.current;
    if (!box) return setEdges({ left: false, right: false });
    setEdges({
      left: box.scrollLeft > 1,
      right: box.scrollLeft + box.clientWidth < box.scrollWidth - 1,
    });
  };

  useEffect(measureEdges, [params.wide]);

  const onScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const top = body.scrollTop;
    const range = body.scrollHeight - body.clientHeight;
    setProgress(range > 0 ? Math.min(1, top / range) : 1);
    // 한 화면 넘게 내린 뒤에만 버튼을 보인다. 4px 넘게 움직였을 때만 방향을 바꿔 작은 떨림에 반응하지 않는다
    const far = top > body.clientHeight;
    if (params.totop === "always") setShowTop(far);
    if (params.totop === "upward") {
      if (!far || top > lastTop.current + 4) setShowTop(false);
      else if (top < lastTop.current - 4) setShowTop(true);
    }
    if (Math.abs(top - lastTop.current) > 4) lastTop.current = top;
  };

  // 시연: 표까지 내림, 표를 옆으로 넘김, 끝 가까이 내림, 조금 위로, 맨 위로
  useDemo((tick) => {
    const body = bodyRef.current;
    const table = tableRef.current;
    const step = tick % 5;
    if (!body) return;
    if (step === 1) {
      const anchor = body.querySelector<HTMLElement>("[data-table]");
      body.scrollTo({ top: (anchor?.offsetTop ?? 0) - 72, behavior });
    }
    if (step === 2) table?.scrollTo({ left: table.scrollWidth, behavior });
    if (step === 3) body.scrollTo({ top: body.scrollHeight * 0.72, behavior });
    if (step === 4) body.scrollTo({ top: body.scrollTop - 220, behavior });
    if (step === 0) {
      body.scrollTo({ top: 0, behavior });
      table?.scrollTo({ left: 0, behavior });
    }
  });

  const remaining = Math.ceil(READ_MINUTES * (1 - progress));
  const fade = { duration: reduced ? 0 : seconds(160), ease: EASE_OUT };

  return (
    <div className="ph-frame">
      <div className="ph-head">
        <h3>기록</h3>
        {params.progress === "remaining" && (
          <span className="prd-head-meta" aria-live="off">
            {progress >= 0.99 ? "다 읽음" : `약 ${remaining}분 남음`}
          </span>
        )}
      </div>
      {params.progress === "bar" && (
        <div
          className="prd-progress"
          style={{ width: "100%", transform: `scaleX(${progress})` }}
          role="progressbar"
          aria-label="읽은 정도"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        />
      )}

      <div ref={bodyRef} className="ph-body" onScroll={onScroll}>
        <article className="prd-article">
          <h2>서버 렌더링은 언제 쓰나</h2>
          <p className="prd-meta">2026년 11월 9일, {READ_MINUTES}분 읽기</p>
          <p>
            화면을 어디에서 그리느냐는 첫 화면이 뜨는 속도와 서버 비용, 캐시
            전략을 함께 바꿉니다. 한 가지 방식으로 모든 화면을 만들 필요는
            없습니다.
          </p>
          <p>
            로그인 뒤에만 보이는 화면은 검색 노출이 필요 없고, 사용자마다 내용이
            다릅니다. 반대로 글과 문서는 모두에게 같은 내용을 보여 주고 자주
            바뀌지 않습니다.
          </p>
          <h3>방식별 비교</h3>
          <p>네 가지 방식을 같은 기준으로 놓으면 차이가 분명해집니다.</p>
          <WideTable
            wide={params.wide}
            tableRef={tableRef}
            edges={edges}
            onScroll={measureEdges}
          />
          <p>
            정적 생성은 빌드할 때 만든 결과를 그대로 내보내서 가장 빠릅니다.
            대신 내용이 바뀌면 다시 빌드하거나 일정 시간마다 새로 만들어야
            합니다.
          </p>
          <p>
            스트리밍은 먼저 준비된 부분부터 보내고 느린 부분을 뒤에 채웁니다.
            느린 데이터 하나 때문에 화면 전체가 늦어지는 일을 막습니다.
          </p>
          <h3>정리</h3>
          <p>
            화면마다 누가 보는지, 얼마나 자주 바뀌는지를 먼저 묻습니다. 그 답이
            렌더링 방식을 거의 정해 줍니다.
          </p>
          <p>
            블로그는 정적 생성으로 두고, 댓글처럼 자주 바뀌는 부분만 따로
            불러오는 구성이 무난합니다.
          </p>
        </article>
      </div>

      <AnimatePresence>
        {params.totop !== "none" && showTop && (
          <motion.button
            key="top"
            type="button"
            className="prd-top"
            aria-label="맨 위로"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            onClick={() => bodyRef.current?.scrollTo({ top: 0, behavior })}
          >
            <ArrowUp size={20} strokeWidth={1.75} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function WideTable({
  wide,
  tableRef,
  edges,
  onScroll,
}: {
  wide: string;
  tableRef: RefObject<HTMLDivElement | null>;
  edges: { left: boolean; right: boolean };
  onScroll: () => void;
}) {
  if (wide === "stack") {
    return (
      <div data-table>
        <p className="prd-stack-caption">{caption}</p>
        <ul className="prd-stack">
          {rows.map(([name, ...cells]) => (
            <li key={name}>
              <h4>{name}</h4>
              <dl>
                {cells.map((cell, index) => (
                  <div key={columns[index + 1]} style={{ display: "contents" }}>
                    <dt>{columns[index + 1]}</dt>
                    <dd>{cell}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const scroll = wide === "scroll";
  return (
    <div
      className="prd-table-wrap"
      data-table
      data-more-left={scroll && edges.left}
      data-more-right={scroll && edges.right}
    >
      <div
        ref={scroll ? tableRef : undefined}
        className={scroll ? "prd-table-scroll" : undefined}
        onScroll={scroll ? onScroll : undefined}
        tabIndex={scroll ? 0 : undefined}
        role={scroll ? "region" : undefined}
        aria-label={scroll ? `${caption}, 옆으로 넘겨 더 보기` : undefined}
      >
        <table className="prd-table" data-wide={wide}>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, ...cells]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {cells.map((cell, index) => (
                  <td key={columns[index + 1]}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
