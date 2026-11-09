import { useId, useRef, useState } from "react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import { ProjectFacts, projects } from "./ProjectExamples";
import "./SpecimenExtensions.css";

export default function MobileTable({ params }: SpecimenProps) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useDemo((tick) => {
    const step = tick % 4;
    const scroller = scrollerRef.current;
    if (step === 1) {
      setExpanded([projects[0].id]);
      if (scroller) {
        scroller.scrollLeft = scroller.scrollWidth;
        scroller.scrollTop = scroller.scrollHeight / 2;
      }
    }
    if (step === 2) {
      setExpanded([projects[0].id, projects[5].id]);
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }
    if (step === 0 || step === 3) {
      setExpanded([]);
      if (scroller) {
        scroller.scrollLeft = 0;
        scroller.scrollTop = 0;
      }
    }
  });
  const toggle = (projectId: string) =>
    setExpanded((current) =>
      current.includes(projectId)
        ? current.filter((item) => item !== projectId)
        : [...current, projectId],
    );
  return (
    <div className="sx-stage sx-mobile-frame">
      <h3>프로젝트 현황</h3>
      <p className="sx-small">6개 프로젝트</p>
      <div
        className="sx-table-scroll"
        ref={scrollerRef}
        tabIndex={0}
        role="region"
        aria-label="프로젝트 현황, 스크롤하여 더 보기"
      >
        {params.layout === "cards" ? (
          <ul className="sx-project-cards">
            {projects.map((project) => (
              <li key={project.id}>
                <h4>{project.name}</h4>
                <ProjectFacts project={project} />
              </li>
            ))}
          </ul>
        ) : (
          <table className="sx-table" data-layout={params.layout}>
            <caption>프로젝트 현황</caption>
            <thead>
              <tr>
                <th scope="col">프로젝트</th>
                {params.layout === "scroll" && <th scope="col">담당자</th>}
                <th scope="col">상태</th>
                {params.layout === "scroll" ? (
                  <>
                    <th scope="col">마감</th>
                    <th scope="col">진행률</th>
                    <th scope="col">예산</th>
                  </>
                ) : (
                  <th scope="col">상세</th>
                )}
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <ProjectRows
                  key={project.id}
                  project={project}
                  layout={params.layout}
                  expanded={expanded.includes(project.id)}
                  detailId={`${id}-${project.id}`}
                  onToggle={() => toggle(project.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ProjectRows({
  project,
  layout,
  expanded,
  detailId,
  onToggle,
}: {
  project: (typeof projects)[number];
  layout: string;
  expanded: boolean;
  detailId: string;
  onToggle: () => void;
}) {
  return (
    <>
      <tr>
        <th scope="row">{project.name}</th>
        {layout === "scroll" && <td>{project.owner}</td>}
        <td>{project.status}</td>
        {layout === "scroll" ? (
          <>
            <td>{project.due}</td>
            <td>{project.progress}</td>
            <td>{project.budget}</td>
          </>
        ) : (
          <td>
            <button
              type="button"
              className="sx-text-button"
              aria-expanded={expanded}
              aria-controls={expanded ? detailId : undefined}
              aria-label={`${project.name} 상세 ${expanded ? "닫기" : "보기"}`}
              onClick={onToggle}
            >
              {expanded ? "접기" : "보기"}
            </button>
          </td>
        )}
      </tr>
      {layout === "summary" && expanded && (
        <tr id={detailId}>
          <td colSpan={3}>
            <ProjectFacts project={project} />
          </td>
        </tr>
      )}
    </>
  );
}
