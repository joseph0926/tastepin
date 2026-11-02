// 취향 규칙 중 계산된 스타일 값으로 잴 수 있는 것을 페이지 안에서 측정한다.
// 취향 기준은 lintpolicy.py가 현재 선택과 화면 조건으로 만든다. 선택 없는 항목은 통과가 아닌 미판정이다.
({ phase, policy }) => {
  const limits = policy.checks;
  // 휴대폰 에뮬레이션은 넘친 콘텐츠에 맞춰 innerWidth를 늘리므로 기기 너비를 함께 본다
  const VW = Math.min(window.innerWidth, screen.width || window.innerWidth);
  const VH = window.innerHeight;
  const styleCache = new Map();
  const styleOf = (el) => {
    if (!styleCache.has(el)) styleCache.set(el, getComputedStyle(el));
    return styleCache.get(el);
  };

  /* 색 */

  // oklch(), color() 같은 계산값도 같은 방식으로 읽도록 캔버스에 칠해 sRGB로 되돌린다
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const paint = canvas.getContext("2d", { willReadFrequently: true });
  const colorCache = new Map();
  function rgba(value) {
    if (colorCache.has(value)) return colorCache.get(value);
    let color = { r: 0, g: 0, b: 0, a: 0 };
    if (value && value !== "transparent" && value !== "none") {
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = "rgba(0, 0, 0, 0)";
      paint.fillStyle = value;
      paint.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
      color = { r, g, b, a: a / 255 };
    }
    colorCache.set(value, color);
    return color;
  }

  const linear = (channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (c) => 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
  function contrast(a, b) {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  }
  function oklch(c) {
    const r = linear(c.r);
    const g = linear(c.g);
    const b = linear(c.b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    let h = (Math.atan2(B, A) * 180) / Math.PI;
    if (h < 0) h += 360;
    return { L, C: Math.hypot(A, B), h };
  }
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  // 바탕을 칠하지 않은 페이지의 캔버스 색. color-scheme이 다크로 해석되면 Chrome은 어두운 캔버스를 쓴다
  const rootScheme = styleOf(document.documentElement).colorScheme || "normal";
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const darkCanvas = rootScheme.includes("dark") && (!rootScheme.includes("light") || prefersDark);
  const CANVAS = darkCanvas ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };

  // 요소 뒤에 실제로 보이는 바탕색. 이미지나 그라데이션 위라 값으로 정할 수 없으면 null
  function effectiveBackground(el) {
    const layers = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const style = styleOf(node);
      if (style.backgroundImage !== "none") return null;
      const color = rgba(style.backgroundColor);
      if (color.a > 0) layers.push(color);
      if (color.a >= 0.99) break;
    }
    return layers.reverse().reduce((below, layer) => over(layer, below), CANVAS);
  }

  /* 요소 */

  const opacityCache = new Map();
  function effectiveOpacity(el) {
    if (!el || el.nodeType !== 1) return 1;
    if (!opacityCache.has(el)) {
      opacityCache.set(el, parseFloat(styleOf(el).opacity) * effectiveOpacity(el.parentElement));
    }
    return opacityCache.get(el);
  }

  function isShown(el) {
    const rect = el.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2 && styleOf(el).visibility !== "hidden" && effectiveOpacity(el) > 0.05;
  }

  const inFirstViewport = (rect) => rect.bottom > 0 && rect.top < VH && rect.right > 0 && rect.left < VW;

  function describe(el) {
    const parts = [];
    for (let node = el; node && node !== document.body && parts.length < 3; node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      const classes = [...node.classList].filter((name) => name.length <= 24).slice(0, 2);
      if (classes.length) part += "." + classes.join(".");
      parts.unshift(part);
    }
    return parts.join(" > ");
  }
  const snippet = (text) => (text.length > 28 ? `${text.slice(0, 28)}…` : text);

  // 직접 글자를 가진 요소와 그 글자. 같은 부모의 텍스트 노드는 합친다
  function textBlocks() {
    const blocks = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && blocks.size < 4000; node = walker.nextNode()) {
      const text = node.nodeValue.replace(/\s+/g, " ").trim();
      const el = node.parentElement;
      if (text.length < 2 || !el || el.closest("script, style, noscript, template, svg, [hidden]")) continue;
      blocks.set(el, `${blocks.get(el) || ""} ${text}`.trim());
    }
    return [...blocks].map(([el, text]) => ({ el, text }));
  }

  if (phase === "early") {
    window.__tasteEarlyHidden = textBlocks()
      .filter(({ el }) => {
        const rect = el.getBoundingClientRect();
        return inFirstViewport(rect) && rect.width >= 2 && rect.height >= 2 && effectiveOpacity(el) <= 0.1;
      })
      .map(({ el }) => el);
    return window.__tasteEarlyHidden.length;
  }

  const checks = [];
  const add = (id, symptom, title, level, summary, samples = [], fix = null) => {
    const setting = limits[id];
    checks.push({
      id, symptom, title, kind: setting?.kind || "taste",
      level: setting ? level : "skip",
      summary: setting ? summary : "현재 선택에서 자동 검사할 기준을 정하지 못했다",
      samples: setting ? samples.slice(0, 4) : [],
      rule_ids: setting?.rules || [],
      ...(setting && fix ? { fix } : {}),
    });
  };
  const levelBy = (count, warnAt, failAt) => (count >= failAt ? "fail" : count >= warnAt ? "warn" : "pass");

  const blocks = textBlocks()
    .filter(({ el }) => isShown(el))
    .map((block) => ({ ...block, style: styleOf(block.el), size: parseFloat(styleOf(block.el).fontSize) }));
  const totalText = blocks.reduce((sum, b) => sum + b.text.length, 0) || 1;

  /* 바탕색: 지금 테마에서 선택한 색. 내용 표면의 색을 페이지 바탕과 같게 강제하지 않는다. */
  const pageBackground = effectiveBackground(document.body) || CANVAS;
  const elements = [...document.body.querySelectorAll("*")].slice(0, 8000).filter(isShown);
  {
    const chosen = limits["warm-background"]?.color;
    const actual = effectiveBackground(document.body);
    const expected = rgba(chosen);
    const difference = Math.max(...["r", "g", "b"].map((channel) => Math.abs(pageBackground[channel] - expected[channel])));
    add("warm-background", "color-dated", "바탕색", actual && difference > 10 ? "fail" : "pass",
      actual ? `바탕 ${hex(actual)}, 고른 바탕 ${chosen} (RGB 채널별 오차 10까지 허용)` : "이미지나 그라데이션 바탕은 직접 확인한다",
      [], `현재 테마에서 고른 바탕 ${chosen}을 기준으로 맞춘다.`);
    if (chosen && !actual) checks[checks.length - 1].level = "skip";
  }

  /* 요소별 형태 측정 */

  const CONTROL = "button, input, select, textarea, summary, a, [role=button], [role=tab], [role=link]";
  const TOGGLE = "input[type=checkbox], input[type=radio], [role=switch], [role=checkbox], [role=radio]";
  const NOT_A_BOX = "table, thead, tbody, tfoot, tr, th, td, hr, img, svg, video, canvas, iframe, picture, pre, code, kbd";

  function cornerRadius(style, rect) {
    const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius];
    return Math.max(...corners.map((value) => {
      const first = value.split(" ")[0];
      return first.endsWith("%") ? (parseFloat(first) / 100) * Math.min(rect.width, rect.height) : parseFloat(first) || 0;
    }));
  }
  function borderSides(style) {
    return ["Top", "Right", "Bottom", "Left"].filter((side) => {
      const width = parseFloat(style[`border${side}Width`]);
      const kind = style[`border${side}Style`];
      return width >= 1 && kind !== "none" && kind !== "hidden" && rgba(style[`border${side}Color`]).a >= 0.15;
    }).length;
  }
  // 계산값의 그림자 목록을 층별로 나눈다. Chrome은 색을 앞에 두고 길이를 뒤에 둔다
  function shadowLayers(value) {
    if (!value || value === "none") return [];
    return value.split(/,(?![^(]*\))/).map((layer) => {
      const colorMatch = layer.match(/^\s*([a-z]+\([^)]*\)|#[0-9a-f]+)/i);
      const lengths = (layer.replace(colorMatch ? colorMatch[0] : "", "").match(/-?[\d.]+px/g) || []).map(parseFloat);
      const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
      return { color: rgba(colorMatch ? colorMatch[1] : "black"), x, y, blur, spread, inset: /inset/.test(layer) };
    }).filter((layer) => layer.color.a > 0.02 && (layer.x || layer.y || layer.blur || layer.spread));
  }
  // 콜아웃과 인용 블록의 왼쪽 강조 막대. surface-grouping 규칙이 어떤 경우에도 금지한다(2026-10-17 판정).
  // 왼쪽 border만 굵거나 색이 있는 경우, 오른쪽으로 민 inset 그림자, 왼쪽 끝에 붙은 좁고 긴 가상 요소를 같은 모양으로 본다
  function leftBorderBar(style) {
    const visible = (side) => {
      const kind = style[`border${side}Style`];
      const width = parseFloat(style[`border${side}Width`]) || 0;
      return kind !== "none" && kind !== "hidden" && rgba(style[`border${side}Color`]).a >= 0.15 ? width : 0;
    };
    const left = visible("Left");
    if (left < 1) return null;
    const others = Math.max(visible("Top"), visible("Right"), visible("Bottom"));
    const color = rgba(style.borderLeftColor);
    const marked = left >= 2 || oklch(color).C >= 0.06;
    const alone = others < 1 ? marked : left >= others * 2 && left - others >= 2;
    return alone ? `border-left ${left}px ${hex(color)}` : null;
  }
  function insetBar(layers) {
    const bar = layers.find((s) => s.inset && s.x >= 2 && !s.y && !s.blur && s.spread <= 0 && s.color.a >= 0.3);
    return bar ? `inset 그림자 ${bar.x}px ${hex(bar.color)}` : null;
  }
  function pseudoBar(el, rect) {
    for (const which of ["::before", "::after"]) {
      const style = getComputedStyle(el, which);
      if (style.content === "none" || style.content === "normal" || style.position !== "absolute") continue;
      const width = parseFloat(style.width) || 0;
      const height = parseFloat(style.height) || 0;
      const color = rgba(style.backgroundColor);
      if (width >= 2 && width <= 8 && height >= Math.max(16, rect.height * 0.6) && parseFloat(style.left) <= 4 && color.a >= 0.3) {
        return `${which} 세로 막대 ${width}px ${hex(color)}`;
      }
    }
    return null;
  }
  const gradientColors = (value) =>
    (value.match(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|#[0-9a-f]{3,8}\b/gi) || [])
      .map(rgba)
      .filter((c) => c.a >= 0.1);

  const boxed = [];
  const accentBars = [];
  const cards = [];
  const roundContainers = [];
  const roundControls = [];
  const shadowed = [];
  const glowing = [];
  const colorGradients = [];
  const gradientText = [];
  const stickyBlur = [];
  const glass = [];
  const slowMotion = [];
  const loops = [];
  let movingElements = 0;
  const palette = [];

  for (const el of elements) {
    const style = styleOf(el);
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    const isToggle = el.matches(TOGGLE);
    const isControl = el.matches(CONTROL) && rect.height < 64;
    const notBox = el.matches(NOT_A_BOX) || isToggle || isControl;
    const layers = shadowLayers(style.boxShadow);
    // Tailwind ring처럼 번짐 없이 spread만 있는 그림자는 네 변 테두리와 같다
    const ring = layers.some((s) => !s.blur && !s.x && !s.y && s.spread >= 1 && s.color.a >= 0.15);
    const sides = ring ? 4 : borderSides(style);
    const radius = cornerRadius(style, rect);
    const shadows = layers.filter((s) => !s.inset && (s.blur > 0 || s.x || s.y));
    const background = rgba(style.backgroundColor);
    const hasText = (el.textContent || "").trim().length >= 2;

    let distinct = false;
    if (background.a >= 0.5 && el.parentElement) {
      const own = effectiveBackground(el);
      const parent = effectiveBackground(el.parentElement);
      if (own && parent) {
        const a = oklch(own);
        const b = oklch(parent);
        distinct = Math.abs(a.L - b.L) >= 0.012 || Math.abs(a.C - b.C) >= 0.02;
      }
    }

    const isBoxed = !notBox && sides >= 3 && rect.width >= 80 && rect.height >= 32;
    if (isBoxed) boxed.push(el);
    if (!notBox && hasText && rect.width >= 80 && rect.height >= 20) {
      const bar = leftBorderBar(style) || insetBar(layers) || pseudoBar(el, rect);
      if (bar) accentBars.push({ el, bar });
    }
    const isCard = !notBox && hasText && rect.width >= 120 && rect.height >= 56 && rect.width <= VW * 0.95
      && (sides >= 3 || shadows.length > 0 || distinct);
    if (isCard) cards.push(el);
    if (!notBox && !isControl && !isToggle && (isCard || isBoxed || (distinct && rect.width >= 120 && rect.height >= 48)) &&
        limits.radius?.surface != null && radius > limits.radius.surface + 0.5) {
      roundContainers.push({ el, radius });
    }
    if (isControl && !isToggle && rect.height >= 24 && (sides >= 1 || background.a >= 0.5)) {
      const skipButton = limits.radius?.skipButtons && el.matches("button, a, [role=button]");
      if (!skipButton && limits.radius?.control != null && radius > limits.radius.control + 0.5) roundControls.push({ el, radius });
    }
    if (shadows.length && rect.width >= 40 && rect.height >= 24) shadowed.push(el);
    if (shadows.some((s) => s.blur >= 8 && oklch(s.color).C >= 0.08)) glowing.push(el);

    if (style.backgroundImage.includes("gradient(")) {
      const colors = gradientColors(style.backgroundImage);
      const clipped = style.webkitBackgroundClip === "text" || style.backgroundClip === "text";
      if (clipped) gradientText.push(el);
      else if (area >= VW * VH * 0.02 && colors.some((c) => oklch(c).C >= 0.05)) colorGradients.push(el);
    }
    const backdrop = style.backdropFilter || style.webkitBackdropFilter || "none";
    if (backdrop.includes("blur")) (["fixed", "sticky"].includes(style.position) ? stickyBlur : glass).push(el);

    const seconds = (value) => value.split(",").map((part) => parseFloat(part) * (part.trim().endsWith("ms") ? 0.001 : 1));
    const transitions = seconds(style.transitionDuration);
    const transitionProperties = style.transitionProperty.split(",").map((p) => p.trim());
    const longestTransition = Math.max(0, ...transitions.filter((_, i) => (transitionProperties[i] || transitionProperties[0]) !== "none"));
    const animationNames = style.animationName.split(",").map((n) => n.trim()).filter((n) => n !== "none");
    if (longestTransition > 0 || animationNames.length) movingElements += 1;
    const durationLimit = limits["motion-slow"]?.seconds;
    if (durationLimit != null && longestTransition > durationLimit + 0.01) slowMotion.push({ el, seconds: longestTransition, kind: "transition" });
    if (animationNames.length) {
      const durations = seconds(style.animationDuration);
      const counts = style.animationIterationCount.split(",").map((c) => c.trim());
      animationNames.forEach((name, i) => {
        const duration = durations[i] ?? durations[0];
        const infinite = (counts[i] ?? counts[0]) === "infinite";
        // 작은 회전 표시(로딩 스피너)는 장식 루프로 세지 않는다
        if (infinite && (rect.width > 48 || rect.height > 48)) loops.push({ el, name });
        else if (!infinite && durationLimit != null && duration > durationLimit + 0.01) slowMotion.push({ el, seconds: duration, kind: `animation ${name}` });
      });
    }

    if (background.a >= 0.5 && area >= 300) {
      const color = effectiveBackground(el);
      if (color) palette.push({ color, weight: Math.min(area / 2000, 60), el });
    }
    if (sides >= 1) {
      const color = rgba(style.borderTopColor);
      if (color.a >= 0.5) palette.push({ color, weight: 4, el });
    }
  }
  for (const block of blocks) {
    const color = rgba(block.style.color);
    if (color.a >= 0.5) palette.push({ color, weight: Math.min(block.text.length / 4, 40), el: block.el });
  }

  const sample = (list, extra = () => "") => list.map((item) => {
    const el = item.el || item;
    return `${describe(el)}${extra(item)}`;
  });

  {
    const level = levelBy(boxed.length, 3, 6);
    add("box-borders", "border-heavy", "테두리 박스", level,
      `세 변 이상 테두리로 감싼 영역 ${boxed.length}개. 테두리는 표의 행과 입력 필드에만 남긴다`, sample(boxed));
  }
  add("accent-bar", "border-heavy", "왼쪽 강조 막대", accentBars.length ? "fail" : "pass",
    accentBars.length
      ? `콜아웃이나 인용 블록에 붙은 왼쪽 강조 막대 ${accentBars.length}개. 하나라도 있으면 실패`
      : "콜아웃과 인용 블록에 왼쪽 강조 막대가 없다",
    sample(accentBars, (a) => ` ${a.bar}`));
  {
    const level = levelBy(cards.length, 3, 6);
    add("cards", "box-heavy", "카드 형태", level,
      `테두리, 그림자나 다른 바탕으로 떠 있는 카드 ${cards.length}개`, sample(cards));
  }
  {
    const count = roundContainers.length + roundControls.length;
    const level = count ? "fail" : "pass";
    const parts = [];
    if (limits.radius?.surface != null) parts.push(`컨테이너 선택 ${limits.radius.surface}px 초과 ${roundContainers.length}개`);
    if (limits.radius?.control != null) parts.push(`버튼과 입력 선택 ${limits.radius.control}px 초과 ${roundControls.length}개`);
    if (limits.radius?.skipButtons) parts.push("별도로 고른 버튼 모서리는 직접 확인");
    add("radius", "radius-heavy", "모서리 반경", level, parts.join(", "),
      sample([...roundContainers, ...roundControls], (r) => ` ${Math.round(r.radius)}px`),
      `고른 모서리 값을 상한으로 쓴다 (렌더링 오차 0.5px 허용). ${parts.join(", ")}`);
  }
  add("shadows", "shadow-heavy", "그림자", levelBy(shadowed.length, 3, 6),
    `그림자로 띄운 요소 ${shadowed.length}개`, sample(shadowed));

  /* 장식 효과 */

  const glowText = blocks.filter((b) => shadowLayers(b.style.textShadow).some((s) => s.blur >= 2));
  add("glow", "neon-glow", "글로우", glowText.length || glowing.length ? "fail" : "pass",
    `흐린 text-shadow ${glowText.length}곳, 색 있는 번짐 그림자 ${glowing.length}곳`,
    [...sample(glowText.map((b) => b.el)), ...sample(glowing)]);
  {
    const count = colorGradients.length + gradientText.length;
    const level = gradientText.length || colorGradients.length >= 2 ? "fail" : count ? "warn" : "pass";
    add("gradients", "gradient-glass", "색 그라데이션", level,
      `색이 있는 큰 그라데이션 ${colorGradients.length}개, 그라데이션 글자 ${gradientText.length}개`,
      [...sample(gradientText), ...sample(colorGradients)]);
  }
  add("glass", "gradient-glass", "글래스 효과", glass.length ? "warn" : "pass",
    `고정 패널이 아닌 곳의 backdrop blur ${glass.length}개`, sample(glass));
  add("sticky-blur", "sticky-blur", "고정 패널 blur", stickyBlur.length ? "warn" : "pass",
    `고정 패널의 반투명 blur ${stickyBlur.length}개. 스크롤 중 큰 사각형으로 보이는지 눈으로 확인한다`, sample(stickyBlur));

  /* 강조색 수 */

  {
    const chromatic = palette.filter((p) => oklch(p.color).C >= 0.06);
    const total = chromatic.reduce((sum, p) => sum + p.weight, 0);
    const sorted = chromatic.map((p) => ({ ...p, hue: oklch(p.color).h })).sort((a, b) => a.hue - b.hue);
    const clusters = [];
    for (const item of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && item.hue - last.maxHue <= 25) {
        last.items.push(item);
        last.maxHue = item.hue;
      } else {
        clusters.push({ items: [item], maxHue: item.hue });
      }
    }
    // 색상환 양 끝(빨강 350도와 10도)은 같은 색이다
    if (clusters.length > 1 && clusters[0].items[0].hue + 360 - clusters[clusters.length - 1].maxHue <= 25) {
      clusters[0].items.push(...clusters.pop().items);
    }
    const counted = clusters
      .map((c) => ({ ...c, weight: c.items.reduce((sum, i) => sum + i.weight, 0) }))
      .filter((c) => c.items.length >= 2 && c.weight >= total * 0.03)
      .sort((a, b) => b.weight - a.weight);
    const level = counted.length >= 4 ? "fail" : counted.length === 3 ? "warn" : "pass";
    const names = counted.map((c) => hex(c.items.sort((a, b) => b.weight - a.weight)[0].color));
    add("accent-count", "color-too-many", "강조색 수", level,
      `채도 있는 색상 계열 ${counted.length}개${names.length ? ` (${names.join(", ")})` : ""}. 강조색 1개와 상태색만 둔다`,
      counted.map((c) => `${hex(c.items[0].color)} ${describe(c.items[0].el)}`));
  }

  /* 글자 대비 */

  {
    const failures = [];
    let measured = 0;
    for (const block of blocks) {
      if (block.el.closest(":disabled, [aria-disabled=true], [inert]")) continue;
      const background = effectiveBackground(block.el);
      if (!background) continue;
      const color = rgba(block.style.color);
      const text = over({ ...color, a: color.a * Math.min(1, effectiveOpacity(block.el)) }, background);
      const weight = parseInt(block.style.fontWeight, 10) || 400;
      const large = block.size >= 24 || (block.size >= 18.66 && weight >= 700);
      const ratio = contrast(text, background);
      measured += 1;
      if (ratio < (large ? 3 : 4.5)) failures.push({ el: block.el, text: block.text, ratio, large });
    }
    failures.sort((a, b) => a.ratio - b.ratio);
    const body = failures.filter((f) => !f.large);
    const level = body.length >= 1 || failures.length >= 3 ? "fail" : failures.length ? "warn" : "pass";
    const worst = failures[0] ? `, 최저 ${failures[0].ratio.toFixed(1)}:1` : "";
    add("text-contrast", "contrast-low", "글자 대비", level,
      `글자 ${measured}곳 중 기준 미달 ${failures.length}곳(본문 4.5:1, 큰 글자 3:1)${worst}`,
      failures.map((f) => `${describe(f.el)} "${snippet(f.text)}" ${f.ratio.toFixed(1)}:1`));
  }

  /* 서체 */

  const firstFamily = (style) => style.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
  const GENERIC_FAMILIES = new Set(["sans-serif", "serif", "ui-sans-serif", "ui-serif", "monospace"]);
  const chosenFamilies = (value) => {
    const families = (value || "").split(",").map((name) => name.trim().replace(/^["']|["']$/g, "").toLowerCase());
    const named = families.filter((name) => name && !GENERIC_FAMILIES.has(name));
    return named.length ? named : families;
  };
  const MONO = /mono|code|consolas|menlo|courier|monaco|ui-monospace/i;
  const bodyBlocks = blocks.filter((b) => !b.el.closest("h1, h2, h3, h4, h5, h6") && b.size <= Math.max(20, limits["korean-body"]?.size || 0));
  const familyWeight = new Map();
  for (const block of blocks) {
    const family = firstFamily(block.style);
    if (!MONO.test(family)) familyWeight.set(family, (familyWeight.get(family) || 0) + block.text.length);
  }
  const bodyFamily = [...bodyBlocks.reduce((map, b) => {
    const family = firstFamily(b.style);
    return map.set(family, (map.get(family) || 0) + b.text.length);
  }, new Map())].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const headingBlock = blocks
    .filter((b) => b.el.closest("h1, h2, h3") || b.size >= 24)
    .sort((a, b) => b.size - a.size)[0];
  const headingFamily = headingBlock ? firstFamily(headingBlock.style) : "";
  {
    const chosen = limits["default-font"] || {};
    const wrongHeading = chosen.heading && headingFamily && !chosenFamilies(chosen.heading).includes(headingFamily.toLowerCase());
    const wrongBody = chosen.body && bodyFamily && !chosenFamilies(chosen.body).includes(bodyFamily.toLowerCase());
    const level = wrongHeading || wrongBody ? "warn" : "pass";
    add("default-font", "type-default-font", "주 서체", level,
      `제목 ${headingFamily || "-"}, 본문 ${bodyFamily || "-"}. 선택: 제목 ${chosen.heading || "미정"}, 본문 ${chosen.body || "미정"}`,
      [], `고른 서체를 쓴다. 제목 ${chosen.heading || "미정"}, 본문 ${chosen.body || "미정"}.`);
  }
  {
    const families = [...familyWeight].filter(([, weight]) => weight >= totalText * 0.03).map(([family]) => family);
    add("font-count", "type-default-font", "서체 수", families.length > 2 ? "warn" : "pass",
      `본문과 제목에 쓴 서체 ${families.length}종 (${families.join(", ") || "-"}). 코드 서체를 빼고 두 종까지`);
  }
  {
    const sizes = new Map();
    for (const block of bodyBlocks) {
      const key = Math.round(block.size);
      sizes.set(key, (sizes.get(key) || 0) + block.text.length);
    }
    const bodySize = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
    const ratio = headingBlock && bodySize ? headingBlock.size / bodySize : 0;
    const headingWeight = headingBlock ? parseFloat(headingBlock.style.fontWeight) || 400 : 0;
    const chosen = limits.hierarchy || {};
    const level = !headingBlock || ratio + 0.05 < chosen.ratio || headingWeight < (chosen.weight || 0) ? "warn" : "pass";
    add("hierarchy", "type-hierarchy-weak", "크기 위계", level, headingBlock
      ? `가장 큰 제목 ${Math.round(headingBlock.size)}px 굵기 ${headingWeight}, 본문 ${bodySize}px, 비율 ${ratio.toFixed(2)}. ` +
        `고른 비율 ${chosen.ratio?.toFixed(2)}, 굵기 ${chosen.weight ?? "미정"}`
      : "제목으로 볼 글자(h1~h3 또는 24px 이상)가 없다", [],
      `고른 제목/본문 비율 ${chosen.ratio?.toFixed(2)} (오차 0.05 허용)와 제목 굵기 ${chosen.weight ?? "미정"} 이상으로 위계를 둔다.`);
  }

  /* 한글 본문 */

  {
    const hangul = (text) => (text.match(/[가-힣]/g) || []).length;
    const korean = bodyBlocks
      .map((b) => ({ ...b, count: hangul(b.text) }))
      .filter((b) => b.count >= 15 && !b.el.closest("button, a, label, nav, th, h1, h2, h3, h4, h5, h6"));
    if (!korean.length) {
      add("korean-body", "type-ko-readability", "한글 본문 조판", "pass", "15자 넘는 한글 본문이 없어 재지 않았다");
    } else {
      const weightedMedian = (pick) => {
        const values = korean.map((b) => ({ value: pick(b), weight: b.count })).sort((a, b) => a.value - b.value);
        const half = values.reduce((sum, v) => sum + v.weight, 0) / 2;
        let seen = 0;
        return values.find((v) => (seen += v.weight) >= half).value;
      };
      const lineHeight = (b) => (b.style.lineHeight === "normal" ? 1.2 : parseFloat(b.style.lineHeight) / b.size);
      const tracking = (b) => (b.style.letterSpacing === "normal" ? 0 : parseFloat(b.style.letterSpacing) / b.size);
      const size = weightedMedian((b) => b.size);
      const leading = weightedMedian(lineHeight);
      const spacing = weightedMedian(tracking);
      const chosen = limits["korean-body"] || {};
      const tooSmall = (size, leading) => (chosen.size != null && size + 0.5 < chosen.size) ||
        (chosen.leading != null && leading + 0.05 < chosen.leading);
      const level = tooSmall(size, leading) ? "fail" : "pass";
      const small = korean.filter((b) => tooSmall(b.size, lineHeight(b))).sort((a, b) => b.count - a.count);
      add("korean-body", "type-ko-readability", "한글 본문 조판", level,
        `한글 본문 중앙값 ${size.toFixed(1)}px, 줄 간격 ${leading.toFixed(2)}, 자간 ${spacing.toFixed(3)}em. 선택 ${chosen.size ?? "미정"}px, ${chosen.leading ?? "미정"}`,
        small.map((b) => `${describe(b.el)} ${b.size}px / ${lineHeight(b).toFixed(2)} "${snippet(b.text)}"`),
        `고른 본문 ${chosen.size ?? "미정"}px와 줄 간격 ${chosen.leading ?? "미정"}를 하한으로 쓴다 (오차 0.5px, 0.05 허용).`);
    }
  }

  // lint.py가 CDP로 실제 렌더 서체를 묻도록 표지를 남긴다. 화면이 가라앉은 뒤라 hydration과 부딪치지 않는다
  const fontProbes = [];
  const markProbe = (el, role) => {
    if (!el) return;
    el.setAttribute("data-taste-probe", role);
    fontProbes.push({ role, selector: `[data-taste-probe="${role}"]`, declared: styleOf(el).fontFamily });
  };
  markProbe(headingBlock?.el, "heading");
  markProbe(bodyBlocks.filter((b) => !/[가-힣]/.test(b.text)).sort((a, b) => b.text.length - a.text.length)[0]?.el, "latin");
  markProbe(bodyBlocks.filter((b) => /[가-힣]{4}/.test(b.text)).sort((a, b) => b.text.length - a.text.length)[0]?.el, "korean");

  /* 모션 */

  add("motion-slow", "motion-slow", "전환 길이", slowMotion.length ? "warn" : "pass",
    `고른 전환 길이 ${limits["motion-slow"]?.seconds}초를 넘는 요소 ${slowMotion.length}개`,
    sample(slowMotion, (m) => ` ${m.kind} ${m.seconds.toFixed(2)}s`),
    `고른 전환 길이 ${limits["motion-slow"]?.seconds}초 이하로 맞춘다 (오차 0.01초 허용). JS 모션은 직접 확인한다.`);
  add("motion-loop", "motion-too-much", "반복 애니메이션", loops.length ? "warn" : "pass",
    `무한 반복 애니메이션 ${loops.length}개(작은 로딩 표시 제외). 밋밋함을 장식 루프로 메우지 않는다`,
    sample(loops, (l) => ` ${l.name}`));
  {
    const early = (window.__tasteEarlyHidden || []).filter((el) => el.isConnected);
    const appeared = early.filter((el) => effectiveOpacity(el) > 0.5 && styleOf(el).visibility !== "hidden");
    add("content-first", "motion-first-missing", "첫 화면 콘텐츠", appeared.length ? "warn" : "pass",
      `첫 화면 글 ${appeared.length}곳이 opacity 0에서 시작해 애니메이션 뒤에 보였다. rAF가 돌지 않는 숨긴 탭에서는 안 보인다`,
      sample(appeared, (el) => ` "${snippet(el.textContent.trim())}"`));
  }

  /* 기본 위생: 증상 카탈로그에 없지만 취향 판단 전에 깨지면 안 되는 것 */

  const mediaRules = { reducedMotion: false, colorScheme: false };
  const scanRules = (rules) => {
    for (const rule of rules) {
      const media = rule.media?.mediaText || rule.conditionText || "";
      if (media.includes("prefers-reduced-motion")) mediaRules.reducedMotion = true;
      if (media.includes("prefers-color-scheme")) mediaRules.colorScheme = true;
      if (rule.cssRules) scanRules(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      scanRules(sheet.cssRules);
    } catch (error) {
      // 다른 출처의 스타일시트는 읽을 수 없다
    }
  }
  add("reduced-motion", null, "모션 감소 설정", movingElements && !mediaRules.reducedMotion ? "warn" : "pass",
    movingElements
      ? `CSS 전환이나 애니메이션이 있는 요소 ${movingElements}개, prefers-reduced-motion 규칙 ${mediaRules.reducedMotion ? "있음" : "없음"}(JS 모션은 재지 않음)`
      : "CSS 전환과 애니메이션이 없다");
  {
    const scrollWidth = document.documentElement.scrollWidth;
    const overflowing = scrollWidth > VW + 1
      ? elements.filter((el) => {
        const right = el.getBoundingClientRect().right;
        return right > VW + 1 && (!el.parentElement || el.parentElement.getBoundingClientRect().right <= VW + 1);
      })
      : [];
    add("overflow", null, "가로 넘침", scrollWidth > VW + 1 ? "fail" : "pass",
      `문서 너비 ${scrollWidth}px, 화면 ${VW}px`, sample(overflowing));
  }
  {
    // 고정폭 이웃에 밀려 글자가 한 줄에 두세 자씩 떨어지는 붕괴는 가로 넘침 없이 일어난다(위키 Generated UI Anti-Slop)
    const squashed = blocks.filter((b) => {
      const rect = b.el.getBoundingClientRect();
      return b.text.length >= 8 && rect.width < b.size * 3.5 && rect.height > b.size * 4;
    });
    add("squashed-text", null, "글자 압사", squashed.length ? "fail" : "pass",
      `너비가 글자 세 자 남짓인데 여러 줄로 떨어지는 글 ${squashed.length}곳`,
      sample(squashed.map((b) => b.el), (el) => ` ${Math.round(el.getBoundingClientRect().width)}px`));
  }

  return {
    checks,
    meta: {
      pageBackground: hex(pageBackground),
      respondsToColorScheme: mediaRules.colorScheme || rootScheme.includes("dark"),
      fontProbes,
    },
  };
}
