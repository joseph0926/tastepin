import { useId, useLayoutEffect, useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { ProjectFacts, projects } from "./ProjectExamples";
import "./SpecimenExtensions.css";

export default function ListDetail({ params }: SpecimenProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const userAction = useRef(false);
  const returnTo = useRef("");
  const scrollTop = useRef(0);
  const id = useId();
  const project = projects.find((item) => item.id === selected);
  const select = (projectId: string, byUser: boolean) => {
    if (listRef.current) scrollTop.current = listRef.current.scrollTop;
    returnTo.current = projectId;
    userAction.current = byUser;
    setSelected(projectId);
  };
  const close = (byUser: boolean) => {
    userAction.current = byUser;
    setSelected(null);
  };
  useLayoutEffect(() => {
    if (!selected && listRef.current)
      listRef.current.scrollTop = scrollTop.current;
    if (!userAction.current) return;
    if (selected) headingRef.current?.focus({ preventScroll: true });
    else
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-project="${returnTo.current}"]`)
        ?.focus({ preventScroll: true });
    userAction.current = false;
  }, [selected]);
  useDemo((tick) => {
    const step = tick % 5;
    if (step > 0 && step < 4) select(projects[[0, 1, 5][step - 1]].id, false);
    else close(false);
  });
  const detail = project && (
    <section
      id={`${id}-detail`}
      className="sx-detail"
      aria-labelledby={`${id}-title`}
    >
      <button type="button" className="mfd-button" onClick={() => close(true)}>
        {params.view === "page" ? "목록으로" : "상세 닫기"}
      </button>
      <h4 id={`${id}-title`} ref={headingRef} tabIndex={-1}>
        {project.name}
      </h4>
      <p>{project.description}</p>
      <ProjectFacts project={project} />
      <div className="sx-actions">
        <button
          type="button"
          className="mfd-button"
          onClick={() =>
            select(
              projects[
                (projects.findIndex((item) => item.id === selected) +
                  projects.length -
                  1) %
                  projects.length
              ].id,
              true,
            )
          }
        >
          이전 항목
        </button>
        <button
          type="button"
          className="mfd-button"
          onClick={() =>
            select(
              projects[
                (projects.findIndex((item) => item.id === selected) + 1) %
                  projects.length
              ].id,
              true,
            )
          }
        >
          다음 항목
        </button>
      </div>
    </section>
  );
  return (
    <div className="sx-stage" ref={rootRef}>
      <h3>프로젝트</h3>
      <div
        className="sx-detail-layout"
        data-view={params.view}
        data-open={Boolean(project)}
      >
        {!(params.view === "page" && project) && (
          <div className="sx-project-list" ref={listRef}>
            <ul>
              {projects.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="sx-project-trigger"
                    data-project={item.id}
                    aria-current={selected === item.id ? "true" : undefined}
                    aria-expanded={
                      params.view === "inline"
                        ? selected === item.id
                        : undefined
                    }
                    aria-controls={
                      selected === item.id ? `${id}-detail` : undefined
                    }
                    onClick={() =>
                      selected === item.id && params.view === "inline"
                        ? close(true)
                        : select(item.id, true)
                    }
                  >
                    <b>{item.name}</b>
                    <span>
                      {item.owner} / {item.status}
                    </span>
                  </button>
                  {params.view === "inline" && selected === item.id && detail}
                </li>
              ))}
            </ul>
          </div>
        )}
        {params.view !== "inline" && detail}
      </div>
    </div>
  );
}
