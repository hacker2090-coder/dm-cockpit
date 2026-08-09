const DM_COCKPIT_UI_STATE_KEY = "dm-cockpit.ui-layout.v1";
const DM_COCKPIT_UI_VERSION = "1.0";

let dmUiKeyboardBound = false;
let dmUiObserver = null;
let dmUiObserverTimer = null;

function dmUiIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmUiReadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DM_COCKPIT_UI_STATE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function dmUiWriteState(state) {
  try {
    localStorage.setItem(DM_COCKPIT_UI_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("DM Cockpit | UI-Zustand konnte nicht gespeichert werden", error);
  }
}

function dmUiSlug(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "bereich";
}

function dmUiCardTitle(card) {
  return String(
    card.querySelector(":scope > .dm-cockpit-card-title h2, :scope > .dm-cockpit-card-title h3, :scope > summary h2, :scope > summary h3, :scope > .dm-flow-toolbar h2")?.textContent
      ?? card.querySelector("h2,h3")?.textContent
      ?? ""
  ).trim();
}

function dmUiCardKey(card) {
  if (card.dataset.dmUiKey) return card.dataset.dmUiKey;
  const explicit = String(card.id ?? "").trim();
  const title = dmUiCardTitle(card);
  const key = explicit ? `id-${explicit}` : `title-${dmUiSlug(title)}`;
  card.dataset.dmUiKey = key;
  return key;
}

function dmUiClassifyCard(card) {
  const title = dmUiCardTitle(card).toLocaleLowerCase();
  if (card.classList.contains("dm-live-scene-card") || title.includes("aktive szene")) return { zone: "live", size: "hero" };
  if (title.includes("live-transkript") || title.includes("transkript")) return { zone: "live", size: "side" };
  if (title.includes("ki-kandidat")) return { zone: "live", size: "wide" };
  if (title.includes("session-recap") || title.includes("recap")) return { zone: "after", size: "wide" };
  if (title.includes("spawnpunkt") || title.includes("reserve bench")) return { zone: "play", size: "wide" };
  if (title.includes("spontane szene")) return { zone: "play", size: "side" };
  if (title.includes("szenen-preset")) return { zone: "after", size: "side" };
  if (
    title.includes("npc") ||
    title.includes("handout") ||
    title.includes("loot") ||
    title.includes("belohn") ||
    title.includes("compendium") ||
    title.includes("kompendium") ||
    title.includes("item")
  ) return { zone: "tools", size: "side" };
  return { zone: "tools", size: card.classList.contains("dm-cockpit-wide") ? "wide" : "side" };
}

const DM_UI_ZONES = [
  { id: "live", icon: "fa-wave-square", title: "Live", subtitle: "Aktive Session, Transkript und unmittelbare Entscheidungen" },
  { id: "play", icon: "fa-dice-d20", title: "Spielleitung", subtitle: "Szenen, Gegner und direkte Spielaktionen" },
  { id: "tools", icon: "fa-toolbox", title: "Werkzeuge", subtitle: "NPCs, Handouts, Loot und Nachschlagen" },
  { id: "after", icon: "fa-clipboard-check", title: "Nachbereitung", subtitle: "Recap, Presets und vorbereitende Ablagen" }
];

function dmUiMakeZone(definition) {
  const section = document.createElement("section");
  section.className = "dm-ui-zone";
  section.dataset.dmUiZone = definition.id;
  section.id = `dm-ui-zone-${definition.id}`;
  section.innerHTML = `
    <header class="dm-ui-zone-heading">
      <div class="dm-ui-zone-icon"><i class="fa-solid ${definition.icon}"></i></div>
      <div>
        <h2>${definition.title}</h2>
        <p>${definition.subtitle}</p>
      </div>
    </header>
    <div class="dm-ui-zone-grid"></div>
  `;
  return section;
}

function dmUiApplySavedOrder(zoneGrid, state, zoneId) {
  const desired = Array.isArray(state.order?.[zoneId]) ? state.order[zoneId] : [];
  if (!desired.length) return;
  const cards = [...zoneGrid.children].filter(el => el.classList?.contains("dm-cockpit-card"));
  const byKey = new Map(cards.map(card => [dmUiCardKey(card), card]));
  for (const key of desired) {
    const card = byKey.get(key);
    if (card) zoneGrid.append(card);
  }
}

function dmUiSaveZoneOrder(zoneGrid) {
  const zone = zoneGrid.closest("[data-dm-ui-zone]")?.dataset.dmUiZone;
  if (!zone) return;
  const state = dmUiReadState();
  state.order ??= {};
  state.order[zone] = [...zoneGrid.children]
    .filter(el => el.classList?.contains("dm-cockpit-card"))
    .map(dmUiCardKey);
  dmUiWriteState(state);
}

function dmUiInstallDrag(card) {
  if (card.dataset.dmUiDragBound === "1") return;
  card.dataset.dmUiDragBound = "1";
  card.draggable = true;

  const header = card.matches("details")
    ? card.querySelector(":scope > summary")
    : card.querySelector(":scope > .dm-cockpit-card-title, :scope > .dm-flow-toolbar");
  if (!header) return;

  const handle = document.createElement("span");
  handle.className = "dm-ui-drag-handle";
  handle.innerHTML = `<i class="fa-solid fa-grip-vertical"></i>`;
  handle.title = "Bereich verschieben";
  handle.setAttribute("aria-label", "Bereich verschieben");
  header.append(handle);

  let allowed = false;
  handle.addEventListener("pointerdown", event => {
    event.stopPropagation();
    allowed = true;
    card.classList.add("dm-ui-drag-ready");
  });
  document.addEventListener("pointerup", () => {
    allowed = false;
    card.classList.remove("dm-ui-drag-ready");
  }, { once: true });

  card.addEventListener("dragstart", event => {
    if (!allowed) {
      event.preventDefault();
      return;
    }
    card.classList.add("dm-ui-dragging");
    event.dataTransfer?.setData("text/plain", dmUiCardKey(card));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dm-ui-dragging");
    const grid = card.closest(".dm-ui-zone-grid");
    if (grid) dmUiSaveZoneOrder(grid);
  });

  card.addEventListener("dragover", event => {
    const dragging = card.parentElement?.querySelector(".dm-ui-dragging");
    if (!dragging || dragging === card || dragging.parentElement !== card.parentElement) return;
    event.preventDefault();
    const rect = card.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    card.parentElement.insertBefore(dragging, after ? card.nextSibling : card);
  });
}

function dmUiInstallResize(card, state) {
  if (card.dataset.dmUiResizeBound === "1") return;
  card.dataset.dmUiResizeBound = "1";
  card.classList.add("dm-ui-resizable");
  const key = dmUiCardKey(card);
  const saved = Number(state.sizes?.[key]?.height);
  if (Number.isFinite(saved) && saved >= 110) card.style.height = `${Math.round(saved)}px`;

  const observer = new ResizeObserver(() => {
    if (!card.style.height) return;
    const height = Math.round(card.getBoundingClientRect().height);
    if (!Number.isFinite(height) || height < 110) return;
    const next = dmUiReadState();
    next.sizes ??= {};
    next.sizes[key] = { height };
    dmUiWriteState(next);
  });
  observer.observe(card);
}

function dmUiInstallDetailsPersistence(card, state) {
  if (!card.matches("details") || card.dataset.dmUiDetailsBound === "1") return;
  card.dataset.dmUiDetailsBound = "1";
  const key = dmUiCardKey(card);
  if (typeof state.open?.[key] === "boolean") card.open = state.open[key];
  card.addEventListener("toggle", () => {
    const next = dmUiReadState();
    next.open ??= {};
    next.open[key] = card.open;
    dmUiWriteState(next);
  });
}

function dmUiListItems(card) {
  const selectors = [
    ".dm-list-item",
    ".dm-preset-row",
    ".dm-spawn-card",
    ".dm-reserve-row",
    ".dm-candidate-row",
    ".dm-handout-row",
    ".dm-loot-package-row",
    ".dm-transcript-segment",
    "article[data-candidate-id]"
  ];
  const found = new Set();
  for (const selector of selectors) {
    card.querySelectorAll(selector).forEach(item => found.add(item));
  }
  if (found.size < 4 && !card.classList.contains("dm-flow-section")) {
    card.querySelectorAll("article").forEach(item => {
      if (!item.classList.contains("dm-flow-node")) found.add(item);
    });
  }
  return [...found];
}

function dmUiInstallFilter(card) {
  if (card.dataset.dmUiFilterBound === "1") return;
  const items = dmUiListItems(card);
  if (items.length < 4) return;
  card.dataset.dmUiFilterBound = "1";

  const body = card.matches("details")
    ? card.querySelector(":scope > .dm-card-body")
    : card.querySelector(".dm-card-body") ?? card;
  if (!body) return;

  const filter = document.createElement("label");
  filter.className = "dm-ui-filter";
  filter.innerHTML = `
    <i class="fa-solid fa-magnifying-glass"></i>
    <input type="search" placeholder="In diesem Bereich suchen …" aria-label="${dmUiCardTitle(card) || "Bereich"} durchsuchen">
    <span class="dm-ui-filter-count">${items.length}</span>
  `;
  body.prepend(filter);

  const input = filter.querySelector("input");
  const count = filter.querySelector(".dm-ui-filter-count");
  input.addEventListener("input", () => {
    const query = input.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const item of items) {
      const matches = !query || String(item.textContent ?? "").toLocaleLowerCase().includes(query);
      item.hidden = !matches;
      if (matches) visible += 1;
    }
    count.textContent = `${visible}/${items.length}`;
  });
}

function dmUiInstallTooltips(card) {
  card.querySelectorAll("button, [role='button']").forEach(control => {
    if (control.title) return;
    const label = String(control.getAttribute("aria-label") ?? control.textContent ?? "").replace(/\s+/g, " ").trim();
    if (label) control.title = label;
  });
  card.querySelectorAll("input, select, textarea").forEach(control => {
    if (control.title || control.placeholder) return;
    const label = control.closest("label")?.textContent?.replace(/\s+/g, " ").trim();
    if (label) control.title = label;
  });
}

function dmUiApplyInlineState(card) {
  const text = String(card.textContent ?? "").toLocaleLowerCase();
  const working = Boolean(card.querySelector(".fa-spinner, [data-status='reviewing']")) || /\b(lädt|speichert|wird verarbeitet)\b/i.test(text);
  const error = /\b(fehler|konnte nicht|nicht verbunden|fehlgeschlagen)\b/i.test(text);
  card.classList.toggle("dm-ui-working", working && !error);
  card.classList.toggle("dm-ui-error", error);
}

function dmUiInstallCard(card, state) {
  const { zone, size } = dmUiClassifyCard(card);
  card.dataset.dmUiZoneTarget = zone;
  card.dataset.dmUiSize = size;
  dmUiCardKey(card);
  dmUiInstallDetailsPersistence(card, state);
  dmUiInstallDrag(card);
  dmUiInstallResize(card, state);
  dmUiInstallFilter(card);
  dmUiInstallTooltips(card);
  dmUiApplyInlineState(card);
}

function dmUiBuildZones(grid, state) {
  if (grid.dataset.dmUiZoned === "1") return;
  grid.dataset.dmUiZoned = "1";
  grid.classList.add("dm-ui-dashboard");

  const cards = [...grid.children].filter(el => el.classList?.contains("dm-cockpit-card"));
  const zoneMap = new Map();

  for (const definition of DM_UI_ZONES) {
    const zone = dmUiMakeZone(definition);
    zoneMap.set(definition.id, zone);
    grid.append(zone);
  }

  for (const card of cards) {
    dmUiInstallCard(card, state);
    const zone = zoneMap.get(card.dataset.dmUiZoneTarget) ?? zoneMap.get("tools");
    zone.querySelector(".dm-ui-zone-grid")?.append(card);
  }

  for (const [zoneId, zone] of zoneMap) {
    const zoneGrid = zone.querySelector(".dm-ui-zone-grid");
    dmUiApplySavedOrder(zoneGrid, state, zoneId);
    if (!zoneGrid.querySelector(".dm-cockpit-card")) zone.hidden = true;
  }
}

function dmUiAddQuickNavigation(content) {
  if (content.querySelector(":scope > .dm-ui-quickbar")) return;
  const zones = [...content.querySelectorAll(".dm-ui-zone:not([hidden])")];
  const adventure = content.querySelector(".dm-flow-section");
  if (!zones.length && !adventure) return;

  const bar = document.createElement("nav");
  bar.className = "dm-ui-quickbar";
  bar.setAttribute("aria-label", "Schnelle Bereichsnavigation");
  const targets = zones.length
    ? zones.map(zone => {
        const def = DM_UI_ZONES.find(item => item.id === zone.dataset.dmUiZone);
        return { id: zone.id, icon: def?.icon ?? "fa-circle", label: def?.title ?? "Bereich" };
      })
    : [{ id: "", icon: "fa-diagram-project", label: "Flowchart", element: adventure }];

  for (const target of targets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dm-ui-quicklink";
    button.innerHTML = `<i class="fa-solid ${target.icon}"></i><span>${target.label}</span>`;
    button.title = `${target.label} anzeigen`;
    button.addEventListener("click", () => {
      const destination = target.element ?? document.getElementById(target.id);
      destination?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
    bar.append(button);
  }
  content.prepend(bar);
}

function dmUiEnhanceCore(application, element) {
  if (!dmUiIsCockpit(application)) return;
  const root = element?.matches?.(".dm-cockpit") ? element : application?.element ?? element;
  if (!root?.querySelector) return;

  root.classList.add("dm-ui-v2");
  const shell = root.querySelector(".dm-cockpit-shell");
  const content = root.querySelector(".dm-cockpit-content");
  if (!shell || !content) return;

  shell.dataset.dmUiVersion = DM_COCKPIT_UI_VERSION;
  const state = dmUiReadState();

  const grid = content.querySelector(".dm-cockpit-grid");
  if (grid) dmUiBuildZones(grid, state);

  content.querySelectorAll(".dm-cockpit-card").forEach(card => dmUiInstallCard(card, state));
  dmUiAddQuickNavigation(content);

  const header = root.querySelector(".dm-cockpit-header");
  if (header && !header.querySelector(".dm-ui-header-label")) {
    const meta = document.createElement("div");
    meta.className = "dm-ui-header-label";
    meta.innerHTML = `<span class="dm-ui-status-dot"></span><span>GM CONTROL CENTER</span>`;
    header.querySelector(".dm-cockpit-brand")?.append(meta);
  }

  if (dmUiObserver) dmUiObserver.disconnect();
  dmUiObserver = new MutationObserver(() => {
    window.clearTimeout(dmUiObserverTimer);
    dmUiObserverTimer = window.setTimeout(() => {
      const currentState = dmUiReadState();
      const currentGrid = content.querySelector(".dm-cockpit-grid");
      if (currentGrid && currentGrid.dataset.dmUiZoned !== "1") dmUiBuildZones(currentGrid, currentState);

      if (currentGrid?.dataset.dmUiZoned === "1") {
        [...currentGrid.children]
          .filter(el => el.classList?.contains("dm-cockpit-card"))
          .forEach(card => {
            dmUiInstallCard(card, currentState);
            const target = currentGrid.querySelector(`[data-dm-ui-zone="${card.dataset.dmUiZoneTarget}"] .dm-ui-zone-grid`)
              ?? currentGrid.querySelector('[data-dm-ui-zone="tools"] .dm-ui-zone-grid');
            target?.append(card);
            const zone = target?.closest(".dm-ui-zone");
            if (zone) zone.hidden = false;
          });
      }

      content.querySelectorAll(".dm-cockpit-card").forEach(card => {
        dmUiInstallCard(card, currentState);
        dmUiApplyInlineState(card);
      });
      dmUiAddQuickNavigation(content);
    }, 40);
  });
  dmUiObserver.observe(content, { childList: true, subtree: true, characterData: true });
}

function dmUiBindKeyboard() {
  if (dmUiKeyboardBound) return;
  dmUiKeyboardBound = true;
  document.addEventListener("keydown", event => {
    const root = document.querySelector(".dm-cockpit.dm-ui-v2");
    if (!root) return;
    const tag = document.activeElement?.tagName?.toLocaleLowerCase();
    if (["input", "textarea", "select"].includes(tag) || document.activeElement?.isContentEditable) return;

    if (event.altKey && event.key === "1") {
      event.preventDefault();
      root.querySelector('[data-tab="live"]')?.click();
      return;
    }
    if (event.altKey && event.key === "2") {
      event.preventDefault();
      root.querySelector('[data-tab="adventure"]')?.click();
      return;
    }
    if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const cards = [...root.querySelectorAll(".dm-cockpit-card")].filter(card => !card.closest("[hidden]"));
      if (!cards.length) return;
      const center = window.innerHeight / 2;
      let index = cards.findIndex(card => {
        const rect = card.getBoundingClientRect();
        return rect.top <= center && rect.bottom >= center;
      });
      if (index < 0) index = 0;
      index = event.key === "ArrowDown"
        ? Math.min(cards.length - 1, index + 1)
        : Math.max(0, index - 1);
      cards[index]?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }
  });
}

function dmUiCardApiFind(key) {
  const root = document.querySelector(".dm-cockpit.dm-ui-v2");
  return root?.querySelector(`[data-dm-ui-key="${CSS.escape(String(key))}"]`) ?? null;
}

function dmUiSetCardState(key, state = "idle", message = "") {
  const card = dmUiCardApiFind(key);
  if (!card) return false;
  card.classList.toggle("dm-ui-working", state === "working");
  card.classList.toggle("dm-ui-error", state === "error");
  let strip = card.querySelector(":scope > .dm-ui-inline-state");
  if (state === "idle" || !message) {
    strip?.remove();
    return true;
  }
  if (!strip) {
    strip = document.createElement("div");
    strip.className = "dm-ui-inline-state";
    card.prepend(strip);
  }
  strip.dataset.state = state;
  strip.innerHTML = `<i class="fa-solid ${state === "error" ? "fa-triangle-exclamation" : "fa-spinner fa-spin"}"></i><span>${String(message)}</span>`;
  return true;
}

Hooks.on("renderApplicationV2", dmUiEnhanceCore);
Hooks.once("ready", dmUiBindKeyboard);

globalThis.DMCockpitUI = {
  version: DM_COCKPIT_UI_VERSION,
  setCardState: dmUiSetCardState,
  resetLayout() {
    localStorage.removeItem(DM_COCKPIT_UI_STATE_KEY);
    const app = Object.values(ui.windows ?? {}).find(candidate => dmUiIsCockpit(candidate));
    app?.render?.({ force: true });
  }
};

console.log(`DM Cockpit | UI Layout ${DM_COCKPIT_UI_VERSION} bereit`);
