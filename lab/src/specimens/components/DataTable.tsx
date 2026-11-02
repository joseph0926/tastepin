import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, type Transition } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import {
  columns,
  nextSort,
  payouts,
  shortDate,
  sorted,
  won,
  type Payout,
  type Sort,
} from "./tableData";
import "./DataTable.css";

// params: sticky(shadow | line | none), actions(hover | menu | row), resort(move | fade | instant | mark | arrow | wave), paging(pages | more | count)
// resort는 move, fade, instant를 먼저 묻고, 셋 다 별로라고 하면 mark, arrow, wave로 다시 묻는다(lab.py의 offer).
// 같이 재생은 정렬 바꾸기, 표 안 스크롤, 행 작업 보이기, 넘기기를 차례로 한다. 마우스 올림은 흉내 낸 행(is-hot)으로 보여 준다.

const PAGE = 5;
const firstSort: Sort = { key: "date", dir: "desc" };

export default function DataTable({ params }: SpecimenProps) {
  const [sort, setSort] = useState<Sort>(firstSort);
  // 흐려졌다 교체: 흐려지는 동안은 이전 순서를 보여 주고, 다 흐려진 뒤 새 순서로 바꾼다
  const [shownSort, setShownSort] = useState<Sort>(firstSort);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(PAGE);
  const [visible, setVisible] = useState(PAGE);
  const [hot, setHot] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [opened, setOpened] = useState<Payout | null>(null);
  const [scrolled, setScrolled] = useState(false);
  // 정렬을 바꿀 때마다 오르는 번호와 그때 자리가 바뀐 행. mark와 wave가 행 효과를 다시 시작하는 데 쓴다
  const [sortRound, setSortRound] = useState(0);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const seconds = useSeconds();
  const { sticky, actions, resort, paging } = params;
  const fading = resort === "fade" && shownSort !== sort;
  const order = resort === "fade" ? shownSort : sort;

  const size = paging === "count" ? perPage : PAGE;
  const pageRows = (by: Sort) => {
    const all = sorted(payouts, by);
    return paging === "more"
      ? all.slice(0, visible)
      : all.slice(page * size, (page + 1) * size);
  };
  const rows = pageRows(order);
  const pages = Math.ceil(payouts.length / size);

  const changeSort = (next: Sort) => {
    const before = rows.map((row) => row.id);
    setMoved(
      new Set(
        pageRows(next)
          .map((row, index) => (before[index] === row.id ? "" : row.id))
          .filter(Boolean),
      ),
    );
    setSortRound((value) => value + 1);
    setSort(next);
    if (resort !== "fade") setShownSort(next);
  };

  const scrollTo = (top: number) => scrollRef.current?.scrollTo({ top });

  useDemo((tick) => {
    const step = (tick - 1) % 6;
    setMenuFor(null);
    if (step === 0) changeSort(nextSort(sort, "amount"));
    if (step === 1) scrollTo(120);
    if (step === 2) {
      const target = rows[1]?.id ?? null;
      if (actions === "hover") setHot(target);
      if (actions === "menu") setMenuFor(target);
      if (actions === "row") setOpened(rows[1] ?? null);
    }
    if (step === 3) {
      setHot(null);
      setOpened(null);
      scrollTo(0);
      if (paging === "more") setVisible(payouts.length);
      else setPage(1);
    }
    if (step === 4) changeSort(nextSort(sort, "partner"));
    if (step === 5) {
      changeSort(firstSort);
      setPage(0);
      setVisible(PAGE);
      scrollTo(0);
    }
  });

  useEffect(() => {
    if (!menuFor) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest(".dtb-menu, .dtb-more"))
        setMenuFor(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuFor]);

  const quick = { duration: seconds(120), ease: EASE_OUT };
  const markCycle = { "--dtb-mark": `${seconds(600)}s` } as CSSProperties;
  const layoutMove = {
    duration: resort === "move" ? seconds(200) : 0,
    ease: EASE_OUT,
  };

  return (
    <div
      className="dtb-page"
      data-sticky={sticky}
      data-actions={actions}
      data-paging={paging}
      style={markCycle}
      onKeyDown={(event) => event.key === "Escape" && setMenuFor(null)}
    >
      <h3>정산 내역</h3>
      <div
        ref={scrollRef}
        className={scrolled ? "dtb-scroll is-scrolled" : "dtb-scroll"}
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
      >
        <table className="dtb">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort.key === column.key;
                const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={column.numeric ? "is-numeric" : undefined}
                    aria-sort={
                      active
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => changeSort(nextSort(sort, column.key))}
                    >
                      {column.label}
                      {active &&
                        (resort === "arrow" ? (
                          // 화살표만: 방향이 바뀌면 화살표가 180도 돌고, 다른 열로 옮기면 제자리에서 나타난다
                          <motion.span
                            key={column.key}
                            className="dtb-arrow"
                            initial={{
                              opacity: 0,
                              rotate: sort.dir === "asc" ? 0 : 180,
                            }}
                            animate={{
                              opacity: 1,
                              rotate: sort.dir === "asc" ? 0 : 180,
                            }}
                            transition={{
                              duration: seconds(160),
                              ease: EASE_OUT,
                            }}
                          >
                            <ArrowUp size={14} strokeWidth={2} aria-hidden />
                          </motion.span>
                        ) : (
                          <Arrow size={14} strokeWidth={2} aria-hidden />
                        ))}
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="dtb-actions-head">
                <span className="dtb-sr">작업</span>
              </th>
            </tr>
          </thead>
          <motion.tbody
            initial={false}
            animate={{ opacity: fading ? 0 : 1 }}
            transition={quick}
            onAnimationComplete={() => {
              if (fading) setShownSort(sort);
            }}
          >
            <AnimatePresence initial={false}>
              {rows.map((row, index) => (
                <motion.tr
                  // mark와 wave는 정렬마다 행을 새로 그려 효과를 처음부터 다시 보여 준다
                  key={
                    resort === "wave" ||
                    (resort === "mark" && moved.has(row.id))
                      ? `${row.id}:${sortRound}`
                      : row.id
                  }
                  layout="position"
                  initial={
                    paging === "more" && index >= PAGE
                      ? { opacity: 0, y: 4 }
                      : resort === "wave" && sortRound > 0
                        ? { opacity: 0.35 }
                        : false
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={{
                    default:
                      resort === "wave"
                        ? {
                            duration: seconds(120),
                            delay: seconds(20 * index),
                            ease: EASE_OUT,
                          }
                        : { duration: seconds(200), ease: EASE_OUT },
                    layout: layoutMove,
                  }}
                  className={[
                    resort === "mark" && moved.has(row.id) && "is-moved",
                    hot === row.id && "is-hot",
                    opened?.id === row.id && "is-open",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  tabIndex={actions === "row" ? 0 : undefined}
                  onClick={actions === "row" ? () => setOpened(row) : undefined}
                  onKeyDown={
                    actions === "row"
                      ? (event) => event.key === "Enter" && setOpened(row)
                      : undefined
                  }
                >
                  <td>{row.partner}</td>
                  <td className="dtb-muted">{shortDate(row.date)}</td>
                  <td className="is-numeric">{won(row.amount)}</td>
                  <td className="dtb-actions">
                    <RowActions
                      row={row}
                      mode={actions}
                      menuOpen={menuFor === row.id}
                      onMenu={() =>
                        setMenuFor((current) =>
                          current === row.id ? null : row.id,
                        )
                      }
                      quick={quick}
                    />
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </motion.tbody>
        </table>
      </div>

      <p className="dtb-detail" aria-live="polite">
        {actions === "row" &&
          (opened
            ? `${opened.partner} 상세가 열리는 자리. 삭제는 상세 안에 둔다`
            : "행을 누르면 상세가 열린다")}
      </p>

      <Pager
        paging={paging}
        page={page}
        pages={pages}
        size={size}
        visible={visible}
        onPage={(next) => {
          setPage(next);
          scrollTo(0);
        }}
        onMore={() =>
          setVisible((value) => Math.min(payouts.length, value + PAGE))
        }
        onSize={(next) => {
          setPerPage(next);
          setPage(0);
        }}
      />
    </div>
  );
}

function RowActions({
  row,
  mode,
  menuOpen,
  onMenu,
  quick,
}: {
  row: Payout;
  mode: string;
  menuOpen: boolean;
  onMenu: () => void;
  quick: Transition;
}) {
  if (mode === "row") return null;
  if (mode === "hover") {
    return (
      <span className="dtb-icons">
        <button type="button" aria-label={`${row.partner} 보기`}>
          <Eye size={16} strokeWidth={1.75} />
        </button>
        <button type="button" aria-label={`${row.partner} 편집`}>
          <Pencil size={16} strokeWidth={1.75} />
        </button>
        <button type="button" aria-label={`${row.partner} 삭제`}>
          <Trash2 size={16} strokeWidth={1.75} />
        </button>
      </span>
    );
  }
  return (
    <span className="dtb-menu-anchor">
      <button
        type="button"
        className="dtb-more"
        aria-label={`${row.partner} 작업`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={onMenu}
      >
        <MoreHorizontal size={16} strokeWidth={1.75} />
      </button>
      <AnimatePresence>
        {menuOpen && (
          <motion.span
            className="dtb-menu"
            role="menu"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={quick}
          >
            <button type="button" role="menuitem">
              보기
            </button>
            <button type="button" role="menuitem">
              편집
            </button>
            <button type="button" role="menuitem" className="is-danger">
              삭제
            </button>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function Pager({
  paging,
  page,
  pages,
  size,
  visible,
  onPage,
  onMore,
  onSize,
}: {
  paging: string;
  page: number;
  pages: number;
  size: number;
  visible: number;
  onPage: (page: number) => void;
  onMore: () => void;
  onSize: (size: number) => void;
}) {
  const total = payouts.length;
  const from = page * size + 1;
  const to = Math.min(total, (page + 1) * size);

  if (paging === "more") {
    return (
      <div className="dtb-pager">
        <span className="dtb-count">
          {visible} / {total}건
        </span>
        {visible < total && (
          <button type="button" className="dtb-button" onClick={onMore}>
            {Math.min(PAGE, total - visible)}건 더 보기
          </button>
        )}
      </div>
    );
  }

  const arrows = (
    <span className="dtb-arrows">
      <button
        type="button"
        className="dtb-icon-button"
        aria-label="이전"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
      </button>
      {paging === "pages" &&
        Array.from({ length: pages }, (_, index) => (
          <button
            key={index}
            type="button"
            className={
              index === page ? "dtb-page-number is-current" : "dtb-page-number"
            }
            aria-current={index === page ? "page" : undefined}
            onClick={() => onPage(index)}
          >
            {index + 1}
          </button>
        ))}
      <button
        type="button"
        className="dtb-icon-button"
        aria-label="다음"
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight size={16} strokeWidth={1.75} />
      </button>
    </span>
  );

  return (
    <div className="dtb-pager">
      <span className="dtb-count">
        {from}–{to} / {total}건
      </span>
      {paging === "count" && (
        <label className="dtb-size">
          한 번에
          <select
            value={size}
            onChange={(event) => onSize(Number(event.target.value))}
          >
            {[5, 10].map((option) => (
              <option key={option} value={option}>
                {option}행
              </option>
            ))}
          </select>
        </label>
      )}
      {arrows}
    </div>
  );
}
