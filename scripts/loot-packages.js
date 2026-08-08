const MODULE_ID = "dm-cockpit";
const LOOT_PACKAGES_KEY = "lootPackages";
const { DialogV2 } = foundry.applications.api;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeId() {
  return foundry.utils?.randomID?.() ?? crypto.randomUUID();
}

function dialogValue(result, key, fallback = "") {
  if (!result) return fallback;
  if (typeof result.get === "function") return result.get(key) ?? fallback;
  return result[key] ?? fallback;
}

function emptyStore() {
  return { version: 1, packages: [] };
}

function normalizeStore(value) {
  const raw = value && typeof value === "object" ? value : {};
  const packages = Array.isArray(raw.packages) ? raw.packages : [];
  return {
    version: 1,
    packages: packages.map(pkg => ({
      id: pkg.id ?? makeId(),
      name: String(pkg.name ?? "Belohnungspaket"),
      note: String(pkg.note ?? ""),
      items: (Array.isArray(pkg.items) ? pkg.items : [])
        .filter(item => item?.uuid)
        .map(item => ({
          id: item.id ?? makeId(),
          uuid: String(item.uuid),
          name: String(item.name ?? "Gegenstand"),
          quantity: Math.max(1, Number.parseInt(item.quantity ?? 1, 10) || 1)
        }))
    }))
  };
}

function getStore() {
  try {
    return normalizeStore(game.settings.get(MODULE_ID, LOOT_PACKAGES_KEY));
  } catch (error) {
    console.warn("DM Cockpit | Belohnungspakete konnten nicht gelesen werden", error);
    return emptyStore();
  }
}

async function writeStore(store) {
  if (!game.user?.isGM) return;
  await game.settings.set(MODULE_ID, LOOT_PACKAGES_KEY, normalizeStore(store));
}

function actorOptions() {
  return [...(game.actors?.contents ?? [])]
    .sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n?.lang ?? "de"))
    .map(actor => `<option value="${escapeHtml(actor.id)}">${escapeHtml(actor.name)}${actor.type ? ` — ${escapeHtml(actor.type)}` : ""}</option>`)
    .join("");
}

async function itemOptions() {
  const options = [];

  for (const item of [...(game.items?.contents ?? [])].sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n?.lang ?? "de"))) {
    options.push(`<option value="${escapeHtml(item.uuid)}">Welt › ${escapeHtml(item.name)}</option>`);
  }

  for (const pack of game.packs ?? []) {
    if (pack.documentName !== "Item") continue;
    try {
      const index = await pack.getIndex();
      const entries = [...index].sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n?.lang ?? "de"));
      for (const entry of entries) {
        options.push(`<option value="${escapeHtml(entry.uuid)}">${escapeHtml(pack.title ?? pack.metadata?.label ?? pack.collection)} › ${escapeHtml(entry.name)}</option>`);
      }
    } catch (error) {
      console.warn(`DM Cockpit | Item-Kompendium konnte nicht gelesen werden: ${pack.collection}`, error);
    }
  }

  return options.join("");
}

async function itemMetadata(uuid) {
  try {
    const doc = await fromUuid(uuid);
    if (!doc || doc.documentName !== "Item") return null;
    return { name: doc.name ?? "Gegenstand" };
  } catch (error) {
    console.warn("DM Cockpit | Gegenstand konnte nicht gelesen werden", error);
    return null;
  }
}

function itemRows(pkg) {
  if (!pkg.items.length) return `<div class="dm-empty-inline"><span>Noch keine Gegenstände.</span></div>`;
  return pkg.items.map(item => `
    <div class="dm-list-item">
      <div><strong>${escapeHtml(item.name)}</strong><p>Menge: ${item.quantity}</p></div>
      <button type="button" class="dm-button-danger icon-only" data-action="delete-loot-item" data-package-id="${escapeHtml(pkg.id)}" data-item-id="${escapeHtml(item.id)}" title="Gegenstand entfernen" aria-label="Gegenstand entfernen"><i class="fa-solid fa-trash"></i></button>
    </div>`).join("");
}

function packageRows(store) {
  if (!store.packages.length) return `<div class="dm-empty-inline"><span>Keine Belohnungspakete angelegt.</span></div>`;

  return store.packages.map(pkg => `
    <article class="dm-list-item dm-loot-package" data-package-id="${escapeHtml(pkg.id)}">
      <div class="dm-loot-package-main">
        <strong>${escapeHtml(pkg.name)}</strong>
        ${pkg.note ? `<p>${escapeHtml(pkg.note)}</p>` : `<p>Keine Notiz</p>`}
        <div class="dm-list">${itemRows(pkg)}</div>
        <div class="dm-section-actions">
          <button type="button" class="dm-button-secondary small" data-action="add-loot-item" data-id="${escapeHtml(pkg.id)}"><i class="fa-solid fa-plus"></i> Gegenstand</button>
        </div>
      </div>
      <div class="dm-actions">
        <button type="button" class="dm-button-primary" data-action="distribute-loot" data-id="${escapeHtml(pkg.id)}"><i class="fa-solid fa-box-open"></i> Verteilen</button>
        <button type="button" class="dm-button-secondary" data-action="show-loot" data-id="${escapeHtml(pkg.id)}"><i class="fa-solid fa-eye"></i> Nur zeigen</button>
        <button type="button" class="dm-button-danger icon-only" data-action="delete-loot-package" data-id="${escapeHtml(pkg.id)}" title="Paket löschen" aria-label="Paket löschen"><i class="fa-solid fa-trash"></i></button>
      </div>
    </article>`).join("");
}

function sectionHtml(store) {
  return `
    <details id="dm-loot-packages" class="dm-cockpit-card dm-cockpit-wide dm-collapsible" open>
      <summary class="dm-cockpit-card-title">
        <div><h3>Loot-/Belohnungspakete</h3><p class="card-subtitle">${store.packages.length} Pakete</p></div>
        <span class="dm-summary-chevron"><i class="fa-solid fa-chevron-down"></i></span>
      </summary>
      <div class="dm-card-body">
        <div class="dm-section-actions">
          <button type="button" class="dm-button-primary small" data-action="create-loot-package"><i class="fa-solid fa-plus"></i> Paket anlegen</button>
        </div>
        <div class="dm-list">${packageRows(store)}</div>
      </div>
    </details>`;
}

async function createPackage(application) {
  const result = await DialogV2.input({
    window: { title: "Belohnungspaket anlegen" },
    content: `
      <div class="form-group"><label>Name</label><div class="form-fields"><input type="text" name="name" placeholder="z. B. Schatzkammer" autofocus></div></div>
      <div class="form-group stacked"><label>Notiz</label><textarea name="note" rows="4" placeholder="z. B. 100 GP, Brief des Auftraggebers …"></textarea></div>`,
    ok: { label: "Anlegen", icon: "fa-solid fa-plus" },
    modal: true,
    rejectClose: false
  });
  if (!result) return;

  const name = String(dialogValue(result, "name") ?? "").trim();
  const note = String(dialogValue(result, "note") ?? "").trim();
  if (!name) return ui.notifications?.warn("DM Cockpit: Bitte einen Paketnamen eingeben.");

  const store = getStore();
  store.packages.push({ id: makeId(), name, note, items: [] });
  await writeStore(store);
  await application.render({ force: true });
}

async function addItem(application, packageId) {
  const options = await itemOptions();
  if (!options) return ui.notifications?.warn("DM Cockpit: Keine Gegenstände in Welt oder Item-Kompendien gefunden.");

  const result = await DialogV2.input({
    window: { title: "Gegenstand zum Paket hinzufügen" },
    content: `
      <div class="form-group"><label>Gegenstand</label><div class="form-fields"><select name="itemUuid">${options}</select></div></div>
      <div class="form-group"><label>Menge</label><div class="form-fields"><input type="number" name="quantity" value="1" min="1" max="99" step="1"></div></div>`,
    ok: { label: "Hinzufügen", icon: "fa-solid fa-plus" },
    modal: true,
    rejectClose: false
  });
  if (!result) return;

  const uuid = String(dialogValue(result, "itemUuid") ?? "").trim();
  const quantity = Math.max(1, Math.min(99, Number.parseInt(dialogValue(result, "quantity", 1), 10) || 1));
  const metadata = uuid ? await itemMetadata(uuid) : null;
  if (!metadata) return ui.notifications?.warn("DM Cockpit: Gegenstand konnte nicht geladen werden.");

  const store = getStore();
  const pkg = store.packages.find(entry => entry.id === packageId);
  if (!pkg) return;

  const existing = pkg.items.find(item => item.uuid === uuid);
  if (existing) existing.quantity += quantity;
  else pkg.items.push({ id: makeId(), uuid, name: metadata.name, quantity });

  await writeStore(store);
  await application.render({ force: true });
}

async function showPackage(pkg) {
  const itemList = pkg.items.length
    ? `<ul>${pkg.items.map(item => `<li>${escapeHtml(item.quantity)}× ${escapeHtml(item.name)}</li>`).join("")}</ul>`
    : `<p><em>Keine Gegenstände hinterlegt.</em></p>`;
  const note = pkg.note ? `<p>${escapeHtml(pkg.note).replaceAll("\n", "<br>")}</p>` : "";

  await ChatMessage.implementation.create({
    speaker: { alias: "DM Cockpit" },
    content: `<section class="dm-cockpit-reward"><h3>${escapeHtml(pkg.name)}</h3>${itemList}${note}</section>`
  });
}

async function distributePackage(pkg) {
  if (!pkg.items.length) return ui.notifications?.warn("DM Cockpit: Dieses Paket enthält keine Gegenstände zum Verteilen.");

  const options = actorOptions();
  if (!options) return ui.notifications?.warn("DM Cockpit: Keine Welt-Actors gefunden.");

  const result = await DialogV2.input({
    window: { title: `„${pkg.name}“ verteilen` },
    content: `<div class="form-group"><label>Empfänger</label><div class="form-fields"><select name="actorId">${options}</select></div></div>`,
    ok: { label: "Verteilen", icon: "fa-solid fa-box-open" },
    modal: true,
    rejectClose: false
  });
  if (!result) return;

  const actorId = String(dialogValue(result, "actorId") ?? "").trim();
  const actor = game.actors?.get(actorId);
  if (!actor) return ui.notifications?.warn("DM Cockpit: Empfänger wurde nicht gefunden.");

  const data = [];
  for (const item of pkg.items) {
    const doc = await fromUuid(item.uuid);
    if (!doc || doc.documentName !== "Item") {
      ui.notifications?.warn(`DM Cockpit: „${item.name}“ konnte nicht geladen werden und wurde übersprungen.`);
      continue;
    }

    const source = doc.toObject();
    delete source._id;

    if (source.system && Object.hasOwn(source.system, "quantity")) {
      source.system.quantity = item.quantity;
      data.push(source);
    } else {
      for (let i = 0; i < item.quantity; i += 1) {
        const copy = foundry.utils.deepClone(source);
        delete copy._id;
        data.push(copy);
      }
    }
  }

  if (!data.length) return ui.notifications?.warn("DM Cockpit: Es konnten keine Gegenstände verteilt werden.");

  try {
    await actor.createEmbeddedDocuments("Item", data);
    ui.notifications?.info(`DM Cockpit: „${pkg.name}“ an ${actor.name} verteilt.`);
  } catch (error) {
    console.error("DM Cockpit | Belohnungspaket konnte nicht verteilt werden", error);
    ui.notifications?.error("DM Cockpit: Belohnungspaket konnte nicht verteilt werden.");
  }
}

function isCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function injectLootPackages(application, element) {
  if (!game.user?.isGM || !isCockpit(application)) return;

  const badge = element.querySelector?.(".dm-cockpit-badge");
  if (badge) badge.textContent = "V0.9.13";

  const grid = element.querySelector?.(".dm-cockpit-grid");
  if (!grid || element.querySelector("#dm-loot-packages")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = sectionHtml(getStore()).trim();
  const section = wrapper.firstElementChild;
  const handouts = grid.querySelector("#dm-handout-queue");
  if (handouts?.nextSibling) grid.insertBefore(section, handouts.nextSibling);
  else grid.appendChild(section);

  section.querySelector('[data-action="create-loot-package"]')?.addEventListener("click", () => createPackage(application));

  section.querySelectorAll('[data-action="add-loot-item"]').forEach(button => {
    button.addEventListener("click", () => addItem(application, button.dataset.id));
  });

  section.querySelectorAll('[data-action="delete-loot-item"]').forEach(button => {
    button.addEventListener("click", async () => {
      const store = getStore();
      const pkg = store.packages.find(entry => entry.id === button.dataset.packageId);
      if (!pkg) return;
      pkg.items = pkg.items.filter(item => item.id !== button.dataset.itemId);
      await writeStore(store);
      await application.render({ force: true });
    });
  });

  section.querySelectorAll('[data-action="show-loot"]').forEach(button => {
    button.addEventListener("click", async () => {
      const pkg = getStore().packages.find(entry => entry.id === button.dataset.id);
      if (pkg) await showPackage(pkg);
    });
  });

  section.querySelectorAll('[data-action="distribute-loot"]').forEach(button => {
    button.addEventListener("click", async () => {
      const pkg = getStore().packages.find(entry => entry.id === button.dataset.id);
      if (pkg) await distributePackage(pkg);
    });
  });

  section.querySelectorAll('[data-action="delete-loot-package"]').forEach(button => {
    button.addEventListener("click", async () => {
      const store = getStore();
      const pkg = store.packages.find(entry => entry.id === button.dataset.id);
      if (!pkg) return;

      const confirmed = await DialogV2.confirm({
        window: { title: "Belohnungspaket löschen?" },
        content: `<p>„<strong>${escapeHtml(pkg.name)}</strong>“ wirklich löschen?</p>`,
        modal: true,
        rejectClose: false
      });
      if (!confirmed) return;

      store.packages = store.packages.filter(entry => entry.id !== pkg.id);
      await writeStore(store);
      await application.render({ force: true });
    });
  });
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, LOOT_PACKAGES_KEY, {
    name: "DM Cockpit Loot-/Belohnungspakete",
    scope: "world",
    config: false,
    type: Object,
    default: emptyStore()
  });
  console.log("DM Cockpit | V0.9.13 Loot-/Belohnungspakete initialisiert");
});

Hooks.on("renderApplicationV2", injectLootPackages);
