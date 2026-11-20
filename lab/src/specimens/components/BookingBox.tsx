import { useId, useRef, useState } from "react";
import { ChevronDown, Star } from "lucide-react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import "./BookingBox.css";

// params: place(sticky | static | bar), breakdown(open | total), fields(grid | summary)
// breakdown과 fields는 place가 bar가 아닐 때만 쓴다. 무대 안의 숙소 상세는 따로 스크롤된다

const NIGHT = 128000;
const NIGHTS = 2;
const fees = [
  {
    label: `₩${NIGHT.toLocaleString("ko-KR")} x ${NIGHTS}박`,
    value: NIGHT * NIGHTS,
  },
  { label: "청소비", value: 20000 },
  { label: "서비스 수수료", value: 18000 },
];
const total = fees.reduce((sum, fee) => sum + fee.value, 0);
const won = (value: number) => `₩${value.toLocaleString("ko-KR")}`;

const amenities = [
  "무선 인터넷",
  "주방",
  "세탁기",
  "마당",
  "난방",
  "에어컨",
  "작업 책상",
  "헤어드라이어",
  "무료 주차",
];

function Fields({ style }: { style: string }) {
  if (style === "summary") {
    return (
      <div className="bb-summary">
        <span>
          11월 21일 - 11월 23일
          <br />
          성인 2명
        </span>
        <button type="button" className="bb-link">
          바꾸기
        </button>
      </div>
    );
  }
  return (
    <div className="bb-fields">
      <button type="button">
        <small>체크인</small>
        11. 21.
      </button>
      <button type="button">
        <small>체크아웃</small>
        11. 23.
      </button>
      <button type="button" className="bb-guests">
        <span>
          <small>인원</small>
          성인 2명
        </span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

function Breakdown({ style }: { style: string }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const showList = style === "open" || open;
  return (
    <div className="bb-breakdown">
      {showList && (
        <dl id={listId}>
          {fees.map((fee) => (
            <div key={fee.label}>
              <dt>{fee.label}</dt>
              <dd>{won(fee.value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="bb-total">
        <span>총 합계</span>
        <span>{won(total)}</span>
      </div>
      {style === "total" && (
        <button
          type="button"
          className="bb-link"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
        >
          {open ? "요금 내역 접기" : "요금 내역 보기"}
        </button>
      )}
    </div>
  );
}

export default function BookingBox({ params }: SpecimenProps) {
  const { place, breakdown, fields } = params;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(false);

  // 상세를 반쯤 내리고, 끝까지 내린 뒤, 맨 위로 돌아간다
  useDemo((tick) => {
    const element = scrollRef.current;
    if (!element) return;
    const end = element.scrollHeight - element.clientHeight;
    const step = (tick - 1) % 3;
    element.scrollTo({ top: [end / 2, end, 0][step], behavior: "smooth" });
  });

  const reserve = (
    <>
      <button
        type="button"
        className="bb-reserve"
        onClick={() => setRequested(true)}
      >
        예약하기
      </button>
      <p className="bb-status" role="status">
        {requested ? "예약 요청을 보냈어요" : ""}
      </p>
    </>
  );

  return (
    <div className="bb-frame" ref={scrollRef} data-place={place}>
      <div className="bb-page">
        <div className="bb-content">
          <h3>서촌 마당집</h3>
          <p className="bb-sub">
            <Star size={12} fill="currentColor" strokeWidth={0} aria-hidden />{" "}
            4.92, 후기 128개
          </p>
          <p>
            한옥을 고친 단독 숙소입니다. 작은 마당과 툇마루가 있고 경복궁역까지
            걸어서 8분입니다.
          </p>
          <h4>숙소 편의시설</h4>
          <ul className="bb-amenities">
            {amenities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h4>위치</h4>
          <div className="bb-map" aria-hidden />
          <h4>환불 정책</h4>
          <p>
            체크인 7일 전까지 무료로 취소할 수 있습니다. 그 뒤에는 첫 1박 요금을
            뺀 나머지를 돌려드립니다.
          </p>
        </div>

        {place !== "bar" && (
          <aside className="bb-box" aria-label="예약">
            <p className="bb-price">
              <b>{won(NIGHT)}</b> /박
            </p>
            <Fields style={fields} />
            {reserve}
            <Breakdown style={breakdown} />
          </aside>
        )}
      </div>

      {place === "bar" && (
        <div className="bb-bar">
          <span>
            <span>
              <b>{won(NIGHT)}</b> /박
            </span>
            <small>11월 21일 - 23일</small>
          </span>
          <div className="bb-bar-action">{reserve}</div>
        </div>
      )}
    </div>
  );
}
