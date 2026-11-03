// 이 파일은 적용 후 화면에서만 실행한다. 저장과 입력값은 공통 app.js가 소유한다.
(() => {
  const tabList = document.querySelector(".tabs");
  const tabs = [...tabList.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const ease = "cubic-bezier(0.215, 0.61, 0.355, 1)";
  const indicator = document.createElement("span");
  indicator.className = "tab-indicator";
  indicator.setAttribute("aria-hidden", "true");
  tabList.prepend(indicator);
  tabList.dataset.motion = "true";

  const stage = document.createElement("div");
  stage.className = "panel-stage";
  panels[0].before(stage);
  stage.append(...panels);
  let active = tabs.findIndex(
    (tab) => tab.getAttribute("aria-selected") === "true",
  );
  let transitions = [];

  function moveIndicator() {
    const tab = tabs[active];
    indicator.style.transform = `translateX(${tab.offsetLeft}px)`;
    indicator.style.width = `${tab.offsetWidth}px`;
  }

  function finishTransitions() {
    for (const animation of transitions) animation.cancel();
    transitions = [];
    for (const panel of panels) {
      delete panel.dataset.exiting;
      panel.inert = panel.hidden;
    }
  }

  const selectionObserver = new MutationObserver(() => {
    const next = tabs.findIndex(
      (tab) => tab.getAttribute("aria-selected") === "true",
    );
    if (next === active) return;
    const previous = active;
    active = next;
    moveIndicator();
    finishTransitions();
    if (reduceMotion.matches) return;

    const direction = next > previous ? 1 : -1;
    const outgoing = panels[previous];
    const incoming = panels[next];
    outgoing.dataset.exiting = "true";
    outgoing.inert = true;
    const oldHeight = outgoing.getBoundingClientRect().height;
    const newHeight = incoming.getBoundingClientRect().height;
    const timing = { duration: 180, easing: ease };
    const leave = outgoing.animate(
      [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0, transform: `translateX(${-direction * 12}px)` },
      ],
      timing,
    );
    const enter = incoming.animate(
      [
        { opacity: 0, transform: `translateX(${direction * 12}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      timing,
    );
    const height = stage.animate(
      [{ height: `${oldHeight}px` }, { height: `${newHeight}px` }],
      timing,
    );
    transitions = [leave, enter, height];
    leave.onfinish = () => {
      delete outgoing.dataset.exiting;
    };
  });
  for (const tab of tabs)
    selectionObserver.observe(tab, {
      attributes: true,
      attributeFilter: ["aria-selected"],
    });
  const sizeObserver = new ResizeObserver(moveIndicator);
  sizeObserver.observe(tabList);
  moveIndicator();

  const header = document.querySelector(".app-header");
  const updateHeader = () => {
    header.dataset.scrolled = String(scrollY > 4);
  };
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  const validations = [];
  for (const input of document.querySelectorAll(".field input")) {
    const hint = input.closest(".field").querySelector(".field-hint");
    const help = hint.textContent;
    let timer;
    const validate = () => {
      const invalid = !input.validity.valid;
      const message = invalid ? input.validationMessage : help;
      if (!reduceMotion.matches && hint.textContent !== message) {
        hint.animate(
          [
            { opacity: 0, transform: "translateY(2px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 160, easing: ease },
        );
      }
      hint.textContent = message;
      hint.dataset.error = String(invalid);
      input.setAttribute("aria-invalid", String(invalid));
    };
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(validate, 400);
    });
    document.querySelector("#reset-settings").addEventListener("click", () => {
      clearTimeout(timer);
      validate();
    });
    validations.push(() => clearTimeout(timer));
  }

  window.addEventListener("pagehide", (event) => {
    finishTransitions();
    validations.forEach((cancel) => cancel());
    // 뒤로 가기 캐시에 남은 문서는 같은 관찰자를 유지한 채 다시 표시된다.
    if (event.persisted) return;
    selectionObserver.disconnect();
    sizeObserver.disconnect();
    window.removeEventListener("scroll", updateHeader);
  });
})();
