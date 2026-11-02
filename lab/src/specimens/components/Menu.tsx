import { useEffect, useId, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  type TargetAndTransition,
} from "motion/react";
import {
  Copy,
  FileText,
  FolderInput,
  MoreHorizontal,
  PenLine,
  Trash2,
} from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Menu.css";

// params: enter(origin | drop | instant), highlight(fill | follow | accent), density(compact | roomy)
// 열기, 닫기, 화살표 이동, Enter, Escape, 바깥 누름은 직접 구현했다. 실제 화면에서는 프로젝트의
// 메뉴 프리미티브(Radix DropdownMenu 등)에 맡기고 모양과 모션 값만 옮긴다.

const items = [
  { id: "rename", label: "이름 바꾸기", icon: PenLine },
  { id: "duplicate", label: "복제", icon: Copy },
  { id: "move", label: "다른 폴더로 이동", icon: FolderInput },
  { id: "delete", label: "삭제", icon: Trash2, danger: true, separated: true },
];

const files = [
  { name: "3분기 회고.md", meta: "어제 수정" },
  { name: "온보딩 체크리스트.md", meta: "10월 2일 수정" },
];

const enterPaths: Record<
  string,
  {
    from: TargetAndTransition;
    exit: TargetAndTransition;
    open: number;
    close: number;
  }
> = {
  origin: {
    from: { opacity: 0, scale: 0.96 },
    exit: { opacity: 0, scale: 0.96 },
    open: 140,
    close: 140,
  },
  drop: {
    from: { opacity: 0, y: -4 },
    exit: { opacity: 0, y: -4 },
    open: 140,
    close: 140,
  },
  instant: { from: { opacity: 1 }, exit: { opacity: 0 }, open: 0, close: 0 },
};

// 시연 순서: 열기, 아래로 세 번 이동, 닫기
const DEMO_LENGTH = 5;

export default function Menu({ params }: SpecimenProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [byKeyboard, setByKeyboard] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const seconds = useSeconds();
  const menuId = useId();
  const path = enterPaths[params.enter] ?? enterPaths.origin;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setActive(-1);
    if (returnFocus) triggerRef.current?.focus();
  };

  useDemo((tick) => {
    const step = (tick - 1) % DEMO_LENGTH;
    setByKeyboard(false);
    if (step === 0) {
      setOpen(true);
      setActive(-1);
    } else if (step === DEMO_LENGTH - 1) {
      close(false);
    } else {
      setActive(step - 1);
    }
  });

  useEffect(() => {
    if (open && byKeyboard && active >= 0) itemRefs.current[active]?.focus();
  }, [open, byKeyboard, active]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "Enter" && event.key !== " ")
      return;
    event.preventDefault();
    setByKeyboard(true);
    setOpen(true);
    setActive(0);
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in moves) {
      event.preventDefault();
      setByKeyboard(true);
      setActive(
        (current) => (current + moves[event.key] + items.length) % items.length,
      );
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close(true);
    }
  };

  return (
    <div className="menu-page">
      <h3 className="menu-heading">최근 문서</h3>
      <ul className="menu-files">
        {files.map((file, index) => (
          <li key={file.name}>
            <FileText size={18} strokeWidth={1.75} aria-hidden="true" />
            <span className="menu-file-name">{file.name}</span>
            <span className="menu-file-meta">{file.meta}</span>
            {index === 0 ? (
              <div className="menu-anchor" ref={rootRef}>
                <button
                  ref={triggerRef}
                  type="button"
                  className={`menu-trigger${open ? " is-open" : ""}`}
                  aria-label="문서 메뉴"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  aria-controls={menuId}
                  onClick={() => {
                    setByKeyboard(false);
                    if (open) close(false);
                    else setOpen(true);
                  }}
                  onKeyDown={onTriggerKeyDown}
                >
                  <MoreHorizontal size={18} strokeWidth={1.75} />
                </button>
                <AnimatePresence>
                  {open && (
                    <motion.div
                      id={menuId}
                      role="menu"
                      className={`menu density-${params.density} highlight-${params.highlight}`}
                      initial={path.from}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        y: 0,
                        transition: {
                          duration: seconds(path.open),
                          ease: EASE_OUT,
                        },
                      }}
                      exit={{
                        ...path.exit,
                        transition: {
                          duration: seconds(path.close),
                          ease: EASE_OUT,
                        },
                      }}
                      onKeyDown={onMenuKeyDown}
                      onPointerLeave={() => setActive(-1)}
                    >
                      {items.map((item, itemIndex) => {
                        const Icon = item.icon;
                        const isActive = itemIndex === active;
                        return (
                          <div key={item.id} className="menu-group">
                            {item.separated && (
                              <div
                                className="menu-separator"
                                role="separator"
                              />
                            )}
                            <button
                              ref={(element) => {
                                itemRefs.current[itemIndex] = element;
                              }}
                              type="button"
                              role="menuitem"
                              tabIndex={-1}
                              className={`menu-item${isActive ? " is-active" : ""}${item.danger ? " is-danger" : ""}`}
                              onPointerMove={() => setActive(itemIndex)}
                              onClick={() => close(true)}
                            >
                              {isActive && params.highlight !== "accent" && (
                                <motion.span
                                  className="menu-highlight"
                                  layoutId={
                                    params.highlight === "follow"
                                      ? `${menuId}-highlight`
                                      : undefined
                                  }
                                  transition={{
                                    duration: seconds(120),
                                    ease: EASE_OUT,
                                  }}
                                />
                              )}
                              <Icon
                                className="menu-icon"
                                size={16}
                                strokeWidth={1.75}
                                aria-hidden="true"
                              />
                              <span className="menu-label">{item.label}</span>
                            </button>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <span className="menu-anchor" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
