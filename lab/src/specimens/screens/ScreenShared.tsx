import type { ReactNode, RefObject, UIEventHandler } from "react";
import "./Screens.css";

export function ScreenFrame({
  title,
  section = "프로젝트",
  actions,
  children,
  scrollRef,
  onScroll,
  headerExtra,
  overlay,
  blocked = false,
}: {
  title: string;
  section?: string;
  actions?: ReactNode;
  children: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
  onScroll?: UIEventHandler<HTMLDivElement>;
  headerExtra?: ReactNode;
  overlay?: ReactNode;
  blocked?: boolean;
}) {
  return (
    <section className="sc-screen" aria-label={title}>
      <header className="sc-app-bar" inert={blocked}>
        <strong>작업 공간</strong>
        <span>{section}</span>
      </header>
      {headerExtra}
      <div
        className="sc-scroll"
        ref={scrollRef}
        onScroll={onScroll}
        inert={blocked}
      >
        <header className="sc-page-head">
          <h3>{title}</h3>
          {actions && <div className="sc-actions">{actions}</div>}
        </header>
        {children}
      </div>
      {overlay}
    </section>
  );
}

export function ScreenStatus({ children }: { children?: ReactNode }) {
  return (
    <p className="sc-status" role="status">
      {children}
    </p>
  );
}
