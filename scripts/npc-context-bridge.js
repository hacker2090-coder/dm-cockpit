const DM_COCKPIT_NPC_CONTEXT_BRIDGE_VERSION = "V0.9.21";
const DM_COCKPIT_NPC_CONTEXT_SELECTED_KEY = "npcMemorySelectedActorId";

function dmNpcContextBridgeIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmNpcContextBridgeVisibleSelection() {
  const selects = [...document.querySelectorAll("[data-dm-npc-memory-actor]")];
  for (const select of selects) {
    const actorId = String(select?.value ?? "").trim();
    const actor = actorId ? game.actors?.get(actorId) ?? null : null;
    if (actor) return actor;
  }
  return null;
}

function dmNpcContextBridgeStoredSelection() {
  try {
    const actorId = String(game.settings.get("dm-cockpit", DM_COCKPIT_NPC_CONTEXT_SELECTED_KEY) ?? "").trim();
    return actorId ? game.actors?.get(actorId) ?? null : null;
  } catch (_error) {
    return null;
  }
}

function dmNpcContextBridgeContext(actor) {
  if (!actor) {
    return {
      source: "none",
      actorId: null,
      actorUuid: null,
      actorName: null,
      changedAt: new Date().toISOString()
    };
  }

  return {
    source: "cockpit",
    actorId: actor.id,
    actorUuid: actor.uuid ?? null,
    actorName: actor.name ?? null,
    changedAt: new Date().toISOString()
  };
}

function dmNpcContextBridgeFingerprint(context) {
  return [context?.source, context?.actorId, context?.actorUuid, context?.actorName]
    .map(value => String(value ?? ""))
    .join("|");
}

function dmNpcContextBridgeRenderTranscript(actor) {
  document.querySelectorAll("[data-dm-transcript-npc]").forEach(target => {
    target.replaceChildren();
    const icon = document.createElement("i");
    icon.className = actor ? "fa-solid fa-user-tag" : "fa-solid fa-user-slash";
    target.append(icon, document.createTextNode(actor ? ` ${actor.name} · Cockpit` : " Kein NPC-Kontext"));
  });
}

function dmNpcContextBridgeApplyTransport(actor, { send = true } = {}) {
  const context = dmNpcContextBridgeContext(actor);
  const transport = globalThis.DMCockpitLiveTranscript?.transport;

  if (transport) {
    transport.lastNpcContext = context;
    transport.lastNpcFingerprint = dmNpcContextBridgeFingerprint(context);

    if (send && transport.ws?.readyState === WebSocket.OPEN) {
      transport.send("npc.context", context);
    }

    Hooks.callAll("dmCockpitTranscriptStateChanged", transport.snapshot());
  }

  dmNpcContextBridgeRenderTranscript(actor);
  Hooks.callAll("dmCockpitNpcContextBridgeChanged", actor, context);
  return context;
}

async function dmNpcContextBridgePersist(actor) {
  if (!actor) return;
  try {
    const current = String(game.settings.get("dm-cockpit", DM_COCKPIT_NPC_CONTEXT_SELECTED_KEY) ?? "");
    if (current !== actor.id) {
      await game.settings.set("dm-cockpit", DM_COCKPIT_NPC_CONTEXT_SELECTED_KEY, actor.id);
    }
  } catch (error) {
    console.warn("DM Cockpit | NPC-Kontext-Auswahl konnte nicht gespeichert werden", error);
  }
}

async function dmNpcContextBridgeSync({ announce = false, send = true } = {}) {
  if (!game.user?.isGM) return null;

  const visibleActor = dmNpcContextBridgeVisibleSelection();
  const storedActor = dmNpcContextBridgeStoredSelection();
  const actor = visibleActor ?? storedActor;

  if (visibleActor) await dmNpcContextBridgePersist(visibleActor);
  dmNpcContextBridgeApplyTransport(actor, { send });

  if (announce) {
    if (actor) ui.notifications?.info(`DM Cockpit: NPC-Kontext aktiv: ${actor.name}`);
    else ui.notifications?.warn("DM Cockpit: Kein Actor im NPC Memory ausgewählt.");
  }

  return actor;
}

Hooks.on("renderApplicationV2", (application, element) => {
  if (!game.user?.isGM || !dmNpcContextBridgeIsCockpit(application)) return;

  const badge = element.querySelector?.(".dm-cockpit-badge");
  if (badge) badge.textContent = DM_COCKPIT_NPC_CONTEXT_BRIDGE_VERSION;

  window.setTimeout(() => dmNpcContextBridgeSync({ send: false }), 0);
});

document.addEventListener("change", event => {
  if (!event.target?.matches?.("[data-dm-npc-memory-actor]")) return;
  window.setTimeout(() => dmNpcContextBridgeSync({ send: true }), 0);
});

document.addEventListener("click", event => {
  if (!event.target?.closest?.("[data-dm-transcript-send-npc]")) return;

  // Den alten Live-Transcript-Handler bewusst nicht mehr ausführen lassen.
  // Die Bridge liest den tatsächlich sichtbaren Actor direkt aus dem Dropdown.
  event.preventDefault();
  event.stopImmediatePropagation();
  dmNpcContextBridgeSync({ announce: true, send: true });
}, true);

Hooks.on("createActor", () => window.setTimeout(() => dmNpcContextBridgeSync({ send: false }), 0));
Hooks.on("deleteActor", () => window.setTimeout(() => dmNpcContextBridgeSync({ send: false }), 0));
Hooks.on("dmCockpitQuickNpcActorCreated", () => window.setTimeout(() => dmNpcContextBridgeSync({ send: false }), 0));

console.log(`DM Cockpit | ${DM_COCKPIT_NPC_CONTEXT_BRIDGE_VERSION} NPC-Kontext-Bridge bereit`);
