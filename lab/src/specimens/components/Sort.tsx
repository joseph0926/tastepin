import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  ArrowUpDown,
  Check,
  ChevronDown,
  Folder,
} from "lucide-react";
import { EASE_OUT_CUBIC, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Sort.css";

// params: control(menu | select | segmented), direction(fixed | toggle), label(value | prefix | icon), resort(instant | move | mark)
// 메뉴는 드롭다운 시편의 한 조합(버튼에서 펼쳐짐 140ms, 따라오는 면, 항목 30px), 세그먼트는 세그먼트 시편의 한 조합(밑줄, 미끄러짐)으로 고정해 그린다.
// 실제 화면에서는 메뉴 프리미티브(Radix DropdownMenu 등)에 열기와 키보드 처리를 맡기고 모양과 모션 값만 옮긴다.

type SortId = "recent" | "name" | "created";

const sorts: { id: SortId; short: string; label: string }[] = [
  { id: "recent", short: "최근 수정", label: "최근 수정순" },
  { id: "name", short: "이름", label: "이름순" },
  { id: "created", short: "만든 날", label: "만든 날순" },
];

const projects = [
  { id: "p1", name: "블로그 리뉴얼", updated: 0, created: "2026-08-12" },
  { id: "p2", name: "고객 인터뷰", updated: 2, created: "2026-09-20" },
  { id: "p3", name: "가격 페이지 실험", updated: 5, created: "2026-07-03" },
  { id: "p4", name: "디자인 시스템", updated: 1, created: "2026-05-14" },
  { id: "p5", name: "온보딩 개선", updated: 9, created: "2026-10-01" },
  { id: "p6", name: "모바일 앱 출시", updated: 3, created: "2026-06-22" },
];
type Project = (typeof projects)[number];

// 기본 방향: 최근 수정과 만든 날은 최근이 위, 이름은 가나다순
const compare: Record<SortId, (a: Project, b: Project) => number> = {
  recent: (a, b) => a.updated - b.updated,
  name: (a, b) => a.name.localeCompare(b.name, "ko"),
  created: (a, b) => b.created.localeCompare(a.created),
};

const directionLabel: Record<SortId, [string, string]> = {
  recent: ["최근 수정이 위", "오래된 수정이 위"],
  name: ["가나다순", "가나다 역순"],
  created: ["최근에 만든 것이 위", "오래전에 만든 것이 위"],
};

function sorted(sort: SortId, reversed: boolean) {
  const list = [...projects].sort(compare[sort]);
  return reversed ? list.reverse() : list;
}

function meta(project: Project, sort: SortId) {
  if (sort === "created") {
    const [, month, day] = project.created.split("-").map(Number);
    return `${month}월 ${day}일 만듦`;
  }
  return project.updated === 0 ? "오늘 수정" : `${project.updated}일 전 수정`;
}

export default function Sort({ params }: SpecimenProps) {
  const { control, direction, label, resort } = params;
  const [sort, setSort] = useState<SortId>("recent");
  const [reversed, setReversed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [byKeyboard, setByKeyboard] = useState(false);
  // 바뀐 행만 표시: 자리가 바뀐 행 id와, 같은 행이 다시 바뀌어도 표시를 처음부터 하도록 바꿀 때마다 오르는 번호
  const [marked, setMarked] = useState<{ ids: string[]; round: number }>({
    ids: [],
    round: 0,
  });
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const seconds = useSeconds();
  const groupId = useId();
  const menuId = useId();
  const current = sorts.find((item) => item.id === sort)!;
  const list = sorted(sort, reversed);

  const change = (nextSort: SortId, nextReversed: boolean) => {
    const before = sorted(sort, reversed).map((p) => p.id);
    const after = sorted(nextSort, nextReversed).map((p) => p.id);
    const moved = after.filter((id, index) => before[index] !== id);
    setSort(nextSort);
    setReversed(nextReversed);
    if (moved.length)
      setMarked((value) => ({ ids: moved, round: value.round + 1 }));
  };
  // 기준을 바꾸면 그 기준의 기본 방향으로 돌아간다
  const choose = (next: SortId) => {
    if (next !== sort) change(next, false);
  };
  const flip = () => change(sort, !reversed);

  const closeMenu = (returnFocus: boolean) => {
    setMenuOpen(false);
    setActive(-1);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (menuOpen && byKeyboard && active >= 0)
      itemRefs.current[active]?.focus({ preventScroll: true });
  }, [menuOpen, byKeyboard, active]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) closeMenu(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  // 시연 순서: (메뉴면) 열기, 이름으로, 방향 뒤집기(한 방향이면 만든 날로), 최근 수정으로
  useDemo((tick) => {
    const step = (tick - 1) % 4;
    setByKeyboard(false);
    if (step === 0 && control === "menu") setMenuOpen(true);
    if (step === 1) {
      choose("name");
      closeMenu(false);
    }
    if (step === 2) {
      if (direction === "toggle") flip();
      else choose("created");
    }
    if (step === 3) change("recent", false);
  });

  const menuTiming = { duration: seconds(140), ease: EASE_OUT_CUBIC };
  const rowTiming = { duration: seconds(220), ease: EASE_OUT_CUBIC };
  const accessibleName = `정렬: ${current.label}`;

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in moves) {
      event.preventDefault();
      setByKeyboard(true);
      setActive(
        (value) => (value + moves[event.key] + sorts.length) % sorts.length,
      );
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      closeMenu(true);
    }
  };

  const menu = (
    <div className="srt-anchor" ref={anchorRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`srt-trigger is-${label}${menuOpen ? " is-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        aria-label={label === "icon" ? accessibleName : undefined}
        onClick={() => {
          setByKeyboard(false);
          if (menuOpen) closeMenu(false);
          else setMenuOpen(true);
        }}
        onKeyDown={(event) => {
          if (!["ArrowDown", "Enter", " "].includes(event.key)) return;
          event.preventDefault();
          setByKeyboard(true);
          setMenuOpen(true);
          setActive(sorts.findIndex((item) => item.id === sort));
        }}
      >
        {label === "icon" ? (
          <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden />
        ) : (
          <>
            {label === "prefix" && <span className="srt-prefix">정렬:</span>}
            {current.label}
            <ChevronDown size={14} strokeWidth={2} aria-hidden />
          </>
        )}
      </button>
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id={menuId}
            role="menu"
            className="srt-menu"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1, transition: menuTiming }}
            exit={{ opacity: 0, scale: 0.96, transition: menuTiming }}
            onKeyDown={onMenuKeyDown}
            onPointerLeave={() => setActive(-1)}
          >
            {sorts.map((item, index) => (
              <button
                key={item.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={item.id === sort}
                tabIndex={-1}
                className="srt-menu-item"
                onPointerMove={() => setActive(index)}
                onClick={() => {
                  choose(item.id);
                  closeMenu(true);
                }}
              >
                {index === active && (
                  <motion.span
                    className="srt-menu-highlight"
                    layoutId={`${menuId}-highlight`}
                    transition={{
                      duration: seconds(120),
                      ease: EASE_OUT_CUBIC,
                    }}
                  />
                )}
                <span className="srt-menu-label">{item.label}</span>
                {item.id === sort && (
                  <Check size={15} strokeWidth={2} aria-hidden />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const select = (
    <div className="srt-select">
      <select
        aria-label="정렬"
        value={sort}
        onChange={(event) => choose(event.target.value as SortId)}
      >
        {sorts.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} strokeWidth={2} aria-hidden />
    </div>
  );

  const segmented = (
    <div className="srt-segmented" role="radiogroup" aria-label="정렬">
      {sorts.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={item.id === sort}
          className="srt-segment"
          onClick={() => choose(item.id)}
        >
          {item.short}
          {item.id === sort && (
            <motion.span
              className="srt-underline"
              layoutId={`${groupId}-underline`}
              transition={{ duration: seconds(200), ease: EASE_OUT_CUBIC }}
            />
          )}
        </button>
      ))}
    </div>
  );

  return (
    <div className="srt-page">
      <h3>프로젝트</h3>
      <div className="srt-toolbar">
        <span className="srt-count">{projects.length}개</span>
        <div className="srt-controls">
          {control === "menu"
            ? menu
            : control === "select"
              ? select
              : segmented}
          {direction === "toggle" && (
            <button
              type="button"
              className="srt-direction"
              aria-label={`방향: ${directionLabel[sort][reversed ? 1 : 0]}`}
              onClick={flip}
            >
              <motion.span
                className="srt-direction-icon"
                animate={{ rotate: reversed ? 180 : 0 }}
                transition={{ duration: seconds(160), ease: EASE_OUT_CUBIC }}
              >
                <ArrowDown size={16} strokeWidth={1.75} aria-hidden />
              </motion.span>
            </button>
          )}
        </div>
      </div>

      <ul className="srt-list" aria-label={accessibleName}>
        {list.map((project) => (
          <motion.li
            key={project.id}
            layout={resort === "move" ? "position" : false}
            transition={rowTiming}
          >
            {/* 마운트 때의 opacity 애니메이션은 motion이 건너뛰어 데이터 테이블처럼 CSS 키프레임으로 걷는다.
                바꿀 때마다 key가 달라 같은 행도 처음부터 다시 보인다 */}
            {resort === "mark" && marked.ids.includes(project.id) && (
              <span
                key={marked.round}
                className="srt-mark"
                style={
                  { "--srt-mark": `${seconds(600)}s` } as React.CSSProperties
                }
              />
            )}
            <div className="srt-row">
              <Folder size={16} strokeWidth={1.75} aria-hidden />
              <span className="srt-name">{project.name}</span>
              <span className="srt-meta">{meta(project, sort)}</span>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
