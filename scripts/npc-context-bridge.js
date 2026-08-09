const DM_COCKPIT_NPC_CONTEXT_BRIDGE_VERSION = "V0.9.20";
const DM_COCKPIT_NPC_CONTEXT_SELECTED_KEY = "npcMemorySelectedActorId";

function dmNpcContextBridgeIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmNpcContextBridgeVisibleSelection() {
  const select = document.querySelector("#dm-npc-action-memory [data-dm-npc-memory-actor]");
  const actorId = String(select?.value ?? "").trim();
  return actorId ? game.actors?.get(actorId) ?? null : null;
}

function dmNpcContextBridgeStoredSelection() {
  try {
    const actorId = String(game.settings.get("dm-cockpit", DM_COCKPIT_NPC_CONTEXT_SELECTED_KEY) ?? "").trim();
    return actorId ? game.actors?.get(actorId) ?? null : null;
  } catch (_error) {
    return null;
  }
}

function dmNpcContextBridgeRenderTranscript(actor) {
  document.querySelectorAll("#dm-discord-live-transcript").forEach(section => {
    const target = section.querySelector("[data-dm-transcript-npc]");
    if (!target) return;

    target.replaceChildren();
    const icon = document.createElement("i");
    icon.className = actor ? "fa-solid fa-user-tag" : "fa-solid fa-user-slash";
    target.append(icon, document.createTextNode(actor ? ` ${actor.name} · Cockpit` : " Kein NPC-Kontext"));
  });
}

async function dmNpcContextBridgeSync({ announce = false } = {}) {
  if (!game.user?.isGM) return null;

  const visibleActor = dmNpcContextBridgeVisibleSelection();
  const storedActor = dmNpcContextBridgeStoredSelection();
  const actor = visibleActor ?? storedActor;

  if (visibleActor && visibleActor.id !== storedActor?.id) {
    try {
      await game.settings.set("dm-cockpit", DM_COCKPIT_NPC_CONTEXT_SELECTED_KEY, visibleActor.id);
    } catch (error) {
      console.warn("DM Cockpit | NPC-Kontext-Auswahl konnte nicht synchronisiert werden", error);
    }
  }

  dmNpcContextBridgeRenderTranscript(actor);
  Hooks.callAll("dmCockpitNpcContextBridgeChanged", actor);

  if (announce && actor) ui.notifications?.info(`DM Cockpit: NPC-Kontext ${actor.name} synchronisiert.`);
  return actor;
}

Hooks.on("renderApplicationV2", (application, element) => {
  if (!game.user?.isGM || !dmNpcContextBridgeIsCockpit(application)) return;

  const badge = element.querySelector?.(".dm-cockpit-badge");
  if (badge) badge.textContent = DM_COCKPIT_NPC_CONTEXT_BRIDGE_VERSION;

  window.setTimeout(() => dmNpcContextBridgeSync(), 0);
});

document.addEventListener("change", event => {
  if (!event.target?.matches?.("#dm-npc-action-memory [data-dm-npc-memory-actor]")) return;
  window.setTimeout(() => dmNpcContextBridgeSync(), 0);
});

document.addEventListener("click", event => {
  if (!event.target?.closest?.("#dm-discord-live-transcript [data-dm-transcript-send-npc]")) return;
  window.setTimeout(() => dmNpcContextBridgeSync(), 0);
}, true);

Hooks.on("createActor", () => window.setTimeout(() => dmNpcContextBridgeSync(), 0));
Hooks.on("deleteActor", () => window.setTimeout(() => dmNpcContextBridgeSync(), 0));
Hooks.on("dmCockpitQuickNpcActorCreated", () => window.setTimeout(() => dmNpcContextBridgeSync(), 0));

console.log(`DM Cockpit | ${DM_COCKPIT_NPC_CONTEXT_BRIDGE_VERSION} NPC-Kontext-Bridge bereit`);
