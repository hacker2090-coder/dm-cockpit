const MODULE_ID = "dm-cockpit";
const HANDOUT_QUEUE_KEY = "handoutQueue";
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

function emptyQueue() {
  return { version: 1, items: [] };
}

function normalizeQueue(value) {
  const raw = value && typeof value === "object" ? value : {};
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    version: 1,
    items: items
      .filter(item => item?.uuid)
      .map(item => ({
        id: item.id ?? makeId(),
        uuid: String(item.uuid),
        name: String(item.name ?? "Unbenanntes Handout"),
        sourceLabel: String(item.sourceLabel ?? "Journal"),
        addedAt: item.addedAt ?? null
      }))
  };
}

function getQueue() {
  try {
    return normalizeQueue(game.settings.get(MODULE_ID, HANDOUT_QUEUE_KEY));
  } catch (error) {
    console.warn("DM Cockpit | Handout Queue konnte nicht gelesen werden", error);
    return emptyQueue();
  }
}

async function writeQueue(queue) {
  if (!game.user?.isGM) return;
  await game.settings.set(MODULE_ID, HANDOUT_QUEUE_KEY, normalizeQueue(queue));
}

function handoutOptions() {
  const options = [];
  for (const entry of game.journal?.contents ?? []) {
    options.push(`<option value="${escapeHtml(entry.uuid)}">${escapeHtml(entry.name)} — gesamter Eintrag</option>`);
    for (const page of entry.pages?.contents ?? []) {
      options.push(`<option value="${escapeHtml(page.uuid)}">${escapeHtml(entry.name)} › ${escapeHtml(page.name)}</option>`);
    }
  }
  return options.join("");
}

async function metadataFor(uuid) {
  try {
    const doc = await fromUuid(uuid);
    if (!doc) return null;
    if (doc.documentName === "JournalEntry") {
      return { name: doc.name ?? "Unbenanntes Handout", sourceLabel: "Journal-Eintrag" };
    }
    if (doc.documentName === "JournalEntryPage") {
      return {
        name: `${doc.parent?.name ?? "Journal"} › ${doc.name ?? "Seite"}`,
        sourceLabel: "Journal-Seite"
      };
    }
    return null;
  } catch (error) {
    console.warn("DM Cockpit | Handout konnte nicht gelesen werden", error);
    return null;
  }
}

async function showHandout(item) {
  try {
    const doc = await fromUuid(item.uuid);
    if (!doc) return ui.notifications?.warn("DM Cockpit: Das Handout existiert nicht mehr.");
    if (!["JournalEntry", "JournalEntryPage"].includes(doc.documentName)) {
      return ui.notifications?.warn("DM Cockpit: Dieser Queue-Eintrag ist kein Journal-Handout.");
    }
    await game.journal.constructor.showDialog(doc);
  } catch (error) {
    console.error("DM Cockpit | Handout konnte nicht gezeigt werden", error);
    ui.notifications?.error("DM Cockpit: Handout konnte nicht gezeigt werden.");
  }
}

function queueHtml(queue) {
  const rows = queue.items.length
    ? queue.items.map(item => `
      <article class="dm-list-item">
        <div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.sourceLabel)}</p></div>
        <div class="dm-actions">
          <button type="button" class="dm-button-primary" data-action="show-handout" data-id="${escapeHtml(item.id)}"><i class="fa-solid fa-eye"></i> Spielern zeigen</button>
          <button type="button" class="dm-button-danger icon-only" data-action="delete-handout" data-id="${escapeHtml(item.id)}" title="Aus Queue entfernen" aria-label="Handout aus Queue entfernen"><i class="fa-solid fa-trash"></i></button>
        </div>
      </article>`).join("")
    : `<div class="dm-empty-inline"><span>Keine Handouts vorgemerkt.</span></div>`;

  return `
    <details id="dm-handout-queue" class="dm-cockpit-card dm-cockpit-wide dm-collapsible" open>
      <summary class="dm-cockpit-card-title">
        <div><h3>Handout Queue</h3><p class="card-subtitle">${queue.items.length} vorgemerkt</p></div>
        <span class="dm-summary-chevron"><i class="fa-solid fa-chevron-down"></i></span>
      </summary>
      <div class="dm-card-body">
        <div class="dm-section-actions">
          <button type="button" class="dm-button-primary small" data-action="add-handout"><i class="fa-solid fa-plus"></i> Handout hinzufügen</button>
        </div>
        <div class="dm-list">${rows}</div>
      </div>
    </details>`;
}

function isCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function injectQueue(application, element) {
  if (!game.user?.isGM || !isCockpit(application)) return;

  const badge = element.querySelector?.(".dm-cockpit-badge");
  if (badge) badge.textContent = "V0.9.12";

  const grid = element.querySelector?.(".dm-cockpit-grid");
  if (!grid || element.querySelector("#dm-handout-queue")) return;

  const spontaneous = grid.querySelector('[data-action="create-spontaneous"]')?.closest("details");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = queueHtml(getQueue()).trim();
  const section = wrapper.firstElementChild;
  if (spontaneous?.nextSibling) grid.insertBefore(section, spontaneous.nextSibling);
  else grid.appendChild(section);

  section.querySelector('[data-action="add-handout"]')?.addEventListener("click", async () => {
    const options = handoutOptions();
    if (!options) return ui.notifications?.warn("DM Cockpit: Keine Journal-Handouts vorhanden.");

    const result = await DialogV2.input({
      window: { title: "Handout zur Queue hinzufügen" },
      content: `<div class="form-group"><label>Handout auswählen</label><div class="form-fields"><select name="handoutUuid">${options}</select></div></div>`,
      ok: { label: "Zur Queue", icon: "fa-solid fa-list" },
      modal: true,
      rejectClose: false
    });
    if (!result) return;

    const uuid = String(dialogValue(result, "handoutUuid") ?? "").trim();
    const metadata = uuid ? await metadataFor(uuid) : null;
    if (!metadata) return ui.notifications?.warn("DM Cockpit: Das ausgewählte Handout ist nicht verfügbar.");

    const queue = getQueue();
    if (queue.items.some(item => item.uuid === uuid)) {
      return ui.notifications?.warn("DM Cockpit: Dieses Handout ist bereits in der Queue.");
    }

    queue.items.push({ id: makeId(), uuid, ...metadata, addedAt: new Date().toISOString() });
    await writeQueue(queue);
    ui.notifications?.info(`DM Cockpit: „${metadata.name}“ zur Handout Queue hinzugefügt.`);
    await application.render({ force: true });
  });

  section.querySelectorAll('[data-action="show-handout"]').forEach(button => {
    button.addEventListener("click", async () => {
      const item = getQueue().items.find(entry => entry.id === button.dataset.id);
      if (item) await showHandout(item);
      // Option B: Der Eintrag bleibt nach dem Zeigen in der Queue.
    });
  });

  section.querySelectorAll('[data-action="delete-handout"]').forEach(button => {
    button.addEventListener("click", async () => {
      const queue = getQueue();
      const item = queue.items.find(entry => entry.id === button.dataset.id);
      if (!item) return;

      const confirmed = await DialogV2.confirm({
        window: { title: "Handout aus Queue entfernen?" },
        content: `<p>„<strong>${escapeHtml(item.name)}</strong>“ aus der Queue entfernen?</p>`,
        modal: true,
        rejectClose: false
      });
      if (!confirmed) return;

      queue.items = queue.items.filter(entry => entry.id !== item.id);
      await writeQueue(queue);
      await application.render({ force: true });
    });
  });
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, HANDOUT_QUEUE_KEY, {
    name: "DM Cockpit Handout Queue",
    scope: "world",
    config: false,
    type: Object,
    default: emptyQueue()
  });
  console.log("DM Cockpit | V0.9.12 Handout Queue initialisiert");
});

Hooks.on("renderApplicationV2", injectQueue);
