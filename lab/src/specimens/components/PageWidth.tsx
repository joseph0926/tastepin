import { useLayoutEffect, useRef, useState } from "react";
import type { SpecimenProps } from "../types";
import "./PageWidth.css";

// params: width(narrow | medium | wide)
// 화면 전체의 본문 폭을 비교하는 전역 시편이다. 무대는 1440px보다 좁으므로 1440 x 900 화면을 그대로 그린 뒤
// 무대 폭에 맞춰 줄여 보인다. 글자는 읽히지 않아도 본문과 양옆 여백의 비율이 실제와 같다. 움직임은 없다.

const SCREEN = { width: 1440, height: 900 };

const widths: Record<string, number> = {
  narrow: 720,
  medium: 1040,
  wide: 1280,
};

const posts = [
  { title: "버스 정류장 이전 안내", meta: "교통, 2시간 전" },
  { title: "공원 산책로 야간 조명 교체", meta: "환경, 어제" },
  { title: "도서관 주말 운영 시간 변경", meta: "문화, 3일 전" },
  { title: "재활용 수거 요일 조정", meta: "환경, 4일 전" },
  { title: "주민센터 주차장 공사", meta: "교통, 5일 전" },
  { title: "어린이 놀이터 바닥 보수", meta: "안전, 1주 전" },
];

export default function PageWidth({ params }: SpecimenProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const width = widths[params.width] ?? widths.medium;

  // 무대 폭은 평가 화면의 배치와 휴대폰 폭 전환으로 바뀌므로 크기를 관찰해 배율을 맞춘다
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(entry.contentRect.width / SCREEN.width),
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      className="pgw"
      style={{ height: SCREEN.height * scale }}
    >
      <div
        className="pgw-screen"
        style={{
          width: SCREEN.width,
          height: SCREEN.height,
          transform: `scale(${scale})`,
        }}
        aria-hidden="true"
      >
        <header className="pgw-bar">
          <div className="pgw-bar-inner" style={{ maxWidth: width }}>
            <b>우리 동네</b>
            <nav>
              <span>소식</span>
              <span>민원</span>
              <span>모임</span>
            </nav>
          </div>
        </header>
        <main className="pgw-main" style={{ maxWidth: width }}>
          <h1>이번 주 동네 소식</h1>
          <p>
            정류장 이전과 산책로 조명 교체처럼 생활에 바로 닿는 소식을
            모았습니다. 일정이 바뀐 시설은 운영 시간을 꼭 확인하세요.
          </p>
          <ul className="pgw-list">
            {posts.map((post) => (
              <li key={post.title}>
                <b>{post.title}</b>
                <span>{post.meta}</span>
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
}
