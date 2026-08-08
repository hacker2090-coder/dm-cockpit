const DM_COCKPIT_COMPENDIUM_SEARCH_VERSION = "V0.9.15";
const DM_COCKPIT_COMPENDIUM_TYPES = new Set(["Actor", "Item", "JournalEntry", "RollTable"]);
const DM_COCKPIT_COMPENDIUM_FILTERS = [
  { id: "all", label: "Alle" },
  { id: "Actor", label: "Monster / Actors" },
  { id: "Item", label: "Items / Zauber" },
  { id: "JournalEntry", label: "Journal" },
  { id: "RollTable", label: "Tabellen" }
];

let dmCompendiumIndexPromise = null;

function dmEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dmNormalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(game.i18n?.lang ?? "de")
    .trim();
}

function dmDocumentLabel(documentName, subtype = "") {
  if (documentName === "Actor") return subtype ? `Actor · ${subtype}` : "Actor";
  if (documentName === "Item") return subtype ? `Item · ${subtype}` : "Item";
  if (documentName === "JournalEntry") return "Journal";
  if (documentName === "RollTable") return "Tabelle";
  return documentName;
}

function dmDocumentIcon(documentName) {
  if (documentName === "Actor") return "fa-solid fa-user-group";
  if (documentName === "Item") return "fa-solid fa-box-open";
  if (documentName === "JournalEntry") return "fa-solid fa-book-open";
  if (documentName === "RollTable") return "fa-solid fa-table-list";
  return "fa-solid fa-file";
}

async function dmBuildCompendiumIndex() {
  const records = [];
  const packs = [...(game.packs ?? [])]
    .filter(pack => DM_COCKPIT_COMPENDIUM_TYPES.has(pack.documentName) && pack.visible !== false)
    .sort((a, b) => String(a.title ?? a.collection).localeCompare(String(b.title ?? b.collection), game.i18n?.lang ?? "de"));

  const loaded = await Promise.allSettled(packs.map(async pack => {
    const index = await pack.getIndex({ fields: ["name", "type", "img"] });
    const packTitle = String(pack.title ?? pack.metadata?.label ?? pack.collection ?? "Kompendium");

    return [...index]
      .filter(entry => entry?.name && entry?.uuid)
      .map(entry => {
        const name = String(entry.name);
        const subtype = String(entry.type ?? "");
        return {
          uuid: String(entry.uuid),
          name,
          documentName: pack.documentName,
          subtype,
          packTitle,
          search: dmNormalizeSearch(`${name} ${subtype} ${packTitle} ${pack.documentName}`)
        };
      });
  }));

  for (const result of loaded) {
    if (result.status === "fulfilled") records.push(...result.value);
    else console.warn("DM Cockpit | Ein Kompendium konnte nicht indiziert werden", result.reason);
  }

  records.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, game.i18n?.lang ?? "de");
    return byName || a.packTitle.localeCompare(b.packTitle, game.i18n?.lang ?? "de");
  });

  return records;
}

function dmGetCompendiumIndex() {
  if (!dmCompendiumIndexPromise) dmCompendiumIndexPromise = dmBuildCompendiumIndex();
  return dmCompendiumIndexPromise;
}

function dmCompendiumSectionHtml() {
  const filterButtons = DM_COCKPIT_COMPENDIUM_FILTERS.map((filter, index) => `
    <button type="button" class="${index === 0 ? "dm-button-primary" : "dm-button-secondary"} small" data-dm-compendium-filter="${dmEscapeHtml(filter.id)}" aria-pressed="${index === 0 ? "true" : "false"}">${dmEscapeHtml(filter.label)}</button>`).join("");

  return `
    <details id="dm-compendium-search" class="dm-cockpit-card dm-cockpit-wide dm-collapsible" open>
      <summary class="dm-cockpit-card-title">
        <div><h3>Compendium-Schnellsuche</h3><p class="card-subtitle">Alle wichtigen Kompendien an einem Ort</p></div>
        <span class="dm-summary-chevron"><i class="fa-solid fa-chevron-down"></i></span>
      </summary>
      <div class="dm-card-body">
        <div class="form-group stacked">
          <label for="dm-compendium-query">Suchen</label>
          <input id="dm-compendium-query" type="search" placeholder="z. B. Goblin, Heiltrank, Feuerball …" autocomplete="off">
        </div>
        <div class="dm-section-actions" data-dm-compendium-filters>${filterButtons}</div>
        <p class="hint" data-dm-compendium-status>Kompendien werden vorbereitet …</p>
        <div class="dm-list" data-dm-compendium-results>
          <div class="dm-empty-inline"><span>Suchbegriff eingeben.</span></div>
        </div>
      </div>
    </details>`;
}

async function dmOpenCompendiumDocument(uuid) {
  try {
    const doc = await fromUuid(uuid);
    if (!doc) return ui.notifications?.warn("DM Cockpit: Der Treffer konnte nicht geladen werden.");
    if (!doc.sheet) return ui.notifications?.warn("DM Cockpit: Für diesen Treffer ist kein Dokumentfenster verfügbar.");
    doc.sheet.render({ force: true });
  } catch (error) {
    console.error("DM Cockpit | Kompendium-Treffer konnte nicht geöffnet werden", error);
    ui.notifications?.error("DM Cockpit: Treffer konnte nicht geöffnet werden.");
  }
}

function dmRenderCompendiumResults(section, records, query, filter) {
  const results = section.querySelector("[data-dm-compendium-results]");
  const status = section.querySelector("[data-dm-compendium-status]");
  if (!results || !status) return;

  const terms = dmNormalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) {
    status.textContent = `${records.length} Einträge in ${new Set(records.map(record => record.packTitle)).size} Kompendien bereit`;
    results.innerHTML = `<div class="dm-empty-inline"><span>Suchbegriff eingeben.</span></div>`;
    return;
  }

  const matches = records.filter(record => {
    if (filter !== "all" && record.documentName !== filter) return false;
    return terms.every(term => record.search.includes(term));
  });

  const shown = matches.slice(0, 50);
  status.textContent = matches.length > 50
    ? `${matches.length} Treffer · erste 50 angezeigt`
    : `${matches.length} Treffer`;

  if (!shown.length) {
    results.innerHTML = `<div class="dm-empty-inline"><span>Keine passenden Kompendiumseinträge gefunden.</span></div>`;
    return;
  }

  results.innerHTML = shown.map(record => `
    <article class="dm-list-item">
      <div>
        <strong><i class="${dmEscapeHtml(dmDocumentIcon(record.documentName))}"></i> ${dmEscapeHtml(record.name)}</strong>
        <p>${dmEscapeHtml(dmDocumentLabel(record.documentName, record.subtype))} · ${dmEscapeHtml(record.packTitle)}</p>
      </div>
      <button type="button" class="dm-button-primary small" data-dm-compendium-open="${dmEscapeHtml(record.uuid)}"><i class="fa-solid fa-arrow-up-right-from-square"></i> Öffnen</button>
    </article>`).join("");

  results.querySelectorAll("[data-dm-compendium-open]").forEach(button => {
    button.addEventListener("click", () => dmOpenCompendiumDocument(button.dataset.dmCompendiumOpen));
  });
}

function dmIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmInjectCompendiumSearch(application, element) {
  if (!game.user?.isGM || !dmIsCockpit(application)) return;

  const badge = element.querySelector?.(".dm-cockpit-badge");
  if (badge) badge.textContent = DM_COCKPIT_COMPENDIUM_SEARCH_VERSION;

  const grid = element.querySelector?.(".dm-cockpit-grid");
  if (!grid || element.querySelector("#dm-compendium-search")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = dmCompendiumSectionHtml().trim();
  const section = wrapper.firstElementChild;

  if (grid.firstElementChild) grid.firstElementChild.after(section);
  else grid.appendChild(section);

  const input = section.querySelector("#dm-compendium-query");
  const filterButtons = [...section.querySelectorAll("[data-dm-compendium-filter]")];
  let activeFilter = "all";
  let records = [];

  const rerender = () => dmRenderCompendiumResults(section, records, input?.value ?? "", activeFilter);

  input?.addEventListener("input", rerender);
  filterButtons.forEach(button => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.dmCompendiumFilter ?? "all";
      filterButtons.forEach(candidate => {
        const active = candidate === button;
        candidate.classList.toggle("dm-button-primary", active);
        candidate.classList.toggle("dm-button-secondary", !active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      rerender();
      input?.focus();
    });
  });

  dmGetCompendiumIndex()
    .then(index => {
      records = index;
      rerender();
    })
    .catch(error => {
      console.error("DM Cockpit | Compendium-Schnellsuche konnte nicht vorbereitet werden", error);
      const status = section.querySelector("[data-dm-compendium-status]");
      if (status) status.textContent = "Kompendium-Suche konnte nicht vorbereitet werden.";
    });
}

Hooks.on("renderApplicationV2", dmInjectCompendiumSearch);
Hooks.on("updateCompendium", () => { dmCompendiumIndexPromise = null; });

console.log(`DM Cockpit | ${DM_COCKPIT_COMPENDIUM_SEARCH_VERSION} Compendium-Schnellsuche bereit`);
