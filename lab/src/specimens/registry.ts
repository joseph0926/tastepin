import type { ComponentType } from "react";
import Assistant from "./components/Assistant";
import Badge from "./components/Badge";
import Button from "./components/Button";
import Confirm from "./components/Confirm";
import DataTable from "./components/DataTable";
import DatePicker from "./components/DatePicker";
import Dialog from "./components/Dialog";
import Disclosure from "./components/Disclosure";
import Drawer from "./components/Drawer";
import EmptyState from "./components/EmptyState";
import Field from "./components/Field";
import Filter from "./components/Filter";
import GlobalSearch from "./components/GlobalSearch";
import Loading from "./components/Loading";
import Menu from "./components/Menu";
import MotionFeel from "./components/MotionFeel";
import MotionResponse from "./components/MotionResponse";
import MotionSpring from "./components/MotionSpring";
import MotionSwap from "./components/MotionSwap";
import Nav from "./components/Nav";
import Reading from "./components/Reading";
import Reorder from "./components/Reorder";
import Search from "./components/Search";
import Segmented from "./components/Segmented";
import Selection from "./components/Selection";
import Sort from "./components/Sort";
import StatusLine from "./components/StatusLine";
import Surface from "./components/Surface";
import Table from "./components/Table";
import Tabs from "./components/Tabs";
import Toast from "./components/Toast";
import Tooltip from "./components/Tooltip";
import Transition from "./components/Transition";
import Upload from "./components/Upload";
import type { SpecimenProps } from "./types";

export interface SpecimenEntry {
  Component: ComponentType<SpecimenProps>;
  // 같이 재생에서 시연 동작 사이 간격(ms). 느리게 보기에서는 같은 배수로 늘어난다.
  // 움직임이 없는 전역 시편(화면 표면, 글과 밀도)은 demoSteps가 0이고 평가 화면이 같이 재생을 숨긴다
  demoInterval: number;
  demoSteps: number;
}

// catalog.json의 컴포넌트 id와 같아야 한다. 없는 id는 평가 화면이 "시편 없음"으로 알린다
export const specimens: Record<string, SpecimenEntry> = {
  surface: { Component: Surface, demoInterval: 0, demoSteps: 0 },
  reading: { Component: Reading, demoInterval: 0, demoSteps: 0 },
  "motion-feel": { Component: MotionFeel, demoInterval: 900, demoSteps: 4 },
  "motion-response": {
    Component: MotionResponse,
    demoInterval: 1000,
    demoSteps: 4,
  },
  "motion-spring": { Component: MotionSpring, demoInterval: 900, demoSteps: 4 },
  "motion-swap": { Component: MotionSwap, demoInterval: 900, demoSteps: 5 },
  button: { Component: Button, demoInterval: 800, demoSteps: 6 },
  disclosure: { Component: Disclosure, demoInterval: 900, demoSteps: 4 },
  selection: { Component: Selection, demoInterval: 650, demoSteps: 6 },
  segmented: { Component: Segmented, demoInterval: 900, demoSteps: 3 },
  tabs: { Component: Tabs, demoInterval: 900, demoSteps: 4 },
  dialog: { Component: Dialog, demoInterval: 1100, demoSteps: 4 },
  menu: { Component: Menu, demoInterval: 600, demoSteps: 5 },
  toast: { Component: Toast, demoInterval: 700, demoSteps: 4 },
  status: { Component: StatusLine, demoInterval: 1000, demoSteps: 7 },
  // 배지는 움직임이 없어 같이 재생을 숨긴다
  badge: { Component: Badge, demoInterval: 0, demoSteps: 0 },
  drawer: { Component: Drawer, demoInterval: 1000, demoSteps: 4 },
  reorder: { Component: Reorder, demoInterval: 650, demoSteps: 8 },
  field: { Component: Field, demoInterval: 900, demoSteps: 7 },
  loading: { Component: Loading, demoInterval: 1100, demoSteps: 4 },
  datepicker: { Component: DatePicker, demoInterval: 900, demoSteps: 6 },
  table: { Component: Table, demoInterval: 1200, demoSteps: 3 },
  datatable: { Component: DataTable, demoInterval: 1100, demoSteps: 6 },
  // 빈 상태는 움직임이 없어 같이 재생을 숨긴다
  empty: { Component: EmptyState, demoInterval: 0, demoSteps: 0 },
  nav: { Component: Nav, demoInterval: 1000, demoSteps: 6 },
  search: { Component: Search, demoInterval: 800, demoSteps: 7 },
  upload: { Component: Upload, demoInterval: 1000, demoSteps: 8 },
  confirm: { Component: Confirm, demoInterval: 1100, demoSteps: 4 },
  transition: { Component: Transition, demoInterval: 1100, demoSteps: 6 },
  tooltip: { Component: Tooltip, demoInterval: 1000, demoSteps: 5 },
  filter: { Component: Filter, demoInterval: 1000, demoSteps: 6 },
  sort: { Component: Sort, demoInterval: 1000, demoSteps: 4 },
  globalsearch: { Component: GlobalSearch, demoInterval: 1100, demoSteps: 5 },
  // 질문 쓰기, 보내기, 기다림과 받기 세 칸, 처음으로
  assistant: { Component: Assistant, demoInterval: 1200, demoSteps: 6 },
};
