const DM_COCKPIT_NPC_MEMORY_VERSION = "V0.9.17";
const DM_COCKPIT_NPC_MEMORY_KEY = "npcActionMemory";
const DM_COCKPIT_NPC_SOURCE_KEY = "npcQuickGeneratorLast";

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

function dmNpcMemoryCurrentNpc() {
  try {
    const npc = game.settings.get("dm-cockpit", DM_COCKPIT_NPC_SOURCE_KEY);
    if (!npc || typeof npc !== "object" || !String(npc.name ?? "").trim()) return null;
    return npc;
  } catch (error) {
    console.warn("DM Cockpit | Aktueller Schnell-NPC konnte für Action Memory nicht gelesen werden", error);
    return null;
  }
}

function dmNpcMemoryFingerprint(npc) {
  if (!npc) return "";
  const source = [npc.name, npc.role, npc.appearance, npc.personality, npc.motivation, npc.quirk, npc.secret]
    .map(value => String(value ?? "").trim())
    .join("\u241F");

  let hash = 5381;
  for (let i = 0; i < source.length; i += 1) hash = ((hash << 5) + hash) ^ source.charCodeAt(i);
  return `npc-${(hash >>> 0).toString(36)}`;
}

function dmNpcMemoryNormalizeStore(value) {
  const raw = value && typeof value === "object" ? value : {};
  const memories = raw.memories && typeof raw.memories === "object" ? raw.memories : {};
  const normalized = {};

  for (const [key, entries] of Object.entries(memories)) {
    if (!Array.isArray(entries)) continue;
    normalized[key] = entries
      .filter(entry => entry && typeof entry.text === "string" && entry.text.trim())
      .map(entry => ({
        id: String(entry.id ?? dmNpcMemoryId()),
        text: entry.text.trim(),
        createdAt: Number(entry.createdAt) || Date.now()
      }));
  }

  return { version: 1, memories: normalized };
}

function dmNpcMemoryGetStore() {
  try {
    return dmNpcMemoryNormalizeStore(game.settings.get("dm-cockpit", DM_COCKPIT_NPC_MEMORY_KEY));
  } catch (error) {
    console.warn("DM Cockpit | NPC Action Memory konnte nicht gelesen werden", error);
    return { version: 1, memories: {} };
  }
}

async function dmNpcMemorySetStore(store) {
  await game.settings.set("dm-cockpit", DM_COCKPIT_NPC_MEMORY_KEY, dmNpcMemoryNormalizeStore(store));
}

function dmNpcMemoryFormatTime(timestamp) {
  try {
    return new Intl.DateTimeFormat(game.i18n?.lang ?? "de", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  } catch (_error) {
    return "";
  }
}

function dmNpcMemoryRows(npc) {
  if (!npc) return `<div class="dm-empty-inline"><span>Erst einen NPC generieren.</span></div>`;

  const key = dmNpcMemoryFingerprint(npc);
  const entries = dmNpcMemoryGetStore().memories[key] ?? [];
  if (!entries.length) return `<div class="dm-empty-inline"><span>Noch keine Aktionen für ${dmNpcMemoryEscape(npc.name)} gemerkt.</span></div>`;

  return [...entries].reverse().map(entry => `
    <article class="dm-list-item">
      <div>
        <strong>${dmNpcMemoryEscape(dmNpcMemoryFormatTime(entry.createdAt))}</strong>
        <p>${dmNpcMemoryEscape(entry.text)}</p>
      </div>
      <button type="button" class="dm-button-danger icon-only" data-dm-npc-memory-delete="${dmNpcMemoryEscape(entry.id)}" title="Eintrag löschen" aria-label="Eintrag löschen"><i class="fa-solid fa-trash"></i></button>
    </article>`).join("");
}

function dmNpcMemoryHtml(npc) {
  return `
    <div data-dm-npc-memory-root>
      <div class="dm-cockpit-card-title" style="margin-top:12px;">
        <div><h4>NPC Action Memory</h4><p class="card-subtitle">Was dieser NPC getan, gesagt oder erfahren hat</p></div>
      </div>
      <form data-dm-npc-memory-form class="dm-section-actions" style="align-items:center;">
        <input type="text" name="memoryText" placeholder="z. B. versprach der Gruppe einen Schlüssel" autocomplete="off" ${npc ? "" : "disabled"}>
        <button type="submit" class="dm-button-primary small" ${npc ? "" : "disabled"}><i class="fa-solid fa-plus"></i> Merken</button>
      </form>
      <div class="dm-list" data-dm-npc-memory-list>${dmNpcMemoryRows(npc)}</div>
    </div>`;
}

function dmNpcMemoryIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmNpcMemoryInject(application, element) {
  if (!game.user?.isGM || !dmNpcMemoryIsCockpit(application)) return;

  const badge = element.querySelector?.(".dm-cockpit-badge");
  if (badge) badge.textContent = DM_COCKPIT_NPC_MEMORY_VERSION;

  const npcSection = element.querySelector?.("#dm-npc-generator");
  const npcOutput = npcSection?.querySelector?.("[data-dm-npc-output]");
  if (!npcSection || !npcOutput || npcSection.querySelector("[data-dm-npc-memory-root]")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = dmNpcMemoryHtml(dmNpcMemoryCurrentNpc()).trim();
  const root = wrapper.firstElementChild;
  npcOutput.after(root);

  const refresh = () => {
    const currentNpc = dmNpcMemoryCurrentNpc();
    const fresh = document.createElement("div");
    fresh.innerHTML = dmNpcMemoryHtml(currentNpc).trim();
    root.replaceWith(fresh.firstElementChild);
    dmNpcMemoryInject(application, element);
  };

  root.querySelector("[data-dm-npc-memory-form]")?.addEventListener("submit", async event => {
    event.preventDefault();
    const npc = dmNpcMemoryCurrentNpc();
    if (!npc) return ui.notifications?.warn("DM Cockpit: Erst einen NPC generieren.");

    const input = event.currentTarget.querySelector('input[name="memoryText"]');
    const text = String(input?.value ?? "").trim();
    if (!text) return;

    const store = dmNpcMemoryGetStore();
    const key = dmNpcMemoryFingerprint(npc);
    if (!Array.isArray(store.memories[key])) store.memories[key] = [];
    store.memories[key].push({ id: dmNpcMemoryId(), text, createdAt: Date.now() });
    await dmNpcMemorySetStore(store);
    refresh();
  });

  root.addEventListener("click", async event => {
    const button = event.target.closest?.("[data-dm-npc-memory-delete]");
    if (!button) return;
    const npc = dmNpcMemoryCurrentNpc();
    if (!npc) return;

    const store = dmNpcMemoryGetStore();
    const key = dmNpcMemoryFingerprint(npc);
    store.memories[key] = (store.memories[key] ?? []).filter(entry => entry.id !== button.dataset.dmNpcMemoryDelete);
    if (!store.memories[key].length) delete store.memories[key];
    await dmNpcMemorySetStore(store);
    refresh();
  });

  const observer = new MutationObserver(() => refresh());
  observer.observe(npcOutput, { childList: true, subtree: true });
}

Hooks.once("init", () => {
  game.settings.register("dm-cockpit", DM_COCKPIT_NPC_MEMORY_KEY, {
    name: "DM Cockpit NPC Action Memory",
    scope: "user",
    config: false,
    type: Object,
    default: { version: 1, memories: {} }
  });
});

Hooks.on("renderApplicationV2", dmNpcMemoryInject);

console.log(`DM Cockpit | ${DM_COCKPIT_NPC_MEMORY_VERSION} NPC Action Memory bereit`);
