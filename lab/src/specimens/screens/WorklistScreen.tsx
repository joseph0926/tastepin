import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import { projects, ProjectFacts } from "../components/ProjectExamples";
import { ScreenFrame, ScreenStatus } from "./ScreenShared";

const PAGE_SIZE = 3;

export default function WorklistScreen({ params }: SpecimenProps) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const timer = useRef<number>(undefined);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);
  const backTo = useRef("");
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const userNavigation = useRef(false);
  const id = useId();
  const seconds = useSeconds();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!userNavigation.current) return;
    if (detailId) detailHeadingRef.current?.focus({ preventScroll: true });
    else {
      if (scrollRef.current)
        scrollRef.current.scrollTop = savedScrollTop.current;
      document
        .getElementById(`${id}-menu-${backTo.current}`)
        ?.focus({ preventScroll: true });
    }
    userNavigation.current = false;
  }, [detailId, id]);
  const changeQuery = (value: string) => {
    setQuery(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => {
        setSearch(value);
        setPage(0);
      },
      seconds(200) * 1000,
    );
  };
  const rows = projects
    .map((project) => ({
      ...project,
      status: completed.includes(project.id) ? "완료" : project.status,
    }))
    .filter(
      (project) =>
        project.name.includes(search.trim()) &&
        (!status || project.status === status),
    );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = rows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const detail = projects.find((project) => project.id === detailId);
  const toggle = (projectId: string) =>
    setSelected((current) =>
      current.includes(projectId)
        ? current.filter((item) => item !== projectId)
        : [...current, projectId],
    );
  const complete = () => {
    setCompleted((current) => [...new Set([...current, ...selected])]);
    setMessage(`${selected.length}개 프로젝트를 완료했습니다`);
    setSelected([]);
  };
  useDemo((tick) => {
    const step = tick % 7;
    if (step === 1) {
      setDraft("진행 중");
      setFilterOpen(true);
    }
    if (step === 2) {
      setStatus(draft);
      setPage(0);
      setFilterOpen(false);
    }
    if (step === 3) setSelected(rows.slice(0, 2).map((project) => project.id));
    if (step === 4) complete();
    if (step === 5) {
      setStatus("");
      setPage(1);
    }
    if (step === 6) {
      setDetailId(projects[5].id);
      setMenuId(null);
    }
    if (step === 0) {
      window.clearTimeout(timer.current);
      setQuery("");
      setSearch("");
      setStatus("");
      setDraft("");
      setPage(0);
      setSelected([]);
      setCompleted([]);
      setDetailId(null);
      setFilterOpen(false);
      setMessage("");
    }
  });
  const searchInput = (
    <label className="sc-search" htmlFor={`${id}-search`}>
      <span>프로젝트 검색</span>
      <input
        id={`${id}-search`}
        ref={searchRef}
        type="search"
        value={query}
        onChange={(event) => changeQuery(event.target.value)}
      />
    </label>
  );
  const filter = (
    <button
      ref={filterButtonRef}
      type="button"
      className="mfd-button"
      aria-expanded={filterOpen}
      aria-controls={`${id}-filters`}
      onClick={() => {
        setDraft(status);
        setFilterOpen((current) => !current);
      }}
    >
      필터
    </button>
  );
  return (
    <ScreenFrame
      title={detail ? detail.name : "프로젝트 목록"}
      scrollRef={scrollRef}
    >
      {detail ? (
        <div className="sc-detail-page">
          <button
            type="button"
            className="mfd-button"
            onClick={() => {
              setDetailId(null);
              userNavigation.current = true;
            }}
          >
            목록으로
          </button>
          <h4 ref={detailHeadingRef} tabIndex={-1}>
            프로젝트 상세
          </h4>
          <p>{detail.description}</p>
          <ProjectFacts project={detail} />
        </div>
      ) : (
        <>
          <div className="sc-list-tools" data-layout={params.tools}>
            <div className="sc-list-heading">
              <p>팀에서 진행하는 일을 확인하고 정리합니다.</p>
              {params.tools === "split" && filter}
            </div>
            <div className="sc-search-row">
              {searchInput}
              {params.tools !== "split" && filter}
            </div>
          </div>
          {filterOpen && (
            <fieldset id={`${id}-filters`} className="sc-filter-panel">
              <legend>프로젝트 상태</legend>
              {["", "진행 중", "검토 중", "완료"].map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={`${id}-status`}
                    checked={draft === value}
                    onChange={() => setDraft(value)}
                  />
                  {value || "전체"}
                </label>
              ))}
              <button
                type="button"
                className="mfd-button is-primary"
                onClick={() => {
                  setStatus(draft);
                  setPage(0);
                  setFilterOpen(false);
                  filterButtonRef.current?.focus();
                }}
              >
                적용
              </button>
            </fieldset>
          )}
          {status && (
            <div className="sc-applied">
              <button
                type="button"
                className="sc-chip"
                onClick={() => {
                  setStatus("");
                  setPage(0);
                }}
              >
                상태: {status} 해제 ×
              </button>
            </div>
          )}
          <ScreenStatus>{message || `프로젝트 ${rows.length}개`}</ScreenStatus>
          <div className="sc-table-wrap">
            <table className="sc-table">
              <caption>프로젝트 목록</caption>
              <thead>
                <tr>
                  <th scope="col">선택</th>
                  <th scope="col">프로젝트</th>
                  <th scope="col">담당자</th>
                  <th scope="col">상태</th>
                  <th scope="col">작업</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((project) => (
                  <tr
                    key={project.id}
                    data-selected={selected.includes(project.id)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${project.name} 선택`}
                        checked={selected.includes(project.id)}
                        onChange={() => toggle(project.id)}
                      />
                    </td>
                    <th scope="row">{project.name}</th>
                    <td>{project.owner}</td>
                    <td>{project.status}</td>
                    <td>
                      <div className="sc-row-menu">
                        <button
                          id={`${id}-menu-${project.id}`}
                          type="button"
                          className="sc-text-button"
                          aria-expanded={menuId === project.id}
                          onClick={() => {
                            backTo.current = project.id;
                            setMenuId(
                              menuId === project.id ? null : project.id,
                            );
                          }}
                        >
                          더 보기
                        </button>
                        {menuId === project.id && (
                          <button
                            type="button"
                            className="mfd-button"
                            onClick={() => {
                              userNavigation.current = true;
                              savedScrollTop.current =
                                scrollRef.current?.scrollTop ?? 0;
                              setDetailId(project.id);
                              setMenuId(null);
                            }}
                          >
                            상세 보기
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <div className="sc-empty">
              <p>일치하는 프로젝트가 없습니다.</p>
              <button
                type="button"
                className="mfd-button"
                onClick={() => {
                  window.clearTimeout(timer.current);
                  setQuery("");
                  setSearch("");
                  setStatus("");
                  searchRef.current?.focus();
                }}
              >
                검색과 조건 지우기
              </button>
            </div>
          )}
          <nav className="sc-pagination" aria-label="프로젝트 페이지">
            {Array.from({ length: pageCount }, (_, index) => (
              <button
                type="button"
                key={index}
                aria-current={currentPage === index ? "page" : undefined}
                className="mfd-button"
                onClick={() => {
                  setPage(index);
                  setMenuId(null);
                }}
              >
                {index + 1}
              </button>
            ))}
          </nav>
          {selected.length > 0 && (
            <div className="sc-bulk">
              <span>{selected.length}개 선택</span>
              <button
                type="button"
                className="mfd-button"
                onClick={() => setSelected([])}
              >
                선택 해제
              </button>
              <button
                type="button"
                className="mfd-button is-primary"
                onClick={complete}
              >
                완료로 변경
              </button>
            </div>
          )}
        </>
      )}
    </ScreenFrame>
  );
}
