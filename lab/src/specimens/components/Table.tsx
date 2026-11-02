import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useDemo } from "../stage";
import type { SpecimenProps } from "../types";
import {
  columns,
  nextSort,
  payouts,
  shortDate,
  sorted,
  won,
  type Sort,
} from "./tableData";
import "./Table.css";

// params: density(regular | compact | roomy), rows(line | zebra | space), sort(arrow | always | weight), header(plain | tone | quiet)
// 읽기용 표다. 머리글을 누르면 정렬이 바뀌고 행은 바로 새 순서가 된다. 정렬할 때의 움직임은 데이터 테이블 시편이 다룬다.

const rows = payouts.slice(0, 6);
// 시연 순서: 금액 내림, 금액 오름, 거래처 오름
const demoKeys = ["amount", "amount", "partner"] as const;

export default function Table({ params }: SpecimenProps) {
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });
  const { density, rows: divider, sort: marker, header } = params;

  useDemo((tick) => {
    setSort((current) =>
      nextSort(current, demoKeys[(tick - 1) % demoKeys.length]),
    );
  });

  return (
    <div
      className="tbl-page"
      data-density={density}
      data-rows={divider}
      data-sort={marker}
      data-header={header}
    >
      <h3>10월 정산</h3>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={[
                      column.numeric && "is-numeric",
                      active && "is-active",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-sort={
                      active
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSort((current) => nextSort(current, column.key))
                      }
                    >
                      <span>{column.label}</span>
                      <SortMark
                        marker={marker}
                        active={active}
                        dir={sort.dir}
                      />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted(rows, sort).map((row) => (
              <tr key={row.id}>
                <td>{row.partner}</td>
                <td className="tbl-muted">{shortDate(row.date)}</td>
                <td className="is-numeric">{won(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortMark({
  marker,
  active,
  dir,
}: {
  marker: string;
  active: boolean;
  dir: string;
}) {
  if (marker === "weight") {
    return active ? (
      <small className="tbl-dir">{dir === "asc" ? "오름" : "내림"}</small>
    ) : null;
  }
  if (active) {
    const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <Arrow
        className="tbl-arrow is-on"
        size={14}
        strokeWidth={2}
        aria-hidden
      />
    );
  }
  return (
    <ArrowUpDown
      className="tbl-arrow"
      size={14}
      strokeWidth={1.75}
      aria-hidden
    />
  );
}
