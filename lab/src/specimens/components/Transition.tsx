import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useIsPresent,
  useReducedMotion,
  type TargetAndTransition,
} from "motion/react";
import { ChevronLeft, FileText, LoaderCircle } from "lucide-react";
import { EASE_OUT_CUBIC, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import "./Transition.css";
import { blogPosts } from "./blogPosts";
import "./Blog.css";

// params: kind(shared | near | fade), back(mirror | fade | instant), pending(wait | skeleton | bar), scroll(restore | top)
// 휴대폰 크기의 앱 틀 안에서 목록과 상세를 오간다. 상세 내용은 600ms 뒤에 '도착'한다고 흉내 낸다.

const docs = Array.from({ length: 12 }, (_, index) => ({
  id: `doc-${index + 1}`,
  title:
    [
      "10월 예산안",
      "디자인 리뷰 회의록",
      "신규 입사자 안내",
      "분기 보고서 초안",
      "회의실 예약 규칙",
      "보안 점검 목록",
    ][index % 6] + (index >= 6 ? " (사본)" : ""),
  meta: `${["박서윤", "이도윤", "최민준", "김하늘"][index % 4]}, 10월 ${18 - index}일`,
}));
const LOAD_MS = 600;
const HIGHLIGHT_MS = 1000;

// 시연 순서: 목록 내리기, 항목 열기, 기다리기, 뒤로, 기다리기, 처음으로
const demoSteps = ["scroll", "open", "wait", "back", "wait", "reset"] as const;

export default function Transition({ params }: SpecimenProps) {
  const [view, setView] = useState<"list" | "detail">("list");
  const [current, setCurrent] = useState(docs[0]);
  const [loading, setLoading] = useState<string | null>(null);
  const [arrived, setArrived] = useState(true);
  const [direction, setDirection] = useState(1);
  const [highlight, setHighlight] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const savedTop = useRef(0);
  const timers = useRef<number[]>([]);
  const groupId = useId();
  const seconds = useSeconds();
  const { kind, back, pending, scroll } = params;

  const later = (ms: number, run: () => void) =>
    timers.current.push(window.setTimeout(run, seconds(ms) * 1000));

  const open = (doc: (typeof docs)[number]) => {
    savedTop.current = listRef.current?.scrollTop ?? 0;
    setCurrent(doc);
    setDirection(1);
    if (pending === "skeleton") {
      setArrived(false);
      setView("detail");
      later(LOAD_MS, () => setArrived(true));
    } else {
      // 다 오면 전환, 위 진행 막대: 내용이 올 때까지 목록에 머문다
      setLoading(doc.id);
      later(LOAD_MS, () => {
        setLoading(null);
        setArrived(true);
        setView("detail");
      });
    }
  };

  const goBack = () => {
    setDirection(-1);
    setView("list");
    if (scroll === "restore") {
      setHighlight(current.id);
      later(HIGHLIGHT_MS, () => setHighlight(null));
    }
  };

  // 목록이 다시 그려질 때 보던 자리로 돌아가거나 맨 위에서 시작한다
  useLayoutEffect(() => {
    if (view === "list" && listRef.current)
      listRef.current.scrollTop = scroll === "restore" ? savedTop.current : 0;
  }, [view, scroll]);

  useDemo((tick) => {
    const step = demoSteps[(tick - 1) % demoSteps.length];
    if (step === "scroll")
      listRef.current?.scrollTo({ top: 220, behavior: "smooth" });
    if (step === "open") open(docs[6]);
    if (step === "back" && view === "detail") goBack();
    if (step === "reset") {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      setView("list");
      setLoading(null);
      setHighlight(null);
      savedTop.current = 0;
      listRef.current?.scrollTo({ top: 0 });
    }
  });

  // 뒤로 갈 때 값: 같은 길 거꾸로는 들어온 전환을 그대로 쓰고 방향만 뒤집는다
  const style = direction < 0 && back !== "mirror" ? back : kind;
  const duration =
    style === "instant" ? 0 : seconds(style === "fade" ? 200 : 240);
  const timing = { duration, ease: EASE_OUT_CUBIC };
  const slide = (side: number): TargetAndTransition =>
    style === "near" ? { opacity: 0, x: 24 * side } : { opacity: 0 };
  const enterFrom = slide(direction);
  const exitTo = slide(-direction);
  const shared = kind === "shared" && style === "shared";

  return (
    <div className="trn-page">
      <div className="trn-frame">
        {pending === "bar" && loading && (
          <div className="trn-bar" role="progressbar" aria-label="불러오는 중">
            <span />
          </div>
        )}
        <LayoutGroup id={groupId}>
          <AnimatePresence initial={false} custom={direction}>
            {view === "list" ? (
              <motion.div
                key="list"
                className="trn-view"
                initial={enterFrom}
                animate={{ opacity: 1, x: 0 }}
                exit={exitTo}
                transition={timing}
              >
                <header className="trn-header">
                  <b>문서</b>
                </header>
                <div ref={listRef} className="trn-scroll">
                  <ul className="trn-list">
                    {docs.map((doc) => (
                      <li key={doc.id}>
                        <button
                          type="button"
                          className={
                            highlight === doc.id
                              ? "trn-row is-highlight"
                              : "trn-row"
                          }
                          onClick={() => open(doc)}
                        >
                          <motion.span
                            layoutId={shared ? `${doc.id}-icon` : undefined}
                            className="trn-icon"
                            transition={timing}
                          >
                            <FileText
                              size={16}
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          </motion.span>
                          <motion.span
                            layoutId={shared ? `${doc.id}-title` : undefined}
                            className="trn-title"
                            transition={timing}
                          >
                            {doc.title}
                          </motion.span>
                          {pending === "wait" && loading === doc.id ? (
                            <LoaderCircle
                              className="trn-spin"
                              size={16}
                              strokeWidth={1.75}
                              aria-label="불러오는 중"
                            />
                          ) : (
                            <span className="trn-meta">{doc.meta}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="detail"
                className="trn-view"
                initial={enterFrom}
                animate={{ opacity: 1, x: 0 }}
                exit={exitTo}
                transition={timing}
              >
                <header className="trn-header">
                  <button
                    type="button"
                    className="trn-back"
                    aria-label="목록으로"
                    onClick={goBack}
                  >
                    <ChevronLeft size={20} strokeWidth={1.75} />
                  </button>
                </header>
                <article className="trn-detail">
                  <div className="trn-detail-head">
                    <motion.span
                      layoutId={shared ? `${current.id}-icon` : undefined}
                      className="trn-icon is-large"
                      transition={timing}
                    >
                      <FileText size={22} strokeWidth={1.75} aria-hidden />
                    </motion.span>
                    <motion.h4
                      layoutId={shared ? `${current.id}-title` : undefined}
                      transition={timing}
                    >
                      {current.title}
                    </motion.h4>
                  </div>
                  {arrived ? (
                    <motion.div
                      initial={shared ? { opacity: 0 } : false}
                      animate={{ opacity: 1 }}
                      transition={timing}
                    >
                      <p className="trn-meta">
                        {current.meta}에 마지막으로 고침
                      </p>
                      <p>
                        이 문서는 팀 공개예요. 편집은 초대한 사람만 할 수
                        있어요.
                      </p>
                      <p>
                        이번 달 예산은 지난달보다 회의실 비용이 줄고 외부 손님
                        응대 비용이 늘었어요. 자세한 항목은 아래 표에 있어요.
                      </p>
                    </motion.div>
                  ) : (
                    <div className="trn-skeleton" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                </article>
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </div>
  );
}

// 기존 문서 전환과 같은 layoutId 방식을 긴 질문형 제목에 적용한다.
export function BlogTransition({ params }: SpecimenProps) {
  const [detail, setDetail] = useState(false);
  const seconds = useSeconds();
  const reduced = useReducedMotion();
  const groupId = useId();
  const duration = reduced
    ? 0
    : seconds(
        ({ quick: 180, regular: 300, slow: 450 } as Record<string, number>)[
          params.duration
        ] ?? 300,
      );
  const delay = params.content === "after" ? duration : 0;
  const post = blogPosts[0];
  useDemo((tick) => setDetail(tick % 3 !== 0));

  const title = (
    <motion.span
      className="blog-transition-title"
      layoutId="post-title"
      transition={{ duration, ease: EASE_OUT_CUBIC }}
    >
      {post.title}
    </motion.span>
  );

  return (
    <div className="blog-sample blog-transition">
      <LayoutGroup id={groupId}>
        <AnimatePresence initial={false}>
          {detail ? (
            <BlogTransitionScreen
              key="detail"
              duration={reduced ? 0 : seconds(120)}
            >
              <button
                type="button"
                className="blog-button"
                onClick={() => setDetail(false)}
              >
                모든 글로
              </button>
              <article className="blog-transition-article">
                <h3 className="blog-transition-heading">{title}</h3>
                <motion.div
                  className="blog-transition-body"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay, duration: reduced ? 0 : seconds(180) }}
                >
                  <p className="blog-meta">
                    {post.date}, {post.readingTime}분
                  </p>
                  <p>{post.description}</p>
                  <p>
                    주소와 화면이 각각 조건을 갖고 있었습니다. 입력 중인 값은
                    검색창에 남기고, 확정한 조건은 주소에서 읽도록 바꿨습니다.
                  </p>
                </motion.div>
              </article>
            </BlogTransitionScreen>
          ) : (
            <BlogTransitionScreen
              key="list"
              duration={reduced ? 0 : seconds(120)}
            >
              <p className="blog-meta">최근에 쓴 글</p>
              <button
                type="button"
                className="blog-transition-open"
                onClick={() => setDetail(true)}
              >
                {title}
                <span className="blog-meta">
                  {post.date}, {post.readingTime}분
                </span>
              </button>
              <p className="blog-transition-other">{blogPosts[1].title}</p>
            </BlogTransitionScreen>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}

function BlogTransitionScreen({
  children,
  duration,
}: {
  children: ReactNode;
  duration: number;
}) {
  const present = useIsPresent();
  return (
    <motion.div
      className="blog-transition-screen"
      inert={!present}
      aria-hidden={!present || undefined}
      initial={false}
      exit={{ opacity: 0 }}
      transition={{ duration }}
    >
      {children}
    </motion.div>
  );
}
