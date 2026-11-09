import type { ComponentType } from "react";
import Assistant from "./components/Assistant";
import ArticleAside from "./components/ArticleAside";
import Badge from "./components/Badge";
import Button from "./components/Button";
import Confirm from "./components/Confirm";
import CodeBlock from "./components/CodeBlock";
import Conversation from "./components/Conversation";
import DataTable from "./components/DataTable";
import DatePicker from "./components/DatePicker";
import Dialog from "./components/Dialog";
import Disclosure from "./components/Disclosure";
import Drawer from "./components/Drawer";
import EmptyState from "./components/EmptyState";
import Failure from "./components/Failure";
import Field from "./components/Field";
import Filter from "./components/Filter";
import FormDialog from "./components/FormDialog";
import FormClose from "./components/FormClose";
import FormFailure from "./components/FormFailure";
import GlobalSearch from "./components/GlobalSearch";
import ListRow, { BlogList } from "./components/ListRow";
import ListDetail from "./components/ListDetail";
import Loading from "./components/Loading";
import LongFormDialog from "./components/LongFormDialog";
import Menu from "./components/Menu";
import ManyOptions from "./components/ManyOptions";
import ManyFilters from "./components/ManyFilters";
import MobileTable from "./components/MobileTable";
import MotionFeel from "./components/MotionFeel";
import MotionResponse from "./components/MotionResponse";
import MotionSpring from "./components/MotionSpring";
import MotionSwap from "./components/MotionSwap";
import Nav from "./components/Nav";
import Notice from "./components/Notice";
import PageWidth from "./components/PageWidth";
import Reading, { BlogReading } from "./components/Reading";
import QuestionDial from "./components/QuestionDial";
import Refresh from "./components/Refresh";
import RapidTabs from "./components/RapidTabs";
import Reorder from "./components/Reorder";
import Search from "./components/Search";
import Segmented from "./components/Segmented";
import Selection from "./components/Selection";
import SectionGuide from "./components/SectionGuide";
import Sort from "./components/Sort";
import Steps from "./components/Steps";
import StepFormDialog from "./components/StepFormDialog";
import StatusLine from "./components/StatusLine";
import Surface from "./components/Surface";
import Table from "./components/Table";
import Tabs from "./components/Tabs";
import Toast from "./components/Toast";
import Tooltip from "./components/Tooltip";
import Transition, { BlogTransition } from "./components/Transition";
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
  // 화면 폭은 움직임이 없어 같이 재생을 숨긴다
  page: { Component: PageWidth, demoInterval: 0, demoSteps: 0 },
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
  // 열고 닫기 반복. 늦게 오는 팀 목록(600ms)을 다 받은 뒤에도 열린 채로 보이도록 간격을 둔다
  dialog: { Component: Dialog, demoInterval: 1500, demoSteps: 4 },
  formdialog: { Component: FormDialog, demoInterval: 1300, demoSteps: 6 },
  longformdialog: {
    Component: LongFormDialog,
    demoInterval: 1300,
    demoSteps: 6,
  },
  stepformdialog: {
    Component: StepFormDialog,
    demoInterval: 1000,
    demoSteps: 8,
  },
  formclose: { Component: FormClose, demoInterval: 1200, demoSteps: 6 },
  formfailure: { Component: FormFailure, demoInterval: 1200, demoSteps: 6 },
  manyoptions: { Component: ManyOptions, demoInterval: 1200, demoSteps: 6 },
  listdetail: { Component: ListDetail, demoInterval: 1200, demoSteps: 5 },
  manyfilters: { Component: ManyFilters, demoInterval: 1200, demoSteps: 4 },
  mobiletable: { Component: MobileTable, demoInterval: 1200, demoSteps: 4 },
  rapidtabs: { Component: RapidTabs, demoInterval: 1100, demoSteps: 3 },
  menu: { Component: Menu, demoInterval: 600, demoSteps: 5 },
  toast: { Component: Toast, demoInterval: 700, demoSteps: 4 },
  status: { Component: StatusLine, demoInterval: 1000, demoSteps: 7 },
  // 카드 바꾸기(주의 안내가 풀림), 일반 안내 닫기, 처음으로
  notice: { Component: Notice, demoInterval: 1200, demoSteps: 3 },
  // 배지는 움직임이 없어 같이 재생을 숨긴다
  badge: { Component: Badge, demoInterval: 0, demoSteps: 0 },
  drawer: { Component: Drawer, demoInterval: 1000, demoSteps: 4 },
  reorder: { Component: Reorder, demoInterval: 650, demoSteps: 8 },
  field: { Component: Field, demoInterval: 900, demoSteps: 7 },
  // 없는 번호 입력, 찾기, 번호 고침, 찾기(연결 실패), 다시 시도, 찾은 결과 보기, 처음으로
  failure: { Component: Failure, demoInterval: 1100, demoSteps: 7 },
  loading: { Component: Loading, demoInterval: 1100, demoSteps: 4 },
  // 탭 바꿈, 새 행 강조 보기, 탭 바꿈(실패), 실패 알림 보기, 다시 시도, 새 목록 보기, 처음으로
  refresh: { Component: Refresh, demoInterval: 1100, demoSteps: 7 },
  datepicker: { Component: DatePicker, demoInterval: 900, demoSteps: 6 },
  table: { Component: Table, demoInterval: 1200, demoSteps: 3 },
  datatable: { Component: DataTable, demoInterval: 1100, demoSteps: 6 },
  // 목록을 두 번 내려 묶음 머리글을 보이고 맨 위로
  listrow: { Component: ListRow, demoInterval: 1000, demoSteps: 3 },
  // 빈 상태는 움직임이 없어 같이 재생을 숨긴다
  empty: { Component: EmptyState, demoInterval: 0, demoSteps: 0 },
  nav: { Component: Nav, demoInterval: 1000, demoSteps: 6 },
  search: { Component: Search, demoInterval: 800, demoSteps: 7 },
  upload: { Component: Upload, demoInterval: 1000, demoSteps: 8 },
  confirm: { Component: Confirm, demoInterval: 1100, demoSteps: 4 },
  transition: { Component: Transition, demoInterval: 1100, demoSteps: 6 },
  // 단계마다 답하고 넘어가기, 한 단계 뒤로, 처음으로
  steps: { Component: Steps, demoInterval: 1100, demoSteps: 7 },
  tooltip: { Component: Tooltip, demoInterval: 1000, demoSteps: 5 },
  filter: { Component: Filter, demoInterval: 1000, demoSteps: 6 },
  sort: { Component: Sort, demoInterval: 1000, demoSteps: 4 },
  globalsearch: { Component: GlobalSearch, demoInterval: 1100, demoSteps: 5 },
  // 질문 쓰기, 보내기, 기다림과 받기 세 칸, 처음으로
  assistant: { Component: Assistant, demoInterval: 1200, demoSteps: 6 },
  codeblock: { Component: CodeBlock, demoInterval: 1600, demoSteps: 3 },
  sectionguide: { Component: SectionGuide, demoInterval: 1100, demoSteps: 5 },
  questiondial: { Component: QuestionDial, demoInterval: 1100, demoSteps: 9 },
  conversation: { Component: Conversation, demoInterval: 0, demoSteps: 0 },
  articleaside: { Component: ArticleAside, demoInterval: 1200, demoSteps: 2 },
  article: { Component: BlogReading, demoInterval: 0, demoSteps: 0 },
  postlist: { Component: BlogList, demoInterval: 0, demoSteps: 0 },
  posttransition: {
    Component: BlogTransition,
    demoInterval: 1300,
    demoSteps: 3,
  },
};
