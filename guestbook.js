import { firebaseConfig } from "/firebase-config.js";

const guestbook = document.querySelector(".vertical-header");
const track = guestbook?.querySelector(".vertical-header-track");
const fallbackText = "방명록";
const requiredConfigKeys = ["apiKey", "projectId"];
const fallbackItems = [{ type: "text", value: fallbackText }];
let currentItems = [];
let resizeTimer;

function createItem(content, hidden = false) {
  const item = document.createElement("div");
  item.className = "i";
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
  } else {
    item.setAttribute("role", "listitem");
  }
  return item;
}

function createGroup(contents) {
  const group = document.createElement("div");
  group.className = "vertical-header-group";
  group.setAttribute("role", "list");

  for (const content of contents) {
    group.append(createItem(content));
  }

  return group;
}

function markAsDummy(group) {
  group.dataset.dummy = "true";
  group.removeAttribute("role");
  group.setAttribute("aria-hidden", "true");
  return group;
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
      mainGroup.append(createItem(content, true));
    }
    repetition += 1;
  }

  const leftDummy = markAsDummy(mainGroup.cloneNode(true));
  const rightDummy = markAsDummy(mainGroup.cloneNode(true));
  track.replaceChildren(leftDummy, mainGroup, rightDummy);

  const trackStyle = getComputedStyle(track);
  const groupGap = Number.parseFloat(trackStyle.columnGap) || 0;
  const distance = mainGroup.getBoundingClientRect().width + groupGap;
  track.style.setProperty("--guestbook-from", `${-distance}px`);
  track.style.setProperty("--guestbook-to", `${-distance * 2}px`);
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
    renderTicker(currentItems);
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
    renderTicker(currentItems);
  } catch (error) {
    console.error("Firestore 방명록을 불러오지 못했습니다.", error);
    currentItems = fallbackItems;
    renderTicker(currentItems);
  }
}

if (guestbook && track) {
  void loadGuestbookItems();

  window.addEventListener("guestbook:refresh", () => {
    void loadGuestbookItems({ refresh: true });
  });

  window.addEventListener("resize", () => {
    if (currentItems.length === 0) return;

    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => renderTicker(currentItems), 120);
  }, { passive: true });
}
