const form = document.querySelector("#settings-form");
const tabs = [...document.querySelectorAll('[role="tab"]')];
const dialog = document.querySelector("#review-dialog");
const toast = document.querySelector(".toast");
const storageKey = `tastepin-settings-example:${location.pathname}`;
const defaults = {
  workspaceName: "스튜디오 모음",
  slug: "studio-moeum",
  timezone: "Asia/Seoul",
  mentions: true,
  projects: true,
  digest: false,
};
let saved = { ...defaults };
let toastTimer;

function notify(message) {
  clearTimeout(toastTimer);
  document.querySelector("#toast-message").textContent = message;
  toast.dataset.visible = "true";
  toastTimer = setTimeout(() => {
    toast.dataset.visible = "false";
  }, 3200);
}

function activateTab(tab, focus = false) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute("aria-controls")).hidden =
      !selected;
  }
  if (focus) tab.focus();
}

for (const tab of tabs) {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(tab);
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      activateTab(tabs[next], true);
    }
  });
}

function populate(settings) {
  for (const [name, value] of Object.entries(settings)) {
    const field = form.elements.namedItem(name);
    if (field.type === "checkbox") field.checked = value;
    else field.value = value;
  }
}

function readSettings() {
  const data = new FormData(form);
  return {
    workspaceName: data.get("workspaceName").trim(),
    slug: data.get("slug").trim(),
    timezone: data.get("timezone"),
    mentions: data.has("mentions"),
    projects: data.has("projects"),
    digest: data.has("digest"),
  };
}

try {
  const stored = JSON.parse(localStorage.getItem(storageKey));
  const valid =
    stored &&
    Object.entries(defaults).every(
      ([key, value]) => typeof stored[key] === typeof value,
    ) &&
    ["Asia/Seoul", "Asia/Tokyo", "UTC"].includes(stored.timezone);
  if (valid)
    saved = Object.fromEntries(
      Object.keys(defaults).map((key) => [key, stored[key]]),
    );
} catch {
  notify("저장된 설정을 불러오지 못했습니다.");
}
populate(saved);

// 숨겨진 탭의 필드가 유효하지 않으면 해당 탭을 먼저 열어 브라우저가 오류 위치로 이동하게 한다.
form.addEventListener(
  "invalid",
  (event) => {
    const panel = event.target.closest('[role="tabpanel"]');
    if (panel?.hidden)
      activateTab(
        document.getElementById(panel.getAttribute("aria-labelledby")),
      );
  },
  true,
);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const settings = readSettings();
  document.querySelector("#review-name").textContent = settings.workspaceName;
  document.querySelector("#review-slug").textContent = settings.slug;
  document.querySelector("#review-timezone").textContent =
    form.elements.timezone.selectedOptions[0].text;
  const count = [settings.mentions, settings.projects, settings.digest].filter(
    Boolean,
  ).length;
  document.querySelector("#review-notifications").textContent =
    `${count}개 켜짐`;
  dialog.showModal();
});

document
  .querySelector("#cancel-save")
  .addEventListener("click", () => dialog.close());
document.querySelector("#confirm-save").addEventListener("click", () => {
  const settings = readSettings();
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
    saved = settings;
    dialog.close();
    notify("설정을 저장했습니다.");
  } catch {
    dialog.close();
    notify("저장하지 못했습니다. 브라우저의 저장 공간 설정을 확인해 주세요.");
  }
});
document.querySelector("#reset-settings").addEventListener("click", () => {
  populate(saved);
  notify("마지막으로 저장한 설정을 불러왔습니다.");
});
