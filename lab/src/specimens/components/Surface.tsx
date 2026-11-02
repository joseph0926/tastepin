import { useId, useState } from "react";
import { Check, Search } from "lucide-react";
import type { SpecimenProps } from "../types";
import "./Surface.css";

// params: grouping(space | tone | hairline), radius(sharp | small | soft), ground(neutral | cool | warm)
// 컴포넌트 하나가 아니라 화면 전체의 표면 값을 비교하는 전역 시편이다. 움직임은 없다.

const notifications = [
  {
    id: "review",
    label: "리뷰 요청",
    detail: "내가 리뷰어로 지정되면 알려요",
    on: true,
  },
  {
    id: "comment",
    label: "댓글",
    detail: "내 변경에 댓글이 달리면 알려요",
    on: true,
  },
  {
    id: "digest",
    label: "주간 요약",
    detail: "월요일 오전 9시에 지난주 변경을 모아 보내요",
    on: false,
  },
];

const members = [
  { name: "박서윤", role: "디자인", admin: true },
  { name: "이도윤", role: "프론트엔드", admin: false },
  { name: "최민준", role: "제품", admin: false },
];

export default function Surface({ params }: SpecimenProps) {
  const { grouping, radius, ground } = params;
  // 같은 시편이 무대마다 하나씩 그려지므로 제목 id가 겹치지 않게 한다
  const id = useId();
  const [enabled, setEnabled] = useState(
    () => new Set(notifications.filter((n) => n.on).map((n) => n.id)),
  );

  const toggle = (id: string) =>
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      className="srf"
      data-grouping={grouping}
      data-radius={radius}
      data-ground={ground}
    >
      <header className="srf-head">
        <div>
          <h3>워크스페이스 설정</h3>
          <p>틈 디자인팀, 멤버 8명</p>
        </div>
        <label className="srf-search">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <input placeholder="설정 검색" aria-label="설정 검색" />
        </label>
      </header>

      <section className="srf-group" aria-labelledby={`${id}-notify`}>
        <h4 id={`${id}-notify`}>알림</h4>
        <ul className="srf-rows">
          {notifications.map((item) => (
            <li key={item.id} className="srf-row">
              <label className="srf-row-main">
                <span className="srf-row-text">
                  <b>{item.label}</b>
                  <span>{item.detail}</span>
                </span>
                <input
                  type="checkbox"
                  className="srf-check-input"
                  checked={enabled.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span className="srf-check" aria-hidden="true">
                  <Check size={13} strokeWidth={2.5} />
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="srf-group" aria-labelledby={`${id}-members`}>
        <h4 id={`${id}-members`}>멤버</h4>
        <ul className="srf-rows">
          {members.map((member) => (
            <li key={member.name} className="srf-row">
              <span className="srf-row-text">
                <b>
                  {member.name}
                  {member.admin && <span className="srf-tag">관리자</span>}
                </b>
                <span>{member.role}</span>
              </span>
              <button type="button" className="srf-link">
                권한 변경
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="srf-actions">
        <button type="button" className="srf-button srf-primary">
          변경 저장
        </button>
        <button type="button" className="srf-button">
          취소
        </button>
      </footer>
    </div>
  );
}
