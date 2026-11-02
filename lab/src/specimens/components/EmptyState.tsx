import { useState } from "react";
import { Check, FolderPlus } from "lucide-react";
import type { SpecimenProps } from "../types";
import "./EmptyState.css";

// params: layout(action | steps | sample), visual(none | icon | ghost), align(center | start), tone(direct | benefit | brief)
// 움직임이 없는 시편이다. 프로젝트가 하나도 없는 계정이 처음 들어온 화면을 그린다.

const copy: Record<string, { title: string; body?: string }> = {
  direct: {
    title: "첫 프로젝트를 만들어 시작하세요",
    body: "프로젝트마다 일정, 파일, 멤버를 따로 관리해요.",
  },
  benefit: {
    title: "프로젝트로 팀의 일정과 파일을 한곳에 모아요",
    body: "만들면 바로 멤버를 초대하고 첫 일정을 잡을 수 있어요.",
  },
  brief: { title: "아직 프로젝트가 없어요" },
};

const steps = ["프로젝트 만들기", "멤버 초대하기", "첫 일정 잡기"];
const samples = [
  ["예시: 사옥 이전", "멤버 6명, 일정 12개"],
  ["예시: 11월 뉴스레터", "멤버 3명, 파일 8개"],
];

export default function EmptyState({ params }: SpecimenProps) {
  const [done, setDone] = useState<number[]>([]);
  const [cleared, setCleared] = useState(false);
  const { layout, visual, align, tone } = params;
  const text = copy[tone] ?? copy.direct;

  return (
    <div className="emp-page" data-align={align} data-layout={layout}>
      <header className="emp-head">
        <h3>프로젝트</h3>
      </header>

      {layout === "sample" && !cleared ? (
        <div className="emp-sample">
          <p className="emp-banner">
            <span>{text.title}</span>
            <button
              type="button"
              className="emp-link"
              onClick={() => setCleared(true)}
            >
              예시 지우고 새로 시작
            </button>
          </p>
          <ul className="emp-rows">
            {samples.map(([name, meta]) => (
              <li key={name}>
                <b>{name}</b>
                <span>{meta}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <section className="emp-body" aria-label="프로젝트가 없어요">
          {visual === "icon" && (
            <FolderPlus
              className="emp-icon"
              size={32}
              strokeWidth={1.5}
              aria-hidden
            />
          )}
          {visual === "ghost" && (
            <div className="emp-ghost" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
          <h4>{text.title}</h4>
          {text.body && <p>{text.body}</p>}
          {layout === "steps" ? (
            <ol className="emp-steps">
              {steps.map((step, index) => {
                const finished = done.includes(index);
                return (
                  <li key={step}>
                    <button
                      type="button"
                      className={finished ? "is-done" : undefined}
                      aria-pressed={finished}
                      onClick={() =>
                        setDone((current) =>
                          finished
                            ? current.filter((item) => item !== index)
                            : [...current, index],
                        )
                      }
                    >
                      <span className="emp-check" aria-hidden="true">
                        {finished ? (
                          <Check size={14} strokeWidth={2.25} />
                        ) : (
                          index + 1
                        )}
                      </span>
                      {step}
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <button type="button" className="emp-primary">
              프로젝트 만들기
            </button>
          )}
        </section>
      )}
    </div>
  );
}
