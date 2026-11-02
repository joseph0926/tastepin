import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CalendarDays, House, Menu, User, X } from "lucide-react";
import { EASE_OUT, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Nav.css";

// params: scroll(sticky | hide | static), edge(line | shadow | tone), menu(sheet | dropdown | tabbar), current(tone | weight | accent)
// 휴대폰 크기의 앱 틀을 무대 안에 그리고, 본문은 틀 안에서 스크롤한다. 메뉴 패널도 틀 기준 absolute로 그린다.

const items = [
  { id: "home", label: "홈", Icon: House },
  { id: "booking", label: "예약", Icon: CalendarDays },
  { id: "alerts", label: "알림", Icon: Bell },
  { id: "me", label: "내 정보", Icon: User },
];

const paragraphs = [
  "회의실은 30분 단위로 예약할 수 있어요. 시작 10분 전까지 입실하지 않으면 다음 사람에게 넘어가요.",
  "반복 예약은 최대 8주까지 잡을 수 있어요. 공휴일은 자동으로 빠지고, 빠진 날은 예약 목록에 회색으로 남아요.",
  "외부 손님이 오는 회의는 손님 이름을 적어 두면 안내 데스크에서 출입증을 미리 준비해요.",
  "예약을 바꾸거나 취소하면 참석자에게 알림이 가요. 시작 1시간 전부터는 취소 대신 '불참'으로만 바꿀 수 있어요.",
  "회의실마다 화면, 화상 장비, 화이트보드 여부가 달라요. 목록에서 필요한 장비를 먼저 골라 거르면 맞는 방만 보여요.",
  "자주 쓰는 방은 즐겨찾기에 넣어 두면 예약 화면 맨 위에 보여요.",
];

// 시연 순서: 아래로 스크롤, 조금 위로, 메뉴 열기, 알림 고르기, 맨 위로, 예약으로 돌아가기
const demoSteps = ["down", "up", "open", "alerts", "top", "booking"] as const;

export default function Nav({ params }: SpecimenProps) {
  const [current, setCurrent] = useState("booking");
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTop = useRef(0);
  const seconds = useSeconds();
  const { scroll, edge, menu, current: marker } = params;
  const label = items.find((item) => item.id === current)?.label;

  const pick = (id: string) => {
    setCurrent(id);
    setOpen(false);
  };

  useDemo((tick) => {
    const step = demoSteps[(tick - 1) % demoSteps.length];
    const box = scrollRef.current;
    if (step === "down") box?.scrollTo({ top: 260, behavior: "smooth" });
    if (step === "up") box?.scrollTo({ top: 150, behavior: "smooth" });
    if (step === "open" && menu !== "tabbar") setOpen(true);
    if (step === "alerts" || step === "booking") pick(step);
    if (step === "top") box?.scrollTo({ top: 0, behavior: "smooth" });
  });

  const onScroll = () => {
    const top = scrollRef.current?.scrollTop ?? 0;
    setScrolled(top > 0);
    // 내리면 숨김: 4px 넘게 움직였을 때만 방향을 바꿔 작은 떨림에 반응하지 않는다
    if (top < 56) setHidden(false);
    else if (top > lastTop.current + 4) setHidden(true);
    else if (top < lastTop.current - 4) setHidden(false);
    if (Math.abs(top - lastTop.current) > 4) lastTop.current = top;
  };

  const slide = { duration: seconds(200), ease: EASE_OUT };
  const navItems = (className: string) =>
    items.map(({ id, label: name, Icon }) => (
      <button
        key={id}
        type="button"
        className={id === current ? `${className} is-current` : className}
        aria-current={id === current ? "page" : undefined}
        onClick={() => pick(id)}
      >
        <Icon size={18} strokeWidth={1.75} aria-hidden />
        <span>{name}</span>
      </button>
    ));

  return (
    <div
      className="nav-page"
      data-scroll={scroll}
      data-edge={edge}
      data-menu={menu}
      data-current={marker}
    >
      <div
        className="nav-frame"
        onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
      >
        <div ref={scrollRef} className="nav-scroll" onScroll={onScroll}>
          <motion.header
            className={scrolled ? "nav-header is-scrolled" : "nav-header"}
            initial={false}
            animate={{
              y: scroll === "hide" && hidden && !open ? "-100%" : "0%",
            }}
            transition={slide}
          >
            <b className="nav-logo">틈</b>
            <span className="nav-title">{label}</span>
            {menu !== "tabbar" && (
              <button
                type="button"
                className="nav-menu-button"
                aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
              >
                {open && menu === "dropdown" ? (
                  <X size={20} strokeWidth={1.75} />
                ) : (
                  <Menu size={20} strokeWidth={1.75} />
                )}
              </button>
            )}
          </motion.header>
          <article className="nav-content">
            <h4>{label} 안내</h4>
            {paragraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </article>
        </div>

        {menu === "tabbar" && (
          <nav className="nav-tabbar" aria-label="주 메뉴">
            {navItems("nav-tab")}
          </nav>
        )}

        <AnimatePresence>
          {open && menu === "sheet" && (
            <motion.div key="sheet" className="nav-layer">
              <motion.div
                className="nav-dim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: seconds(220), ease: EASE_OUT }}
                onClick={() => setOpen(false)}
              />
              <motion.nav
                className="nav-sheet"
                aria-label="주 메뉴"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ duration: seconds(220), ease: EASE_OUT }}
              >
                <button
                  type="button"
                  className="nav-close"
                  aria-label="메뉴 닫기"
                  onClick={() => setOpen(false)}
                >
                  <X size={20} strokeWidth={1.75} />
                </button>
                {navItems("nav-item")}
              </motion.nav>
            </motion.div>
          )}
          {open && menu === "dropdown" && (
            <motion.nav
              key="dropdown"
              className="nav-dropdown"
              aria-label="주 메뉴"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: seconds(160), ease: EASE_OUT }}
            >
              {navItems("nav-item")}
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
