const DM_COCKPIT_NPC_MEMORY_VERSION = "V0.9.18";
const DM_COCKPIT_NPC_MEMORY_SELECTED_KEY = "npcMemorySelectedActorId";
const DM_COCKPIT_NPC_MEMORY_FLAG = "actionMemory";
const DM_COCKPIT_NPC_PROFILE_FLAG = "quickNpc";

function dmNpcMemoryEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dmNpcMemoryId() {
  return foundry.utils?.randomID?.() ?? crypto.randomUUID();
}

function dmNpcMemoryNormalizeEntries(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(entry => entry && typeof entry.text === "string" && entry.text.trim())
    .map(entry => ({
      id: String(entry.id ?? dmNpcMemoryId()),
      text: entry.text.trim(),
      createdAt: Number(entry.createdAt) || Date.now()
    }));
}

function dmNpcMemoryEntries(actor) {
  if (!actor) return [];
  return dmNpcMemoryNormalizeEntries(actor.getFlag("dm-cockpit", DM_COCKPIT_NPC_MEMORY_FLAG));
}

async function dmNpcMemorySave(actor, entries) {
  await actor.setFlag("dm-cockpit", DM_COCKPIT_NPC_MEMORY_FLAG, dmNpcMemoryNormalizeEntries(entries));
}

function dmNpcMemoryFormatTime(timestamp) {
  try {
    return new Intl.DateTimeFormat(game.i18n?.lang ?? "de", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(timestamp));
  } catch (_error) {
    return "";
  }
}

function dmNpcMemoryActors() {
  return [...(game.actors?.contents ?? [])]
    .filter(actor => actor?.id && actor?.name)
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n?.lang ?? "de"));
}

function dmNpcMemoryTypeLabel(actor) {
  const raw = CONFIG.Actor?.typeLabels?.[actor.type] ?? actor.type ?? "Actor";
  return game.i18n?.has?.(raw) ? game.i18n.localize(raw) : String(raw);
}

function dmNpcMemoryActorOptions(actors, selectedId, query = "") {
  const needle = String(query ?? "").trim().toLocaleLowerCase(game.i18n?.lang ?? "de");
  const filtered = needle
    ? actors.filter(actor => `${actor.name} ${dmNpcMemoryTypeLabel(actor)}`.toLocaleLowerCase(game.i18n?.lang ?? "de").includes(needle))
    : actors;

  if (!filtered.length) return `<option value="">Keine passenden Actors</option>`;
  return filtered.map(actor => `<option value="${dmNpcMemoryEscape(actor.id)}" ${actor.id === selectedId ? "selected" : ""}>${dmNpcMemoryEscape(actor.name)} · ${dmNpcMemoryEscape(dmNpcMemoryTypeLabel(actor))}</option>`).join("");
}

function dmNpcMemoryProfileHtml(actor) {
  if (!actor) return `<div class="dm-empty-inline"><span>Actor auswählen.</span></div>`;
  const profile = actor.getFlag("dm-cockpit", DM_COCKPIT_NPC_PROFILE_FLAG);
  const img = actor.img || Actor.implementation?.DEFAULT_ICON || CONST.DEFAULT_TOKEN;

  let profileHtml = "";
  if (profile && typeof profile === "object") {
    const rows = [
      ["Rolle", profile.role],
      ["Auftreten", profile.appearance],
      ["Persönlichkeit", profile.personality],
      ["Motivation", profile.motivation],
      ["Eigenheit", profile.quirk],
      ["Geheimnis", profile.secret]
    ].filter(([, value]) => value);
    profileHtml = `<div class="dm-list" style="margin-top:8px;">${rows.map(([label, value]) => `<article class="dm-list-item"><div><strong>${dmNpcMemoryEscape(label)}</strong><p>${dmNpcMemoryEscape(value)}</p></div></article>`).join("")}</div>`;
  }

  return `<div class="dm-list-item">
    <div style="display:flex;align-items:center;gap:10px;min-width:0;">
      <img src="${dmNpcMemoryEscape(img)}" alt="" width="44" height="44" style="width:44px;height:44px;object-fit:cover;border-radius:4px;flex:0 0 auto;">
      <div><strong>${dmNpcMemoryEscape(actor.name)}</strong><p>${dmNpcMemoryEscape(dmNpcMemoryTypeLabel(actor))}${profile ? " · Schnellgenerator-NPC" : ""}</p></div>
    </div>
    <button type="button" class="dm-button-secondary small" data-dm-npc-memory-open><i class="fa-solid fa-arrow-up-right-from-square"></i> Actor öffnen</button>
  </div>${profileHtml}`;
}

function dmNpcMemoryRows(actor) {
  if (!actor) return `<div class="dm-empty-inline"><span>Actor auswählen.</span></div>`;
  const entries = dmNpcMemoryEntries(actor);
  if (!entries.length) return `<div class="dm-empty-inline"><span>Noch keine Erinnerungen für ${dmNpcMemoryEscape(actor.name)}.</span></div>`;

  return [...entries].reverse().map(entry => `
    <article class="dm-list-item">
      <div>
        <strong>${dmNpcMemoryEscape(dmNpcMemoryFormatTime(entry.createdAt))}</strong>
        <p>${dmNpcMemoryEscape(entry.text)}</p>
      </div>
      <button type="button" class="dm-button-danger icon-only" data-dm-npc-memory-delete="${dmNpcMemoryEscape(entry.id)}" title="Eintrag löschen" aria-label="Eintrag löschen"><i class="fa-solid fa-trash"></i></button>
    </article>`).join("");
}

function dmNpcMemorySectionHtml() {
  return `<details id="dm-npc-action-memory" class="dm-cockpit-card dm-cockpit-wide dm-collapsible" open>
    <summary class="dm-cockpit-card-title"><div><h3>NPC Memory</h3><p class="card-subtitle">Actors aus dem Foundry-Actor-Tab auswählen und Ereignisse merken</p></div><span class="dm-summary-chevron"><i class="fa-solid fa-chevron-down"></i></span></summary>
    <div class="dm-card-body" data-dm-npc-memory-root>
      <div class="form-group stacked">
        <label for="dm-npc-memory-search">NPC / Actor suchen</label>
        <input id="dm-npc-memory-search" type="search" placeholder="Name oder Actor-Typ …" autocomplete="off">
      </div>
      <div class="form-group stacked">
        <label for="dm-npc-memory-actor">Actor aus dem Actor-Tab</label>
        <select id="dm-npc-memory-actor" data-dm-npc-memory-actor></select>
      </div>
      <div data-dm-npc-memory-profile></div>
      <form data-dm-npc-memory-form class="dm-section-actions" style="align-items:center;margin-top:10px;">
        <input type="text" name="memoryText" placeholder="z. B. versprach der Gruppe einen Schlüssel" autocomplete="off">
        <button type="submit" class="dm-button-primary small"><i class="fa-solid fa-plus"></i> Merken</button>
      </form>
      <div class="dm-list" data-dm-npc-memory-list></div>
    </div>
  </details>`;
}

function dmNpcMemoryIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmNpcMemorySelectedId() {
  try {
    return String(game.settings.get("dm-cockpit", DM_COCKPIT_NPC_MEMORY_SELECTED_KEY) ?? "");
  } catch (_error) {
    return "";
  }
}

async function dmNpcMemorySetSelectedId(actorId) {
  await game.settings.set("dm-cockpit", DM_COCKPIT_NPC_MEMORY_SELECTED_KEY, String(actorId ?? ""));
}

function dmNpcMemoryInject(application, element) {
  if (!game.user?.isGM || !dmNpcMemoryIsCockpit(application)) return;

  const badge = element.querySelector?.(".dm-cockpit-badge");
  if (badge) badge.textContent = DM_COCKPIT_NPC_MEMORY_VERSION;

  const grid = element.querySelector?.(".dm-cockpit-grid");
  if (!grid || element.querySelector("#dm-npc-action-memory")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = dmNpcMemorySectionHtml().trim();
  const section = wrapper.firstElementChild;
  const generator = grid.querySelector("#dm-npc-generator");
  if (generator) generator.after(section);
  else grid.appendChild(section);

  const root = section.querySelector("[data-dm-npc-memory-root]");
  const search = section.querySelector("#dm-npc-memory-search");
  const select = section.querySelector("[data-dm-npc-memory-actor]");
  const profile = section.querySelector("[data-dm-npc-memory-profile]");
  const list = section.querySelector("[data-dm-npc-memory-list]");
  const form = section.querySelector("[data-dm-npc-memory-form]");

  let selectedId = dmNpcMemorySelectedId();

  const selectedActor = () => game.actors?.get(selectedId) ?? null;

  const refreshSelectedActor = () => {
    const actor = selectedActor();
    if (profile) profile.innerHTML = dmNpcMemoryProfileHtml(actor);
    if (list) list.innerHTML = dmNpcMemoryRows(actor);
    const input = form?.querySelector('input[name="memoryText"]');
    const button = form?.querySelector('button[type="submit"]');
    if (input) input.disabled = !actor;
    if (button) button.disabled = !actor;
  };

  const refreshActorOptions = () => {
    const actors = dmNpcMemoryActors();
    if (!actors.some(actor => actor.id === selectedId)) selectedId = actors[0]?.id ?? "";
    select.innerHTML = dmNpcMemoryActorOptions(actors, selectedId, search?.value ?? "");
    if (select.value) selectedId = select.value;
    else if (String(search?.value ?? "").trim()) selectedId = "";
    refreshSelectedActor();
  };

  search?.addEventListener("input", refreshActorOptions);

  select?.addEventListener("change", async () => {
    selectedId = select.value;
    await dmNpcMemorySetSelectedId(selectedId);
    refreshSelectedActor();
  });

  root?.addEventListener("click", async event => {
    const open = event.target.closest?.("[data-dm-npc-memory-open]");
    if (open) {
      const actor = selectedActor();
      if (!actor) return;
      actor.sheet?.render({ force: true });
      return;
    }

    const remove = event.target.closest?.("[data-dm-npc-memory-delete]");
    if (!remove) return;
    const actor = selectedActor();
    if (!actor) return;
    const entries = dmNpcMemoryEntries(actor).filter(entry => entry.id !== remove.dataset.dmNpcMemoryDelete);
    await dmNpcMemorySave(actor, entries);
    refreshSelectedActor();
  });

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    const actor = selectedActor();
    if (!actor) return ui.notifications?.warn("DM Cockpit: Erst einen Actor auswählen.");
    const input = form.querySelector('input[name="memoryText"]');
    const text = String(input?.value ?? "").trim();
    if (!text) return;
    const entries = dmNpcMemoryEntries(actor);
    entries.push({ id: dmNpcMemoryId(), text, createdAt: Date.now() });
    await dmNpcMemorySave(actor, entries);
    input.value = "";
    refreshSelectedActor();
  });

  section._dmNpcMemoryRefreshActors = refreshActorOptions;
  section._dmNpcMemorySelectActor = async actorId => {
    selectedId = actorId;
    await dmNpcMemorySetSelectedId(selectedId);
    if (search) search.value = "";
    refreshActorOptions();
  };

  refreshActorOptions();
}

function dmNpcMemoryRefreshOpenSections(actorToSelect = null) {
  document.querySelectorAll("#dm-npc-action-memory").forEach(section => {
    if (actorToSelect && typeof section._dmNpcMemorySelectActor === "function") section._dmNpcMemorySelectActor(actorToSelect.id);
    else section._dmNpcMemoryRefreshActors?.();
  });
}

Hooks.once("init", () => {
  game.settings.register("dm-cockpit", DM_COCKPIT_NPC_MEMORY_SELECTED_KEY, {
    name: "DM Cockpit ausgewählter NPC Memory Actor",
    scope: "client",
    config: false,
    type: String,
    default: ""
  });
});

Hooks.on("renderApplicationV2", dmNpcMemoryInject);
Hooks.on("createActor", actor => dmNpcMemoryRefreshOpenSections(actor));
Hooks.on("deleteActor", () => dmNpcMemoryRefreshOpenSections());
Hooks.on("updateActor", () => dmNpcMemoryRefreshOpenSections());
Hooks.on("dmCockpitQuickNpcActorCreated", actor => dmNpcMemoryRefreshOpenSections(actor));

console.log(`DM Cockpit | ${DM_COCKPIT_NPC_MEMORY_VERSION} NPC Memory bereit`);
