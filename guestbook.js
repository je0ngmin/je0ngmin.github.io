import { firebaseConfig } from "/firebase-config.js";

const guestbook = document.querySelector(".vertical-header");
const track = guestbook?.querySelector(".vertical-header-track");
const grid = document.querySelector(".guestbook-grid");
const detailDialog = document.querySelector(".guestbook-dialog");
const detailItem = detailDialog?.querySelector(".guestbook-dialog-item");
const detailHero = detailDialog?.querySelector(".guestbook-hero-clone");
const detailCloseButton = detailDialog?.querySelector(".guestbook-dialog-close");
const fallbackText = "방명록";
const requiredConfigKeys = ["apiKey", "projectId"];
const fallbackItems = [{ type: "text", value: fallbackText }];
let currentItems = [];
let resizeTimer;
let activeDialogSource = null;
let isClosingDialog = false;
let heroAnimation = null;

function createItem(content, { hidden = false, interactive = true } = {}) {
  const item = document.createElement(interactive ? "button" : "div");
  item.className = "i";
  item.dataset.type = content.type;
  if (item instanceof HTMLButtonElement) {
    item.type = "button";
  }
  if (content.documentId) {
    item.dataset.documentId = content.documentId;
  }

  if (content.type === "image") {
    const image = document.createElement("img");
    item.classList.add("image");
    image.src = content.value;
    image.alt = hidden ? "" : "방명록에 남긴 그림";
    image.decoding = "async";
    image.draggable = false;
    item.append(image);
  } else {
    item.textContent = content.value;
  }

  if (hidden) {
    item.setAttribute("aria-hidden", "true");
    item.tabIndex = -1;
  }
  return item;
}

function createGroup(contents) {
  const group = document.createElement("div");
  group.className = "vertical-header-group";

  for (const content of contents) {
    group.append(createItem(content));
  }

  return group;
}

function markAsDummy(group) {
  group.dataset.dummy = "true";
  group.setAttribute("aria-hidden", "true");
  group.querySelectorAll("button").forEach((button) => {
    button.tabIndex = -1;
  });
  return group;
}

function renderGrid(contents) {
  if (!(grid instanceof HTMLElement)) return;

  const usableContents = contents.length > 0 ? contents : fallbackItems;
  const fragment = document.createDocumentFragment();
  for (const content of usableContents) {
    fragment.append(createItem(content, { interactive: false }));
  }
  grid.replaceChildren(fragment);
  requestAnimationFrame(() => grid.classList.add("is-loaded"));
}

function renderTicker(contents) {
  if (!guestbook || !track) return;

  const wasLoaded = track.classList.contains("is-loaded");
  const wasRefreshing = track.classList.contains("is-refreshing");
  const usableContents = contents.length > 0
    ? contents
    : fallbackItems;
  const mainGroup = createGroup(usableContents);
  track.classList.remove("is-running");
  track.replaceChildren(mainGroup);

  // 한 묶음이 화면보다 짧으면 같은 항목을 더 넣어 이동 중 빈 영역이 나타나지 않게 한다.
  let repetition = 0;
  while (mainGroup.scrollWidth < guestbook.clientWidth + 32 && repetition < 50) {
    for (const content of usableContents) {
      mainGroup.append(createItem(content, { hidden: true }));
    }
    repetition += 1;
  }

  const leftDummy = markAsDummy(mainGroup.cloneNode(true));
  const rightDummy = markAsDummy(mainGroup.cloneNode(true));
  track.replaceChildren(leftDummy, mainGroup, rightDummy);

  const trackStyle = getComputedStyle(track);
  const groupGap = Number.parseFloat(trackStyle.columnGap) || 0;
  const leadingSpace = Number.parseFloat(trackStyle.getPropertyValue("--guestbook-leading-space")) || 0;
  const distance = mainGroup.getBoundingClientRect().width + groupGap;
  track.style.setProperty("--guestbook-from", `${-distance + leadingSpace}px`);
  track.style.setProperty("--guestbook-to", `${-distance * 2 + leadingSpace}px`);
  track.style.setProperty("--guestbook-duration", `${Math.max(16, distance / 48)}s`);

  // 같은 데이터로 다시 그렸을 때도 애니메이션을 처음 위치에서 시작한다.
  void track.offsetWidth;
  track.classList.add("is-running");
  if (wasRefreshing) {
    requestAnimationFrame(() => {
      track.classList.remove("is-refreshing");
      void track.offsetWidth;
      requestAnimationFrame(() => track.classList.add("is-loaded"));
    });
  } else if (!wasLoaded) {
    requestAnimationFrame(() => track.classList.add("is-loaded"));
  }
}

function renderGuestbook(contents) {
  renderTicker(contents);
  renderGrid(contents);
}

function copyItem(source, target, className) {
  target.className = className;
  target.replaceChildren();
  if (source.classList.contains("image")) {
    const sourceImage = source.querySelector("img");
    if (sourceImage instanceof HTMLImageElement) {
      const image = sourceImage.cloneNode();
      image.alt = "방명록에 남긴 그림";
      target.classList.add("image");
      target.append(image);
    }
  } else {
    target.textContent = source.textContent;
  }
}

function createHeroFrame(rect, style) {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    borderRadius: style.borderRadius,
    fontSize: style.fontSize,
    padding: style.padding,
  };
}

function cancelHeroAnimation() {
  heroAnimation?.cancel();
  heroAnimation = null;
  if (detailHero instanceof HTMLElement) {
    detailHero.hidden = true;
    detailHero.removeAttribute("style");
  }
  if (detailItem instanceof HTMLElement) {
    detailItem.style.visibility = "";
  }
}

function playHeroAnimation(from, to, duration, easing, keepVisible, onFinish) {
  if (!(detailHero instanceof HTMLElement) || !(detailItem instanceof HTMLElement)) {
    onFinish();
    return;
  }

  heroAnimation?.cancel();
  detailHero.hidden = false;
  detailItem.style.visibility = "hidden";
  const animation = detailHero.animate([from, to], {
    duration,
    easing,
    fill: "both",
  });
  heroAnimation = animation;
  animation.finished.then(() => {
    if (heroAnimation !== animation) return;

    if (keepVisible) {
      Object.assign(detailHero.style, to);
    }
    animation.cancel();
    heroAnimation = null;
    detailHero.hidden = !keepVisible;
    detailItem.style.visibility = keepVisible ? "hidden" : "";
    onFinish();
  }).catch(() => {});
}

function syncOpenHeroPosition() {
  if (
    !(detailDialog instanceof HTMLDialogElement)
    || !(detailItem instanceof HTMLElement)
    || !(detailHero instanceof HTMLElement)
    || !detailDialog.open
    || isClosingDialog
  ) return;

  heroAnimation?.cancel();
  heroAnimation = null;
  detailHero.removeAttribute("style");
  detailHero.hidden = false;
  detailItem.style.visibility = "hidden";
  Object.assign(
    detailHero.style,
    createHeroFrame(detailItem.getBoundingClientRect(), getComputedStyle(detailItem)),
  );
}

function openDetailDialog(source) {
  if (
    !(guestbook instanceof HTMLElement)
    || !(detailDialog instanceof HTMLDialogElement)
    || !(detailItem instanceof HTMLElement)
    || !(detailHero instanceof HTMLElement)
    || detailDialog.open
  ) return;

  cancelHeroAnimation();
  guestbook.classList.add("has-open-dialog");
  activeDialogSource = source;
  copyItem(source, detailItem, "guestbook-dialog-item");
  copyItem(source, detailHero, "guestbook-hero-clone");
  const sourceRect = source.getBoundingClientRect();
  const sourceStyle = getComputedStyle(source);
  detailDialog.showModal();
  const targetRect = detailItem.getBoundingClientRect();
  const targetStyle = getComputedStyle(detailItem);
  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420;

  playHeroAnimation(
    createHeroFrame(sourceRect, sourceStyle),
    createHeroFrame(targetRect, targetStyle),
    duration,
    "cubic-bezier(.2, .8, .2, 1)",
    true,
    () => {},
  );
  source.classList.add("is-hero-source");
}

function finishClosingDialog() {
  if (!(detailDialog instanceof HTMLDialogElement)) return;

  activeDialogSource?.classList.remove("is-hero-source");
  detailDialog.close();
  detailDialog.classList.remove("is-closing");
  guestbook?.classList.remove("has-open-dialog");
  cancelHeroAnimation();
  detailItem?.replaceChildren();
  activeDialogSource = null;
  isClosingDialog = false;
}

function closeDetailDialog() {
  if (
    !(detailDialog instanceof HTMLDialogElement)
    || !(detailItem instanceof HTMLElement)
    || !(detailHero instanceof HTMLElement)
    || !detailDialog.open
    || isClosingDialog
  ) return;

  isClosingDialog = true;
  cancelHeroAnimation();
  detailDialog.classList.add("is-closing");
  const source = activeDialogSource;
  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280;

  if (source instanceof HTMLElement && source.isConnected) {
    const sourceRect = source.getBoundingClientRect();
    const sourceStyle = getComputedStyle(source);
    const targetRect = detailItem.getBoundingClientRect();
    const targetStyle = getComputedStyle(detailItem);
    copyItem(source, detailHero, "guestbook-hero-clone");
    playHeroAnimation(
      createHeroFrame(targetRect, targetStyle),
      createHeroFrame(sourceRect, sourceStyle),
      duration,
      "cubic-bezier(.4, 0, .8, .2)",
      false,
      finishClosingDialog,
    );
    return;
  }

  finishClosingDialog();
}

async function loadGuestbookItems({ refresh = false } = {}) {
  if (refresh && track) {
    track.classList.add("is-refreshing");
    track.classList.remove("is-loaded");
    void track.offsetWidth;
  }

  const hasConfig = requiredConfigKeys.every((key) => firebaseConfig[key]?.trim());
  if (!hasConfig) {
    console.info("Firebase Web App 설정 전이라 방명록 기본 문구를 표시합니다.");
    currentItems = fallbackItems;
    renderGuestbook(currentItems);
    return;
  }

  try {
    const endpoint = new URL(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents/guestbook`,
    );
    endpoint.searchParams.set("key", firebaseConfig.apiKey);
    endpoint.searchParams.set("pageSize", "30");
    endpoint.searchParams.set("orderBy", "createdAt desc");
    endpoint.searchParams.set("mask.fieldPaths", "text");
    endpoint.searchParams.append("mask.fieldPaths", "image");

    const abortController = new AbortController();
    const timeout = window.setTimeout(() => abortController.abort(), 5000);
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: abortController.signal,
    });
    window.clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Firestore 요청 실패: ${response.status}`);
    }

    const result = await response.json();
    const items = (result.documents ?? []).flatMap((document) => {
      const documentId = typeof document.name === "string"
        ? document.name.split("/").pop()
        : undefined;
      const text = document.fields?.text?.stringValue;
      const image = document.fields?.image?.stringValue;
      const documentItems = [];

      if (typeof text === "string" && text.trim().length > 0) {
        documentItems.push({ type: "text", value: text.trim(), documentId });
      }
      if (typeof image === "string" && image.startsWith("data:image/svg+xml;base64,")) {
        documentItems.push({ type: "image", value: image, documentId });
      }

      return documentItems;
    });

    currentItems = items.length > 0 ? items : fallbackItems;
    renderGuestbook(currentItems);
  } catch (error) {
    console.error("Firestore 방명록을 불러오지 못했습니다.", error);
    currentItems = fallbackItems;
    renderGuestbook(currentItems);
  }
}

if ((guestbook && track) || grid) {
  void loadGuestbookItems();
}

if (guestbook && track) {
  track.addEventListener("click", (event) => {
    const item = event.target instanceof Element ? event.target.closest(".i") : null;
    if (item instanceof HTMLButtonElement) {
      openDetailDialog(item);
    }
  });

  window.addEventListener("guestbook:refresh", () => {
    void loadGuestbookItems({ refresh: true });
  });

  window.addEventListener("resize", () => {
    if (currentItems.length === 0) return;

    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (detailDialog instanceof HTMLDialogElement && detailDialog.open) {
        syncOpenHeroPosition();
        return;
      }
      renderTicker(currentItems);
    }, 120);
  }, { passive: true });
}

if (
  detailDialog instanceof HTMLDialogElement
  && detailCloseButton instanceof HTMLButtonElement
) {
  detailCloseButton.addEventListener("click", closeDetailDialog);
  detailDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDetailDialog();
  });
  detailDialog.addEventListener("click", (event) => {
    if (event.target === detailDialog) {
      closeDetailDialog();
    }
  });
}
