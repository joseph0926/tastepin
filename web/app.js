"use strict";

// 서버가 돌려주는 원장 전체. 저장할 때마다 다시 받아 화면과 파일을 맞춘다.
let data = { axes: [], symptoms: [], rules: [], verdicts: [], deliveries: [], last_run: null };
// labs 시편 평가 상태. labs 카탈로그가 없거나 깨져도 다른 탭은 그대로 쓰도록 따로 받는다
let lab = { components: [], queue: [], catalog: { components: [] }, error: "" };
let symptomById = new Map();
let axisLabel = new Map();

const ui = {
  tab: "compose",
  inboxFilter: "new",
  inboxIndex: 0,
  openRules: new Set(),
  search: "",
};

// 작성 중인 피드백은 탭을 닫아도 남도록 브라우저에 보관한다
const DRAFT_KEY = "taste-ledger-draft";
let draft = readDraft();

function readDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (saved && Array.isArray(saved.items)) return saved;
  } catch (error) {
    // 저장소를 쓸 수 없으면 빈 초안으로 시작한다
  }
  return { target: "", keep: "", withRules: true, items: [] };
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (error) {
    // 저장 실패는 작성 흐름을 막지 않는다
  }
}

const $ = (selector, root = document) => root.querySelector(selector);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]);
}

function shortDate(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}`;
}

function projectName(path) {
  if (!path) return "작성기";
  return path.split("/").filter(Boolean).pop();
}

/* 서버 통신 */

async function api(path, body) {
  const options = body === undefined
    ? {}
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "요청에 실패했습니다");
  return payload;
}

async function reload() {
  const [state, labState] = await Promise.all([
    api("/api/state"),
    api("/api/lab/state").catch((error) => ({ components: [], queue: [], catalog: { components: [] }, error: error.message })),
  ]);
  data = state;
  lab = { error: "", ...labState };
  symptomById = new Map(data.symptoms.map((s) => [s.id, s]));
  axisLabel = new Map(data.axes.map((a) => [a.id, a.label]));
  render();
}

async function mutate(path, body, message) {
  try {
    const result = await api(path, body);
    await reload();
    if (message) toast(message);
    return result;
  } catch (error) {
    toast(error.message);
    return null;
  }
}

/* 근거 계산: 서버 store.rule_evidence와 같은 기준 */

function countsAsComplaint(verdict) {
  return verdict.status !== "ignored" && verdict.polarity !== "positive";
}

function ruleEvidence(rule) {
  const wanted = new Set(rule.symptoms || []);
  return data.verdicts.filter((v) => countsAsComplaint(v) && v.symptoms.some((s) => wanted.has(s)));
}

function symptomHits(symptomId) {
  return data.verdicts.filter((v) => countsAsComplaint(v) && v.symptoms.includes(symptomId));
}

// kind가 like인 증상은 피할 것이 아니라 칭찬한 패턴이다. 서버 store.liked_patterns와 같은 기준으로 센다
const isLiked = (symptom) => symptom.kind === "like";

function praiseHits(symptomId) {
  return data.verdicts.filter((v) => v.status !== "ignored" && v.polarity !== "negative" && v.symptoms.includes(symptomId));
}

/* 머리글과 탭 */

function renderMeta() {
  const active = data.verdicts.filter((v) => v.status !== "ignored").length;
  const pending = data.verdicts.filter((v) => v.status === "new").length;
  const last = data.last_run ? new Date(data.last_run).toLocaleString("ko-KR", {
    month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "수집 기록 없음";
  $("#meta").innerHTML = `판정 <b>${active}</b>, 규칙 <b>${data.rules.length}</b>, 마지막 수집 ${esc(last)}`;
  $("#inbox-count").textContent = pending ? pending : "";
  $("#lab-count").textContent = lab.queue.length ? lab.queue.length : "";
}

function moveIndicator(instant) {
  const tabs = $(".tabs");
  const active = $(`.tabs [data-tab="${ui.tab}"]`);
  const indicator = $(".tab-indicator");
  // 키보드로 바꾼 탭은 애니메이션하지 않는다
  tabs.classList.toggle("instant", Boolean(instant));
  indicator.style.width = `${active.offsetWidth}px`;
  indicator.style.transform = `translateX(${active.offsetLeft}px)`;
}

function selectTab(tab, instant = false) {
  ui.tab = tab;
  document.querySelectorAll(".tabs [data-tab]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.tab === tab));
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.hidden = view.id !== tab;
  });
  moveIndicator(instant);
  renderView();
}

function render() {
  renderMeta();
  renderView();
  moveIndicator(true);
}

function renderView() {
  const renderers = {
    compose: renderCompose, taste: renderTaste, inbox: renderInbox, flow: renderFlow, components: renderComponents,
  };
  renderers[ui.tab]();
}

/* 1. 피드백 쓰기 */

function matchesSearch(symptom, query) {
  if (!query) return true;
  const haystack = `${symptom.label} ${symptom.term} ${symptom.fix}`.toLowerCase();
  if (haystack.includes(query.toLowerCase())) return true;
  return symptom.aliases.some((alias) => {
    try {
      return new RegExp(alias, "i").test(query);
    } catch (error) {
      return false;
    }
  });
}

function symptomListHtml() {
  const selected = new Set(draft.items.map((item) => item.id));
  const groups = data.axes.map((axis) => {
    const rows = data.symptoms
      .filter((s) => s.axis === axis.id && !isLiked(s) && matchesSearch(s, ui.search))
      .map((s) => {
        const hits = symptomHits(s.id).length;
        return `
          <button class="symptom" type="button" data-symptom="${s.id}" aria-pressed="${selected.has(s.id)}">
            <span class="tick">${selected.has(s.id) ? "✓" : "+"}</span>
            <span><span class="name">${esc(s.label)}</span><span class="term">${esc(s.term)}</span></span>
            <span class="hits mono">${hits ? `${hits}회` : ""}</span>
          </button>`;
      })
      .join("");
    return rows ? `<h3 class="axis-title">${esc(axis.label)}</h3>${rows}` : "";
  }).join("");
  return groups || `<p class="empty">맞는 증상이 없습니다. 다른 말로 검색해 보세요.</p>`;
}

function renderCompose() {
  const root = $("#compose");
  const items = draft.items.map((item, index) => {
    const symptom = symptomById.get(item.id);
    if (!symptom) return "";
    return `
      <div class="draft-item" data-index="${index}">
        <h3>${index + 1}. ${esc(symptom.label)}</h3>
        <button class="text-button" type="button" data-remove="${index}">빼기</button>
        <p class="term">${esc(symptom.term)}</p>
        <div class="inputs">
          <input class="field" data-field="where" value="${esc(item.where)}" placeholder="어디 (예: 상단 탭, aside)">
          <input class="field" data-field="note" value="${esc(item.note)}" placeholder="본 것 (내 말 그대로 적어도 됨)">
        </div>
      </div>`;
  }).join("");

  root.innerHTML = `
    <div class="compose">
      <div class="picker">
        <input class="field" id="symptom-search" value="${esc(ui.search)}" placeholder="느낀 대로 검색: 누리끼리, 뚝뚝, 카드 많음">
        <div id="symptom-list">${symptomListHtml()}</div>
      </div>
      <div>
        <div class="section-head">
          <div>
            <h2>이번 회차 피드백</h2>
            <p class="lede">왼쪽에서 증상을 고르면 에이전트가 바로 고칠 수 있는 문장으로 바뀝니다.</p>
          </div>
        </div>
        <div class="draft-target">
          <label><span class="label">대상 화면</span>
            <input class="field" id="draft-target" value="${esc(draft.target)}" placeholder="예: blog /about"></label>
          <label><span class="label">유지할 것</span>
            <input class="field" id="draft-keep" value="${esc(draft.keep)}" placeholder="예: 전체 방향, 레이아웃"></label>
        </div>
        ${items || `<p class="empty">아직 고른 증상이 없습니다.</p>`}
        <label class="option"><input type="checkbox" id="draft-rules" ${draft.withRules ? "checked" : ""}>관련 취향 규칙도 덧붙이기</label>
        <pre class="preview" id="draft-preview">${esc(composeText())}</pre>
        <div class="button-row">
          <button class="button primary" type="button" id="copy-log">복사하고 원장에 기록</button>
          <button class="button" type="button" id="copy-only">복사만</button>
          <button class="text-button" type="button" id="draft-clear">비우기</button>
        </div>
      </div>
    </div>`;
}

function composeText() {
  if (!draft.items.length) return "증상을 고르면 여기에 피드백이 만들어집니다.";
  const lines = [`${draft.target || "현재 화면"} 피드백`, ""];
  draft.items.forEach((item, index) => {
    const s = symptomById.get(item.id);
    if (!s) return;
    lines.push(`${index + 1}. ${item.where ? `${item.where}: ` : ""}${s.label}`);
    if (item.note) lines.push(`   본 것: ${item.note}`);
    lines.push(`   진단: ${s.term}`);
    lines.push(`   수정: ${s.fix}`);
    lines.push(`   확인: ${s.check}`);
    lines.push("");
  });
  if (draft.keep) lines.push(`유지할 것: ${draft.keep}`, "");
  if (draft.withRules) {
    const ids = new Set(draft.items.map((item) => item.id));
    const related = data.rules.filter((rule) => (rule.symptoms || []).some((id) => ids.has(id)));
    if (related.length) {
      lines.push("내 취향 규칙 (이번 수정 범위에도 적용):");
      related.forEach((rule) => lines.push(`- ${rule.title}`, `  피할 것: ${rule.avoid}`, `  할 것: ${rule.do}`));
    }
  }
  return lines.join("\n").trim();
}

function refreshPreview() {
  const preview = $("#draft-preview");
  if (preview) preview.textContent = composeText();
  saveDraft();
}

function toggleSymptom(id) {
  const index = draft.items.findIndex((item) => item.id === id);
  if (index >= 0) draft.items.splice(index, 1);
  else draft.items.push({ id, where: "", note: "" });
  saveDraft();
  renderCompose();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

async function copyDraft(log) {
  if (!draft.items.length) return toast("고른 증상이 없습니다");
  const text = composeText();
  const copied = await copyText(text);
  if (!log) return toast(copied ? "복사했습니다" : "복사하지 못했습니다");
  const notes = draft.items.map((item) => {
    const s = symptomById.get(item.id);
    return `${item.where ? `${item.where}: ` : ""}${item.note || s.label}`;
  });
  await mutate("/api/verdicts/add", {
    text: `${draft.target ? `[${draft.target}] ` : ""}${notes.join(" / ")}`,
    symptoms: draft.items.map((item) => item.id),
    project: draft.target,
  }, copied ? "복사하고 원장에 기록했습니다" : "기록했지만 복사하지 못했습니다");
}

/* 2. 내 취향 */

function renderTaste() {
  const root = $("#taste");
  const confirmed = data.rules.filter((r) => r.status === "확정").length;
  const uncovered = data.symptoms
    .map((s) => ({ s, hits: symptomHits(s.id) }))
    // owner가 있는 증상은 다른 스킬이 절차로 다루므로 취향 규칙으로 만들 대상이 아니다
    .filter(({ s, hits }) => !s.owner && !isLiked(s) && hits.length >= 2 && !data.rules.some((r) => (r.symptoms || []).includes(s.id)));

  const notice = uncovered.length ? `
    <div class="notice">
      <h3>규칙이 없는데 반복된 지적</h3>
      ${uncovered.map(({ s, hits }) => `
        <div class="notice-row">
          <span>${esc(s.label)} <span class="muted mono">${hits.length}회</span></span>
          <button class="text-button" type="button" data-promote="${s.id}">규칙으로 만들기</button>
        </div>`).join("")}
    </div>` : "";

  const groups = data.axes.map((axis) => {
    const rules = data.rules
      .filter((r) => r.axis === axis.id)
      .map((rule) => ({ rule, evidence: ruleEvidence(rule) }))
      .sort((a, b) => b.evidence.length - a.evidence.length);
    if (!rules.length) return "";
    return `<h3 class="axis-title">${esc(axis.label)}</h3>${rules.map(({ rule, evidence }) => ruleRow(rule, evidence)).join("")}`;
  }).join("");

  const liked = data.symptoms
    .filter(isLiked)
    .map((s) => ({ s, praise: praiseHits(s.id).sort((a, b) => b.ts.localeCompare(a.ts)) }))
    .filter(({ praise }) => praise.length)
    .sort((a, b) => b.praise.length - a.praise.length);
  const likedRows = liked.map(({ s, praise }) => `
    <div class="rule">
      <div class="rule-summary static">
        <div>
          <h3>${esc(s.label)}</h3>
          <p>${esc(s.fix)}</p>
          <blockquote class="quote">${esc(praise[0].text.length > 160 ? `${praise[0].text.slice(0, 160)}…` : praise[0].text)}
            <cite>${shortDate(praise[0].ts)} ${esc(projectName(praise[0].project))}</cite>
          </blockquote>
        </div>
        <span class="hits mono">${praise.length}<small>칭찬</small></span>
        <span class="last mono">최근 ${shortDate(praise[0].ts)}</span>
        <span class="state">좋아함</span>
      </div>
    </div>`).join("");
  const likedSection = likedRows
    ? `<h3 class="axis-title">좋아한 패턴</h3><p class="muted liked-lede">칭찬한 판정에서 나온 패턴입니다. 블록과 /taste 적용에 "맞는 자리가 있으면 더 쓴다"로 들어갑니다.</p>${likedRows}`
    : "";

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>내 디자인 취향</h2>
        <p class="lede">확정 ${confirmed}개, 관찰 ${data.rules.length - confirmed}개. 숫자는 실제로 같은 지적을 한 횟수입니다.</p>
      </div>
      <div class="button-row">
        <button class="button primary" type="button" data-block="design">Claude Design용 복사</button>
        <button class="button" type="button" data-block="agent">코딩 에이전트용 복사</button>
        <button class="text-button" type="button" id="export-md">TASTE.md 내보내기</button>
      </div>
    </div>
    ${notice}
    ${groups}
    ${likedSection}
    <div class="rule" style="margin-top:32px">
      <button class="rule-summary" type="button" data-rule-toggle="__new">
        <div><h3>새 규칙 추가</h3><p>반복되는 판정을 직접 규칙으로 적습니다.</p></div>
      </button>
      <div class="rule-detail"><div>${ruleEditor({ id: "", axis: data.axes[0]?.id, title: "", avoid: "", do: "", symptoms: [], status: "관찰" })}</div></div>
    </div>`;
  ui.openRules.forEach((id) => {
    root.querySelector(`[data-rule-toggle="${id || "__new"}"]`)?.closest(".rule").classList.add("open");
  });
}

function ruleRow(rule, evidence) {
  const last = evidence.length ? shortDate(evidence.map((v) => v.ts).sort().pop()) : "-";
  const quotes = evidence
    .slice()
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 4)
    .map((v) => `
      <blockquote class="quote">${esc(v.text.length > 220 ? `${v.text.slice(0, 220)}…` : v.text)}
        <cite>${shortDate(v.ts)} ${esc(projectName(v.project))}${v.status === "new" ? ", 분류 전" : ""}</cite>
      </blockquote>`)
    .join("");
  const sources = (rule.sources || []).map((s) => `<p class="muted" style="margin:0 0 6px;font-size:12.5px">${esc(s)}</p>`).join("");
  return `
    <div class="rule" data-rule="${esc(rule.id)}">
      <button class="rule-summary" type="button" data-rule-toggle="${esc(rule.id)}" aria-expanded="${ui.openRules.has(rule.id)}">
        <div>
          <h3>${esc(rule.title)}</h3>
          <p>${esc(rule.do)}</p>
          <p class="muted">피할 것: ${esc(rule.avoid)}</p>
        </div>
        <span class="hits mono">${evidence.length}<small>지적</small></span>
        <span class="last mono">최근 ${last}</span>
        <span class="state ${rule.status === "관찰" ? "watch" : ""}">${esc(rule.status)}</span>
      </button>
      <div class="rule-detail"><div>
        <div class="rule-body">
          <div>
            <span class="label">근거</span>
            ${quotes || `<p class="muted" style="margin:0 0 12px">아직 이 규칙에 걸린 판정이 없습니다.</p>`}
            ${sources ? `<span class="label" style="margin-top:12px">선언 출처</span>${sources}` : ""}
          </div>
          ${ruleEditor(rule)}
        </div>
      </div></div>
    </div>`;
}

function ruleEditor(rule) {
  const axisOptions = data.axes
    .map((a) => `<option value="${a.id}" ${a.id === rule.axis ? "selected" : ""}>${esc(a.label)}</option>`)
    .join("");
  const tags = data.symptoms
    .map((s) => `<button class="tag" type="button" data-rule-symptom="${s.id}" aria-pressed="${(rule.symptoms || []).includes(s.id)}">${esc(s.label)}</button>`)
    .join("");
  return `
    <form class="edit-grid" data-rule-form="${esc(rule.id)}">
      <label><span class="label">규칙</span><input class="field" name="title" value="${esc(rule.title)}" required></label>
      <label><span class="label">피할 것</span><textarea class="field" name="avoid" rows="2">${esc(rule.avoid)}</textarea></label>
      <label><span class="label">할 것</span><textarea class="field" name="do" rows="2">${esc(rule.do)}</textarea></label>
      <div class="draft-target" style="margin:0">
        <label><span class="label">축</span><select class="field" name="axis">${axisOptions}</select></label>
        <label><span class="label">상태</span><select class="field" name="status">
          <option ${rule.status === "확정" ? "selected" : ""}>확정</option>
          <option ${rule.status === "관찰" ? "selected" : ""}>관찰</option>
        </select></label>
      </div>
      <div><span class="label">이 규칙의 근거로 셀 증상</span><div class="tag-set">${tags}</div></div>
      <div class="button-row">
        <button class="button primary" type="submit">저장</button>
        ${rule.id ? `<button class="text-button" type="button" data-rule-delete="${esc(rule.id)}">삭제</button>` : ""}
      </div>
    </form>`;
}

async function submitRule(form) {
  const id = form.dataset.ruleForm;
  const symptoms = [...form.querySelectorAll('[data-rule-symptom][aria-pressed="true"]')].map((b) => b.dataset.ruleSymptom);
  const fields = Object.fromEntries(new FormData(form));
  const rule = { ...fields, symptoms };
  if (id) rule.id = id;
  const saved = await mutate("/api/rules/save", rule, "규칙을 저장했습니다");
  if (saved && !id) {
    ui.openRules.delete("");
    ui.openRules.add(saved.id);
    renderTaste();
  }
}

function promoteSymptom(symptomId) {
  const s = symptomById.get(symptomId);
  ui.openRules.add("");
  renderTaste();
  const form = $('[data-rule-form=""]');
  form.title.value = s.label.split(",")[0];
  form.avoid.value = s.term;
  form.do.value = s.fix;
  form.axis.value = s.axis;
  form.querySelector(`[data-rule-symptom="${symptomId}"]`).setAttribute("aria-pressed", "true");
  form.title.focus();
}

async function copyBlock(audience) {
  const { text } = await api(`/api/block?for=${audience}`);
  data.deliveries.push({ ts: new Date().toISOString(), via: "dashboard", session: "", project: "", rules: [] });
  const copied = await copyText(text);
  toast(copied ? "취향 블록을 복사했습니다. 요청서 끝에 붙여 넣으세요" : "복사하지 못했습니다");
}

/* 3. 분류 */

function inboxList() {
  const all = data.verdicts.slice().sort((a, b) => b.ts.localeCompare(a.ts));
  if (ui.inboxFilter === "all") return all;
  return all.filter((v) => v.status === ui.inboxFilter);
}

function renderInbox() {
  const root = $("#inbox");
  const list = inboxList();
  ui.inboxIndex = Math.min(ui.inboxIndex, Math.max(list.length - 1, 0));
  const filters = [["new", "분류 전"], ["kept", "보관"], ["ignored", "무시"], ["all", "전체"]]
    .map(([id, label]) => {
      const count = id === "all" ? data.verdicts.length : data.verdicts.filter((v) => v.status === id).length;
      return `<button type="button" data-filter="${id}" aria-pressed="${ui.inboxFilter === id}">${label} <span class="mono">${count}</span></button>`;
    })
    .join("");
  const polarity = { negative: "지적", mixed: "칭찬과 지적", positive: "칭찬" };
  const status = { new: "분류 전", kept: "보관", ignored: "무시" };
  const source = { codex: "Codex", claude: "Claude Code", copilot: "Copilot CLI" };
  const symptomOptions = data.symptoms.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join("");

  const rows = list.map((v, index) => `
    <article class="verdict ${index === ui.inboxIndex ? "current" : ""}" data-verdict="${esc(v.id)}" data-index="${index}">
      <div class="info">${shortDate(v.ts)}, ${esc(projectName(v.project))}, ${source[v.source] || "작성기"}${v.origin === "hook" ? " 실시간" : v.origin === "skill" ? " /taste" : ""},
        <button class="text-button" type="button" data-polarity title="칭찬은 규칙 근거로 세지 않습니다. 눌러서 바꾸기">${polarity[v.polarity]}</button></div>
      <div>
        <p class="text">${esc(v.text)}</p>
        ${v.context ? `<details><summary>직전 응답 보기</summary><p>${esc(v.context)}</p></details>` : ""}
        <div class="tags-line">
          ${v.symptoms.map((id) => `<button class="tag" type="button" aria-pressed="true" data-untag="${id}" title="태그 빼기">${esc(symptomById.get(id)?.label || id)} ×</button>`).join("")}
          <select data-tag aria-label="증상 태그 추가"><option value="">+ 증상</option>${symptomOptions}</select>
        </div>
      </div>
      <div class="actions">
        <button class="button ${v.status === "kept" ? "" : "primary"}" type="button" data-status="kept">보관</button>
        <button class="button" type="button" data-status="ignored">무시</button>
        <span class="status-text">${status[v.status]}</span>
      </div>
    </article>`).join("");

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>새로 잡힌 판정 분류</h2>
        <p class="lede">대화 기록에서 화면을 보고 내린 판정으로 보이는 말을 모았습니다. 보관한 판정만 규칙의 근거로 계속 남습니다.</p>
      </div>
      <p class="keys"><kbd>j</kbd><kbd>k</kbd> 이동, <kbd>s</kbd> 보관, <kbd>x</kbd> 무시</p>
    </div>
    <div class="filters">${filters}</div>
    ${rows || `<p class="empty">${ui.inboxFilter === "new" ? "분류할 판정이 없습니다. 디자인 작업을 한 뒤 '새 기록 수집'을 누르세요." : "해당하는 판정이 없습니다."}</p>`}`;
}

async function updateVerdict(id, patch, message) {
  await mutate("/api/verdicts/update", { id, ...patch }, message);
}

function setInboxIndex(index) {
  const list = inboxList();
  if (!list.length) return;
  ui.inboxIndex = Math.max(0, Math.min(index, list.length - 1));
  document.querySelectorAll(".verdict").forEach((el) => {
    el.classList.toggle("current", Number(el.dataset.index) === ui.inboxIndex);
  });
  $(`.verdict[data-index="${ui.inboxIndex}"]`)?.scrollIntoView({ block: "nearest" });
}

/* 4. 흐름 */

function monthKey(iso) {
  return iso.slice(0, 7);
}

function lastMonths(count) {
  const months = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function heatLevel(count, max) {
  if (!count) return 0;
  return Math.max(1, Math.ceil((count / max) * 4));
}

function renderFlow() {
  const root = $("#flow");
  const complaints = data.verdicts.filter(countsAsComplaint);
  const day = 86400000;
  const now = Date.now();
  const recent = complaints.filter((v) => now - Date.parse(v.ts) <= 30 * day).length;
  const previous = complaints.filter((v) => {
    const age = now - Date.parse(v.ts);
    return age > 30 * day && age <= 60 * day;
  }).length;
  const ranked = data.rules
    .map((rule) => ({ rule, evidence: ruleEvidence(rule) }))
    .sort((a, b) => b.evidence.length - a.evidence.length);
  const top = ranked[0];
  // 판정 하나가 여러 규칙에 걸려도 한 번만 센다
  const recurring = new Set(
    ranked
      .filter(({ rule }) => rule.status === "확정")
      .flatMap(({ evidence }) => evidence.filter((v) => now - Date.parse(v.ts) <= 30 * day).map((v) => v.id)),
  ).size;

  const months = lastMonths(7);
  const cells = new Map();
  complaints.forEach((v) => {
    const axes = new Set(v.symptoms.map((id) => symptomById.get(id)?.axis).filter(Boolean));
    axes.forEach((axis) => {
      const key = `${axis}|${monthKey(v.ts)}`;
      const list = cells.get(key) || [];
      list.push(v);
      cells.set(key, list);
    });
  });
  const max = Math.max(1, ...[...cells.values()].map((list) => list.length));
  const header = `<span></span>${months.map((m) => `<span class="col-label mono">${Number(m.slice(5))}월</span>`).join("")}`;
  const body = data.axes.map((axis) => `
    <span class="row-label">${esc(axis.label)}</span>
    ${months.map((m) => {
      const list = cells.get(`${axis.id}|${m}`) || [];
      return `<span class="cell" data-level="${heatLevel(list.length, max)}" data-cell="${axis.id}|${m}">${list.length || ""}</span>`;
    }).join("")}`).join("");

  const symptomRank = data.symptoms
    .map((s) => ({ s, hits: symptomHits(s.id) }))
    .filter(({ hits }) => hits.length)
    .sort((a, b) => b.hits.length - a.hits.length)
    .slice(0, 10);
  const topHits = symptomRank[0]?.hits.length || 1;
  const rankRows = symptomRank.map(({ s, hits }) => `
    <div class="rank-row">
      <span>${esc(s.label)}</span><span class="mono" style="text-align:right">${hits.length}</span>
      <span class="bar" style="width:${(hits.length / topHits) * 100}%"></span>
      <span class="sub">${esc(axisLabel.get(s.axis))}, 최근 ${shortDate(hits.map((v) => v.ts).sort().pop())}, ${new Set(hits.map((v) => projectName(v.project))).size}개 프로젝트</span>
    </div>`).join("");

  const delta = recent - previous;
  const channels = [
    ["hook", "자동 주입"], ["skill", "/taste 적용"], ["handoff-brief", "요청서"], ["handoff-implement", "구현"],
    ["handoff-review", "검토"], ["dashboard", "대시보드 복사"], ["manual", "직접 실행"],
  ];
  const recentDeliveries = data.deliveries.filter((d) => now - Date.parse(d.ts) <= 30 * day);
  const channelRows = channels
    .map(([via, label]) => [label, recentDeliveries.filter((d) => d.via === via).length])
    .filter(([, count]) => count)
    .map(([label, count]) => `<div class="notice-row"><span>${label}</span><span class="mono">${count}</span></div>`)
    .join("");
  const leaks = deliveredButRepeated();
  const leakRows = leaks.slice(0, 6).map(({ verdict, rules }) => `
    <blockquote class="quote">${esc(verdict.text.length > 160 ? `${verdict.text.slice(0, 160)}…` : verdict.text)}
      <cite>${shortDate(verdict.ts)} ${esc(projectName(verdict.project))}, 전달된 규칙: ${rules.map((r) => esc(r.title)).join(", ")}</cite>
    </blockquote>`).join("");
  root.innerHTML = `
    <div class="stats">
      <div class="stat">
        <span class="value">${recent}</span>
        <span class="caption">최근 30일 지적, 직전 30일 대비 ${delta > 0 ? `+${delta}` : delta}</span>
      </div>
      <div class="stat">
        <span class="value">${recurring}</span>
        <span class="caption">최근 30일에 확정 규칙을 어긴 지적. 줄어들수록 규칙이 전달되고 있다는 뜻입니다</span>
      </div>
      <div class="stat">
        <span class="value text-value">${top ? esc(top.rule.title) : "-"}</span>
        <span class="caption">가장 많이 반복한 지적, ${top ? top.evidence.length : 0}회</span>
      </div>
    </div>
    <div class="flow">
      <div>
        <div class="section-head"><div><h2>어느 축에서 지적했나</h2><p class="lede">최근 7개월, 축별 지적 건수. 칸에 올리면 내용을 봅니다.</p></div></div>
        <div class="heat" style="grid-template-columns: max-content repeat(${months.length}, minmax(0, 1fr))">${header}${body}</div>
        <div class="legend">적음 ${[1, 2, 3, 4].map((l) => `<i style="background:var(--heat-${l})"></i>`).join("")} 많음</div>
      </div>
      <div>
        <div class="section-head"><div><h2>반복 증상</h2><p class="lede">무시한 판정과 칭찬은 빼고 셉니다.</p></div></div>
        ${rankRows || `<p class="empty">아직 집계할 판정이 없습니다.</p>`}
      </div>
    </div>
    <div class="flow" style="margin-top:56px">
      <div>
        <div class="section-head"><div><h2>전달했는데도 나온 지적</h2><p class="lede">자동 주입(10-21까지)이나 /taste 적용으로 규칙을 받은 세션에서 같은 규칙의 지적이 다시 나온 경우입니다. 규칙 문장을 더 구체적으로 고칠 후보입니다.</p></div></div>
        ${leakRows || `<p class="empty">아직 없습니다. 취향을 전달한 세션부터 집계합니다.</p>`}
      </div>
      <div>
        <div class="section-head"><div><h2>최근 30일 취향 전달</h2><p class="lede">어느 경로로 취향이 작업에 들어갔는지입니다.</p></div></div>
        ${channelRows || `<p class="empty">아직 전달 기록이 없습니다.</p>`}
      </div>
    </div>`;
  root._cells = cells;
}

function deliveredButRepeated() {
  // 훅은 세션 id를 남기므로 같은 세션에서 전달 뒤에 나온 판정만 이을 수 있다
  const ruleById = new Map(data.rules.map((r) => [r.id, r]));
  const hookDeliveries = data.deliveries.filter((d) => ["hook", "skill"].includes(d.via) && d.session);
  const results = [];
  data.verdicts.filter(countsAsComplaint).forEach((verdict) => {
    const delivery = hookDeliveries.find((d) => d.session === verdict.session && d.ts < verdict.ts);
    if (!delivery) return;
    const rules = delivery.rules
      .map((id) => ruleById.get(id))
      .filter((rule) => rule && (rule.symptoms || []).some((id) => verdict.symptoms.includes(id)));
    if (rules.length) results.push({ verdict, rules });
  });
  return results.sort((a, b) => b.verdict.ts.localeCompare(a.verdict.ts));
}

function showCellTooltip(cell, event) {
  const list = $("#flow")._cells?.get(cell.dataset.cell) || [];
  const tip = $("#tooltip");
  if (!list.length) return hideTooltip();
  const [axis, month] = cell.dataset.cell.split("|");
  const lines = list.slice(0, 4).map((v) => `- ${esc(v.text.slice(0, 60))}${v.text.length > 60 ? "…" : ""}`);
  tip.innerHTML = `<b>${esc(axisLabel.get(axis))}, ${Number(month.slice(5))}월, ${list.length}건</b><br>${lines.join("<br>")}`;
  tip.style.left = `${Math.min(event.clientX + 12, window.innerWidth - 272)}px`;
  tip.style.top = `${event.clientY + 14}px`;
  tip.classList.add("show");
}

function hideTooltip() {
  $("#tooltip").classList.remove("show");
}

/* 토스트 */

let toastTimer;
/* 5. 컴포넌트: labs 시편 평가에서 고른 값 */

const LAB_STATUS_CLASS = { 확정: "", 관찰: "watch", 무관: "free", "새 값 필요": "reject", 미평가: "todo", "해당 없음": "todo" };

const CONDITION_LABELS = { light: "라이트", dark: "다크", desktop: "데스크톱", mobile: "휴대폰 폭" };

function conditionLabel(key) {
  return key.split("+").map((part) => CONDITION_LABELS[part] ?? part).join(", ");
}

// 기준 조건 밖에서 다시 고른 값. 같은 값이면 확인만, 다른 값이면 그 조건의 값을 보인다
function variantNotes(dimension, pref) {
  return Object.entries(pref.variants ?? {})
    .filter(([, variant]) => ["확정", "관찰", "새 값 필요"].includes(variant.status))
    .map(([key, variant]) => {
      const where = conditionLabel(key);
      if (variant.status === "새 값 필요") return `<p class="lab-note">${esc(where)}에서는 모두 별로</p>`;
      const text = variant.value === pref.value ? "같은 값" : labValue(dimension, variant.value)?.label;
      return `<p class="lab-note">${esc(where)}: ${esc(text)} (${esc(variant.status)})</p>`;
    })
    .join("");
}

function labValue(dimension, valueId) {
  return dimension.values.find((v) => v.id === valueId);
}

function componentCard(item, component) {
  const dims = component.dimensions.map((dimension) => {
    const pref = item.preferences[dimension.id];
    const value = labValue(dimension, pref.value);
    const known = ["확정", "관찰"].includes(pref.status);
    const note = pref.notes.length ? `<p class="lab-note">"${esc(pref.notes[pref.notes.length - 1])}"</p>` : "";
    return `
      <div class="lab-dim">
        <span class="lab-dim-label">${esc(dimension.label)}</span>
        <div>
          <span class="lab-dim-value">${known ? esc(value?.label) : pref.status === "무관" ? "상관없음" : "-"}</span>
          ${known ? `<p>${esc(value?.spec)}</p>` : ""}
          ${known ? variantNotes(dimension, pref) : ""}
          ${note}
        </div>
        <span class="state ${LAB_STATUS_CLASS[pref.status] ?? ""}">${esc(pref.status)}</span>
      </div>`;
  }).join("");
  const settled = Object.values(item.preferences).filter((p) => ["확정", "무관", "해당 없음"].includes(p.status)).length;
  const quotes = item.verdicts.map((v) => `
    <blockquote class="quote">${esc(v.text.length > 140 ? `${v.text.slice(0, 140)}…` : v.text)}<cite>${shortDate(v.ts)} 실제 작업</cite></blockquote>`).join("");
  return `
    <article class="lab-card">
      <header class="lab-card-head">
        <div>
          <h3>${esc(item.label)}${component.scope === "global" ? ' <span class="muted">전역</span>' : ""}</h3>
          <p class="muted">${settled}/${component.dimensions.length} 정리, 평가 ${item.judged}회${item.demand ? `, 최근 14일 작업 언급 ${item.demand}회` : ""}</p>
        </div>
        ${item.next ? `<button class="text-button" type="button" data-lab-open="${esc(item.id)}">이어서 평가</button>` : ""}
      </header>
      ${dims}
      ${quotes}
    </article>`;
}

function renderComponents() {
  const root = $("#components");
  if (lab.error) {
    root.innerHTML = `<p class="empty">labs 시편 카탈로그를 읽지 못했습니다: ${esc(lab.error)}</p>`;
    return;
  }
  if (!lab.components.length) {
    root.innerHTML = `<p class="empty">labs 시편 카탈로그가 없습니다. lab/src/specimens/catalog.json을 확인하세요.</p>`;
    return;
  }
  const byId = new Map(lab.catalog.components.map((c) => [c.id, c]));
  const pending = lab.queue.length;
  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>컴포넌트 취향</h2>
        <p class="lede">labs 시편에서 한 차원만 다른 변형을 비교해 고른 값입니다. /taste로 화면 작업을 시작하면 전역 시편 값과 작업에 나온 컴포넌트의 값이 함께 들어갑니다.</p>
      </div>
      <div class="button-row">
        <button class="button primary" type="button" data-lab-open="">${pending ? `시편 평가 열기 (${pending})` : "시편 평가 열기"}</button>
      </div>
    </div>
    <div class="lab-grid">
      ${lab.components.map((item) => (byId.has(item.id) ? componentCard(item, byId.get(item.id)) : "")).join("")}
    </div>`;
}

async function openLab(component) {
  // 비동기 응답 뒤에 여는 창은 팝업 차단에 걸리므로 먼저 빈 창을 열어 둔다
  const win = window.open("", "_blank");
  try {
    const result = await api("/api/lab/open", { component });
    if (win) win.location.href = result.url;
    else window.location.href = result.url;
  } catch (error) {
    win?.close();
    toast(error.message);
  }
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* 이벤트 */

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, [data-cell]");
  if (!target) return;

  if (target.dataset.tab) return selectTab(target.dataset.tab);
  if (target.dataset.symptom) return toggleSymptom(target.dataset.symptom);
  if (target.dataset.remove !== undefined) {
    draft.items.splice(Number(target.dataset.remove), 1);
    saveDraft();
    return renderCompose();
  }
  if (target.id === "copy-log") return copyDraft(true);
  if (target.id === "copy-only") return copyDraft(false);
  if (target.id === "draft-clear") {
    draft = { target: "", keep: "", withRules: draft.withRules, items: [] };
    saveDraft();
    return renderCompose();
  }

  if (target.dataset.ruleToggle !== undefined) {
    const id = target.dataset.ruleToggle === "__new" ? "" : target.dataset.ruleToggle;
    const rule = target.closest(".rule");
    const open = rule.classList.toggle("open");
    target.setAttribute("aria-expanded", String(open));
    if (open) ui.openRules.add(id);
    else ui.openRules.delete(id);
    return;
  }
  if (target.dataset.ruleSymptom) {
    const pressed = target.getAttribute("aria-pressed") === "true";
    return target.setAttribute("aria-pressed", String(!pressed));
  }
  if (target.dataset.ruleDelete) {
    if (!confirm("이 규칙을 삭제할까요?")) return;
    ui.openRules.delete(target.dataset.ruleDelete);
    return mutate("/api/rules/delete", { id: target.dataset.ruleDelete }, "규칙을 삭제했습니다");
  }
  if (target.dataset.promote) return promoteSymptom(target.dataset.promote);
  if (target.dataset.block) return copyBlock(target.dataset.block);
  if (target.dataset.labOpen !== undefined) return openLab(target.dataset.labOpen);
  if (target.id === "export-md") {
    const result = await mutate("/api/export", {});
    if (result) toast(`생성: ${result.path}`);
    return;
  }

  if (target.dataset.filter) {
    ui.inboxFilter = target.dataset.filter;
    ui.inboxIndex = 0;
    return renderInbox();
  }
  const verdictEl = target.closest("[data-verdict]");
  if (verdictEl && target.dataset.status) {
    return updateVerdict(verdictEl.dataset.verdict, { status: target.dataset.status });
  }
  if (verdictEl && target.dataset.polarity !== undefined) {
    const order = ["negative", "mixed", "positive"];
    const verdict = data.verdicts.find((v) => v.id === verdictEl.dataset.verdict);
    const next = order[(order.indexOf(verdict.polarity) + 1) % order.length];
    return updateVerdict(verdict.id, { polarity: next });
  }
  if (verdictEl && target.dataset.untag) {
    const verdict = data.verdicts.find((v) => v.id === verdictEl.dataset.verdict);
    return updateVerdict(verdict.id, { symptoms: verdict.symptoms.filter((s) => s !== target.dataset.untag) });
  }

  if (target.id === "harvest-button") {
    target.disabled = true;
    target.textContent = "수집 중";
    const result = await mutate("/api/harvest", {});
    target.disabled = false;
    target.textContent = "새 기록 수집";
    if (result) toast(`새 판정 ${result.added}건 (읽은 파일 ${result.scanned_files}개)`);
    return;
  }
  if (target.id === "theme-button") {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try {
      localStorage.setItem("taste-ledger-theme", document.documentElement.dataset.theme);
    } catch (error) {
      // 테마 기억은 편의 기능이다
    }
  }
});

document.addEventListener("change", (event) => {
  const select = event.target.closest("select[data-tag]");
  if (select && select.value) {
    const verdict = data.verdicts.find((v) => v.id === select.closest("[data-verdict]").dataset.verdict);
    if (!verdict.symptoms.includes(select.value)) {
      updateVerdict(verdict.id, { symptoms: [...verdict.symptoms, select.value] });
    }
  }
  if (event.target.id === "draft-rules") {
    draft.withRules = event.target.checked;
    refreshPreview();
  }
});

document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "symptom-search") {
    // 입력창은 그대로 두고 목록만 바꿔야 한글 조합이 끊기지 않는다
    ui.search = el.value;
    $("#symptom-list").innerHTML = symptomListHtml();
    return;
  }
  if (el.id === "draft-target") draft.target = el.value;
  else if (el.id === "draft-keep") draft.keep = el.value;
  else if (el.dataset.field) {
    const index = Number(el.closest(".draft-item").dataset.index);
    draft.items[index][el.dataset.field] = el.value;
  } else return;
  refreshPreview();
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-rule-form]");
  if (!form) return;
  event.preventDefault();
  submitRule(form);
});

document.addEventListener("pointerover", (event) => {
  const cell = event.target.closest("[data-cell]");
  if (cell) showCellTooltip(cell, event);
  else hideTooltip();
});

document.addEventListener("keydown", (event) => {
  if (event.target.closest?.("input, textarea, select") || event.metaKey || event.ctrlKey || event.altKey) return;
  const tabs = { 1: "compose", 2: "taste", 3: "inbox", 4: "flow", 5: "components" };
  if (tabs[event.key]) return selectTab(tabs[event.key], true);
  if (ui.tab !== "inbox") return;
  const list = inboxList();
  const current = list[ui.inboxIndex];
  if (event.key === "j") setInboxIndex(ui.inboxIndex + 1);
  else if (event.key === "k") setInboxIndex(ui.inboxIndex - 1);
  else if (event.key === "s" && current) updateVerdict(current.id, { status: "kept" }, "보관했습니다");
  else if (event.key === "x" && current) updateVerdict(current.id, { status: "ignored" }, "무시했습니다");
});

window.addEventListener("resize", () => moveIndicator(true));

try {
  const savedTheme = localStorage.getItem("taste-ledger-theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
} catch (error) {
  // 저장된 테마가 없으면 시스템 설정을 따른다
}

const initialTab = new URLSearchParams(location.search).get("tab");
if (["compose", "taste", "inbox", "flow"].includes(initialTab)) ui.tab = initialTab;
selectTab(ui.tab, true);
reload().catch((error) => toast(error.message));
document.fonts?.ready.then(() => moveIndicator(true));
