import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Clock,
  FileText,
  Search as SearchIcon,
  Terminal,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { EASE_OUT_CUBIC, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./GlobalSearch.css";

// params: open(palette | expand | screen), before(recent | jump | hint), group(kind | mixed | tabs), keys(footer | row | none)
// 이미 고른 값 위에서 비교한다. 거르기는 검색 시편(250ms 멈추면, 굵게, 빠진 행이 접힘, 지우기 버튼), 가리킨 행은 드롭다운 시편(따라오는 면 120ms),
// 팔레트는 대화상자 시편(커지며, 흐린 배경, 300ms), 종류 탭은 탭 시편(바탕 면, 미끄러짐)에서 고른 값이다.
// 휴대폰 크기의 앱 틀 안에 그리고, 실제 화면에서는 포털과 포커스 가두기를 프로젝트의 프리미티브에 맡긴다.

type Kind = "doc" | "person" | "command";

const kinds: { id: Kind; label: string; icon: LucideIcon }[] = [
  { id: "doc", label: "문서", icon: FileText },
  { id: "person", label: "사람", icon: Users },
  { id: "command", label: "명령", icon: Terminal },
];

const entries: { id: string; kind: Kind; title: string }[] = [
  { id: "d1", kind: "doc", title: "디자인 시스템 정리" },
  { id: "d2", kind: "doc", title: "디자인 리뷰 회의록" },
  { id: "d3", kind: "doc", title: "10월 예산안" },
  { id: "d4", kind: "doc", title: "분기 보고서 초안" },
  { id: "d5", kind: "doc", title: "디자인 토큰 변경 이력" },
  { id: "p1", kind: "person", title: "디자인팀" },
  { id: "p2", kind: "person", title: "김하늘" },
  { id: "p3", kind: "person", title: "이도윤" },
  { id: "c1", kind: "command", title: "새 디자인 문서 만들기" },
  { id: "c2", kind: "command", title: "설정 열기" },
  { id: "c3", kind: "command", title: "다크 모드 켜기" },
];
type Entry = (typeof entries)[number];

const initialRecent = ["예산", "회의록", "김하늘"];
const jumps = [
  { section: "최근 연 문서", ids: ["d3", "d1"] },
  { section: "바로 실행", ids: ["c1", "c2"] },
];

// 시연 순서: 열기, 한 글자, 검색어 완성, 아래로 한 칸, 닫기
const demoQueries: Record<number, string> = { 1: "디", 2: "디자인" };

const kindOf = (id: Kind) => kinds.find((kind) => kind.id === id)!;
const byId = (id: string) => entries.find((entry) => entry.id === id)!;

// 맞는 정도: 검색어로 시작하면 앞에, 그다음은 맞는 자리가 앞인 순서
function ranked(term: string) {
  return entries
    .filter((entry) => entry.title.includes(term))
    .sort((a, b) => a.title.indexOf(term) - b.title.indexOf(term));
}

function Title({ text, term }: { text: string; term: string }) {
  const at = term ? text.indexOf(term) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <b className="gs-match">{text.slice(at, at + term.length)}</b>
      {text.slice(at + term.length)}
    </>
  );
}

export default function GlobalSearch({ params }: SpecimenProps) {
  const { open: place, before, group, keys } = params;
  const [open, setOpen] = useState(false);
  const [byUser, setByUser] = useState(false);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [tab, setTab] = useState<Kind | "all">("all");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(initialRecent);
  const [headerWidth, setHeaderWidth] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seconds = useSeconds();
  const ids = useId();

  // 검색 시편에서 고른 '잠깐 멈추면': 마지막 입력 뒤 250ms 동안 바뀌지 않으면 거른다
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        setTerm(query.trim());
        setActive(0);
      },
      seconds(250) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [query, seconds]);

  useEffect(() => {
    if (open && byUser) inputRef.current?.focus({ preventScroll: true });
  }, [open, byUser]);

  const show = (user: boolean) => {
    setHeaderWidth(headerRef.current?.clientWidth ?? 0);
    setByUser(user);
    setQuery("");
    setTerm("");
    setTab("all");
    setActive(0);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    if (byUser) triggerRef.current?.focus({ preventScroll: true });
  };
  const run = (text: string) => {
    setQuery(text);
    setTerm(text);
    setActive(0);
  };

  // 지금 보이는 행. 키보드 이동과 가리킨 행 표시가 같은 순서를 쓴다
  const matched = term ? ranked(term) : [];
  const inTab =
    group === "tabs" && tab !== "all"
      ? matched.filter((entry) => entry.kind === tab)
      : matched;
  const sections: { id: string; title?: string; rows: Entry[] }[] = !term
    ? before === "jump"
      ? jumps.map(({ section, ids: list }) => ({
          id: section,
          title: section,
          rows: list.map(byId),
        }))
      : []
    : group === "kind"
      ? kinds
          .map((kind) => ({
            id: kind.id,
            title: kind.label,
            rows: matched.filter((entry) => entry.kind === kind.id),
          }))
          .filter((section) => section.rows.length)
      : [{ id: "all", rows: inTab }];
  const rows =
    !term && before === "recent"
      ? recent.map((text) => ({
          id: `r-${text}`,
          kind: "doc" as Kind,
          title: text,
        }))
      : sections.flatMap((section) => section.rows);
  const activeId = rows[Math.min(active, rows.length - 1)]?.id;

  useDemo((tick) => {
    const step = (tick - 1) % 5;
    if (step === 0) show(false);
    if (step in demoQueries) setQuery(demoQueries[step]);
    if (step === 3) setActive((value) => Math.min(value + 1, rows.length - 1));
    if (step === 4) close();
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const move = event.key === "ArrowDown" ? 1 : -1;
      setActive((value) =>
        rows.length ? (value + move + rows.length) % rows.length : 0,
      );
    } else if (event.key === "Enter" && event.target === inputRef.current) {
      event.preventDefault();
      const row = rows.find((item) => item.id === activeId);
      if (row?.id.startsWith("r-")) run(row.title);
      else if (row) close();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const collapse = { duration: seconds(180), ease: EASE_OUT_CUBIC };
  const follow = { duration: seconds(120), ease: EASE_OUT_CUBIC };

  const row = ({
    entry,
    onPick,
    icon: Icon,
    aside,
    trailing,
  }: {
    entry: Entry;
    onPick: () => void;
    icon: LucideIcon;
    aside?: string;
    trailing?: React.ReactNode;
  }) => {
    const isActive = entry.id === activeId;
    return (
      <motion.li
        key={entry.id}
        role="option"
        aria-selected={isActive}
        className="gs-item"
        layout="position"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={collapse}
      >
        <div
          className="gs-row"
          onPointerMove={() =>
            setActive(rows.findIndex((item) => item.id === entry.id))
          }
          onClick={onPick}
        >
          {isActive && (
            <motion.span
              className="gs-highlight"
              layoutId={`${ids}-highlight`}
              transition={follow}
            />
          )}
          <Icon size={16} strokeWidth={1.75} aria-hidden />
          <span className="gs-row-title">
            <Title text={entry.title} term={term} />
          </span>
          {aside && <span className="gs-row-aside">{aside}</span>}
          {keys === "row" && isActive && <kbd className="gs-kbd">Enter</kbd>}
        </div>
        {trailing}
      </motion.li>
    );
  };

  const resultList = () => {
    if (!term && before === "hint")
      return <p className="gs-hint">문서, 사람, 명령을 찾을 수 있어요</p>;
    if (!term && before === "recent") {
      return (
        <section className="gs-section">
          <h4>최근 검색</h4>
          <ul role="listbox" aria-label="최근 검색">
            <AnimatePresence initial={false}>
              {rows.map((entry) =>
                row({
                  entry,
                  onPick: () => run(entry.title),
                  icon: Clock,
                  trailing: (
                    <button
                      type="button"
                      className="gs-remove"
                      aria-label={`최근 검색 ${entry.title} 지우기`}
                      onClick={() =>
                        setRecent((list) =>
                          list.filter((item) => item !== entry.title),
                        )
                      }
                    >
                      <X size={14} strokeWidth={1.75} />
                    </button>
                  ),
                }),
              )}
            </AnimatePresence>
          </ul>
        </section>
      );
    }
    if (term && !rows.length) {
      return (
        <div className="gs-empty" role="status">
          <p>"{term}"와 맞는 결과가 없어요</p>
          <button type="button" className="gs-button" onClick={() => run("")}>
            검색어 지우기
          </button>
        </div>
      );
    }
    return (
      <AnimatePresence initial={false}>
        {sections.map((section) => (
          <motion.section
            key={section.id}
            className="gs-section"
            layout="position"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={collapse}
          >
            {section.title && <h4>{section.title}</h4>}
            <ul role="listbox" aria-label={section.title ?? "검색 결과"}>
              <AnimatePresence initial={false}>
                {section.rows.map((entry) =>
                  row({
                    entry,
                    onPick: close,
                    icon: kindOf(entry.kind).icon,
                    aside:
                      term && group !== "kind"
                        ? kindOf(entry.kind).label
                        : undefined,
                  }),
                )}
              </AnimatePresence>
            </ul>
          </motion.section>
        ))}
      </AnimatePresence>
    );
  };

  const input = (
    <div className="gs-input">
      <SearchIcon size={18} strokeWidth={1.75} aria-hidden />
      <input
        ref={inputRef}
        type="search"
        aria-label="전체 검색"
        placeholder="문서, 사람, 명령 찾기"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </div>
  );

  const body = (
    <>
      {group === "tabs" && term && (
        <div className="gs-tabs" role="tablist" aria-label="결과 종류">
          {[{ id: "all" as const, label: "전체" }, ...kinds].map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className="gs-tab"
              onClick={() => {
                setTab(item.id);
                setActive(0);
              }}
            >
              {tab === item.id && (
                <motion.span
                  className="gs-tab-face"
                  layoutId={`${ids}-tab`}
                  transition={{ duration: seconds(200), ease: EASE_OUT_CUBIC }}
                />
              )}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="gs-body">
        <LayoutGroup id={`${ids}-rows`}>{resultList()}</LayoutGroup>
      </div>
      {keys === "footer" && (
        <p className="gs-footer">
          <span>
            <kbd className="gs-kbd">↑</kbd>
            <kbd className="gs-kbd">↓</kbd> 이동
          </span>
          <span>
            <kbd className="gs-kbd">Enter</kbd> 열기
          </span>
          <span>
            <kbd className="gs-kbd">Esc</kbd> 닫기
          </span>
        </p>
      )}
    </>
  );

  const paletteTiming = { duration: seconds(300), ease: EASE_OUT_CUBIC };
  const panelTiming = { duration: seconds(140), ease: EASE_OUT_CUBIC };
  const growTiming = { duration: seconds(220), ease: EASE_OUT_CUBIC };
  const closedWidth = 84;

  return (
    <div
      className="gs-frame"
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          if (open) close();
          else show(true);
        } else if (open) {
          onKeyDown(event);
        }
      }}
    >
      <div className="gs-header" ref={headerRef}>
        <span className="gs-logo">틈</span>
        <span className="gs-title">홈</span>
        <button
          ref={triggerRef}
          type="button"
          className="gs-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? close() : show(true))}
        >
          <SearchIcon size={16} strokeWidth={1.75} aria-hidden />
          검색
          <kbd className="gs-kbd">⌘K</kbd>
        </button>
      </div>
      <div className="gs-content">
        <h4>최근 문서</h4>
        {[
          "10월 예산안",
          "디자인 시스템 정리",
          "분기 보고서 초안",
          "신규 입사자 안내",
        ].map((title) => (
          <div key={title} className="gs-content-row">
            <FileText size={16} strokeWidth={1.75} aria-hidden />
            {title}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {open && place === "palette" && (
          <motion.div
            key="palette"
            className="gs-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: paletteTiming }}
            exit={{ opacity: 0, transition: paletteTiming }}
          >
            <div className="gs-backdrop" onClick={close} />
            <motion.div
              role="dialog"
              aria-label="전체 검색"
              className="gs-panel gs-palette"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1, transition: paletteTiming }}
              exit={{ opacity: 0, scale: 0.96, transition: paletteTiming }}
            >
              {input}
              {body}
            </motion.div>
          </motion.div>
        )}

        {open && place === "expand" && (
          <motion.div
            key="expand"
            className="gs-expand"
            initial={{ width: closedWidth, opacity: 0 }}
            animate={{
              width: headerWidth - 16,
              opacity: 1,
              transition: growTiming,
            }}
            exit={{ width: closedWidth, opacity: 0, transition: growTiming }}
          >
            {input}
            <button
              type="button"
              className="gs-close"
              aria-label="검색 닫기"
              onClick={close}
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </motion.div>
        )}
        {open && place === "expand" && (
          <motion.div
            key="expand-panel"
            role="dialog"
            aria-label="전체 검색 결과"
            className="gs-panel gs-dropdown"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1, transition: panelTiming }}
            exit={{ opacity: 0, scale: 0.96, transition: panelTiming }}
          >
            {body}
          </motion.div>
        )}

        {open && place === "screen" && (
          <motion.div
            key="screen"
            role="dialog"
            aria-label="전체 검색"
            className="gs-panel gs-screen"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0, transition: growTiming }}
            exit={{ opacity: 0, x: 24, transition: growTiming }}
          >
            <div className="gs-screen-bar">
              {input}
              <button type="button" className="gs-button" onClick={close}>
                닫기
              </button>
            </div>
            {body}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
