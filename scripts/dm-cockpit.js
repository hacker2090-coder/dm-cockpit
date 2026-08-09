const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const MODULE_ID = "dm-cockpit";
const FLOW_KEY = "adventureFlow";
const SPONTANEOUS_KEY = "spontaneousScenes";
const PRESETS_KEY = "scenePresets";
const LEGACY_PRESET_KEY = "scenePreset";
const SPAWN_POINTS_KEY = "enemySpawnPoints";
const RESERVE_BENCH_KEY = "enemyReserveBench";
const SPAWN_COMPENDIUM_SOURCE_FLAG = "spawnCompendiumSource";

let dmCockpitApp = null;
let pendingSpawnPlacement = null;

/*
 * AKTIVER GRUNDKERN
 * 1. LIVE-Dashboard
 * 2. Abenteuer-Flowchart (nur Knoten, Position und aktueller Knoten)
 * 3. Spontane Szenen (separat anlegen, optional in Flowchart übernehmen)
 * 4. Szenen-Presets
 * 5. Gegner-Spawnpunkte (benannte Position setzen, Gegner erst beim Spawn aus Spielfeld, Akteuren oder Kompendien auswählen)
 * 6. Enemy Reserve Bench (Gegner vormerken und später an einem vorhandenen Spawnpunkt einsetzen)
 *
 * Deaktivierter Code aus V0.9.3 liegt unverändert in /legacy-disabled/.
 * Dort enthalten: Trigger-System, DM-Szeneninfos, Flowchart-Verbindungen/-Status,
 * Foundry-Szenensteuerung/-Synchronisation sowie frühere Zusatz-UI.
 */

function currentScene() {
  return canvas?.scene ?? game.scenes?.current ?? game.scenes?.active ?? null;
}

function getSceneDocuments(scene, documentName) {
  if (!scene) return [];
  try {
    return scene.getEmbeddedCollection(documentName)?.contents ?? [];
  } catch (error) {
    console.warn(`DM Cockpit | Konnte ${documentName} nicht lesen`, error);
    return [];
  }
}

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

/* ------------------------------------------------------------------------- */
/* Abenteuer-Flowchart                                                       */
/* ------------------------------------------------------------------------- */

function emptyFlow() {
  return {version: 1, nodes: [], edges: [], currentNodeId: null};
}

function normalizeFlow(value) {
  const raw = value && typeof value === "object" ? value : {};
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes.map((node, index) => ({
        // Unbekannte/alte Felder bleiben erhalten, werden im Grundkern aber nicht benutzt.
        ...node,
        id: node.id ?? makeId(),
        name: String(node.name ?? `Knoten ${index + 1}`),
        note: String(node.note ?? ""),
        x: Number.isFinite(Number(node.x)) ? Number(node.x) : 40 + (index % 3) * 270,
        y: Number.isFinite(Number(node.y)) ? Number(node.y) : 40 + Math.floor(index / 3) * 150
      }))
    : [];

  const nodeIds = new Set(nodes.map(node => node.id));

  return {
    ...raw,
    version: 1,
    nodes,
    // DEAKTIVIERT: Verbindungen gehören zu "Flowchart-Verbindungen" [OFFEN].
    // Bestehende Daten werden nur erhalten, nicht angezeigt oder bearbeitet.
    edges: Array.isArray(raw.edges) ? raw.edges : [],
    currentNodeId: nodeIds.has(raw.currentNodeId) ? raw.currentNodeId : null
  };
}

function getFlow() {
  try {
    return normalizeFlow(game.settings.get(MODULE_ID, FLOW_KEY));
  } catch (error) {
    console.warn("DM Cockpit | Abenteuer-Flow konnte nicht gelesen werden", error);
    return emptyFlow();
  }
}

async function writeFlow(flow) {
  if (!game.user?.isGM) return;
  await game.settings.set(MODULE_ID, FLOW_KEY, normalizeFlow(flow));
}

function nextNodePosition(flow) {
  const index = flow.nodes.length;
  return {
    x: 50 + (index % 3) * 270,
    y: 50 + Math.floor(index / 3) * 150
  };
}

function buildFlowView() {
  const flow = getFlow();
  const nodes = flow.nodes.map(node => ({
    ...node,
    isCurrent: node.id === flow.currentNodeId,
    style: `left:${Math.max(0, node.x)}px;top:${Math.max(0, node.y)}px;`
  }));
  const current = nodes.find(node => node.isCurrent) ?? null;

  return {
    flowNodes: nodes,
    flowNodeCount: nodes.length,
    hasFlowNodes: nodes.length > 0,
    currentFlowNode: current,
    hasCurrentFlowNode: Boolean(current)
  };
}

function attachFlowDragging(root) {
  const board = root.querySelector(".dm-flow-board");
  if (!board) return;

  for (const nodeEl of board.querySelectorAll('.dm-flow-node[data-draggable="true"]')) {
    nodeEl.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest("button")) return;
      event.preventDefault();

      const nodeId = nodeEl.dataset.nodeId;
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = nodeEl.offsetLeft;
      const originY = nodeEl.offsetTop;
      let moved = false;

      nodeEl.classList.add("dragging");
      nodeEl.setPointerCapture?.(event.pointerId);

      const onMove = moveEvent => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        nodeEl.style.left = `${Math.max(0, originX + dx)}px`;
        nodeEl.style.top = `${Math.max(0, originY + dy)}px`;
      };

      const onUp = async upEvent => {
        nodeEl.removeEventListener("pointermove", onMove);
        nodeEl.removeEventListener("pointerup", onUp);
        nodeEl.removeEventListener("pointercancel", onUp);
        nodeEl.classList.remove("dragging");
        try { nodeEl.releasePointerCapture?.(upEvent.pointerId); } catch (_) {}
        if (!moved) return;

        const flow = getFlow();
        const node = flow.nodes.find(item => item.id === nodeId);
        if (!node) return;
        node.x = Math.round(nodeEl.offsetLeft);
        node.y = Math.round(nodeEl.offsetTop);
        await writeFlow(flow);
      };

      nodeEl.addEventListener("pointermove", onMove);
      nodeEl.addEventListener("pointerup", onUp);
      nodeEl.addEventListener("pointercancel", onUp);
    });
  }
}

/* ------------------------------------------------------------------------- */
/* Spontane Szenen                                                           */
/* ------------------------------------------------------------------------- */

function emptySpontaneousStore() {
  return {version: 1, items: []};
}

function normalizeSpontaneousStore(value) {
  const raw = value && typeof value === "object" ? value : {};
  const items = Array.isArray(raw.items)
    ? raw.items.map(item => ({
        id: item.id ?? makeId(),
        name: String(item.name ?? "Spontane Szene"),
        note: String(item.note ?? ""),
        createdAt: item.createdAt ?? null
      }))
    : [];
  return {version: 1, items};
}

function getSpontaneousStore() {
  try {
    return normalizeSpontaneousStore(game.settings.get(MODULE_ID, SPONTANEOUS_KEY));
  } catch (error) {
    console.warn("DM Cockpit | Spontane Szenen konnten nicht gelesen werden", error);
    return emptySpontaneousStore();
  }
}

async function writeSpontaneousStore(store) {
  if (!game.user?.isGM) return;
  await game.settings.set(MODULE_ID, SPONTANEOUS_KEY, normalizeSpontaneousStore(store));
}

function buildSpontaneousView() {
  const store = getSpontaneousStore();
  return {
    spontaneousScenes: store.items,
    spontaneousCount: store.items.length,
    hasSpontaneousScenes: store.items.length > 0
  };
}

/* ------------------------------------------------------------------------- */
/* Gegner-Spawnpunkte                                                        */
/* ------------------------------------------------------------------------- */

function normalizeSpawnPoints(value) {
  const raw = Array.isArray(value) ? value : [];
  return raw.map((point, index) => ({
    id: point?.id ?? makeId(),
    name: String(point?.name ?? `Spawnpunkt ${index + 1}`),
    x: Number.isFinite(Number(point?.x)) ? Math.round(Number(point.x)) : 0,
    y: Number.isFinite(Number(point?.y)) ? Math.round(Number(point.y)) : 0
  }));
}

function getSpawnPoints(scene) {
  if (!scene) return [];
  try {
    return normalizeSpawnPoints(scene.getFlag(MODULE_ID, SPAWN_POINTS_KEY));
  } catch (error) {
    console.warn("DM Cockpit | Spawnpunkte konnten nicht gelesen werden", error);
    return [];
  }
}

async function writeSpawnPoints(scene, points) {
  if (!scene || !game.user?.isGM) return;
  await scene.setFlag(MODULE_ID, SPAWN_POINTS_KEY, normalizeSpawnPoints(points));
}

function buildSpawnPointView(scene) {
  const points = getSpawnPoints(scene);
  return {
    spawnPoints: points,
    spawnPointCount: points.length,
    hasSpawnPoints: points.length > 0
  };
}

function spawnSelectionValue(type, ...parts) {
  return [type, ...parts.map(part => encodeURIComponent(String(part ?? "")))].join("|");
}

function parseSpawnSelection(value) {
  const [type, ...parts] = String(value ?? "").split("|");
  return {type, parts: parts.map(part => decodeURIComponent(part))};
}

async function spawnActorOptions(scene) {
  const groups = [];

  // 1. Bereits platzierte Tokens auf der aktuellen Szene.
  const tokens = [...(scene?.tokens?.contents ?? [])]
    .filter(token => token?.actor)
    .sort((a, b) => String(a.name ?? a.actor?.name ?? "").localeCompare(String(b.name ?? b.actor?.name ?? "")));
  if (tokens.length) {
    const options = tokens.map(token => {
      const name = token.name ?? token.actor?.name ?? "Unbenannter Token";
      return `<option value="${escapeHtml(spawnSelectionValue("token", token.id))}">${escapeHtml(name)}</option>`;
    }).join("");
    groups.push(`<optgroup label="1 · Auf dem Spielfeld">${options}</optgroup>`);
  }

  // 2. Welt-Akteure aus der Foundry-Akteursliste.
  const actors = [...(game.actors?.contents ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  if (actors.length) {
    const options = actors.map(actor =>
      `<option value="${escapeHtml(spawnSelectionValue("world", actor.id))}">${escapeHtml(actor.name)}</option>`
    ).join("");
    groups.push(`<optgroup label="2 · Akteursliste">${options}</optgroup>`);
  }

  // 3. Alle sichtbaren Actor-Kompendien in EINER klaren Quellengruppe.
  // Der Packname bleibt hinter dem Gegnernamen sichtbar, damit die Herkunft eindeutig ist.
  const compendiumOptions = [];
  const packs = [...(game.packs?.values?.() ?? [])]
    .filter(pack => pack?.documentName === "Actor" && pack.visible !== false)
    .sort((a, b) => String(a.title ?? a.collection).localeCompare(String(b.title ?? b.collection)));

  for (const pack of packs) {
    try {
      const index = await pack.getIndex({fields: ["name", "type"]});
      const entries = [...(index?.values?.() ?? [])]
        .filter(entry => entry?._id && entry?.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

      for (const entry of entries) {
        const packTitle = String(pack.title ?? pack.collection);
        compendiumOptions.push(
          `<option value="${escapeHtml(spawnSelectionValue("compendium", pack.collection, entry._id))}">${escapeHtml(entry.name)} — ${escapeHtml(packTitle)}</option>`
        );
      }
    } catch (error) {
      console.warn(`DM Cockpit | Kompendium ${pack.collection} konnte nicht gelesen werden`, error);
    }
  }

  if (compendiumOptions.length) {
    groups.push(`<optgroup label="3 · Kompendien">${compendiumOptions.join("")}</optgroup>`);
  }

  return groups.join("");
}

function clearPendingSpawnPlacement() {
  if (!pendingSpawnPlacement) return;
  try { canvas?.stage?.off?.("pointerdown", pendingSpawnPlacement.handler); } catch (_) {}
  pendingSpawnPlacement = null;
}

async function beginSpawnPointPlacement(app, data) {
  const scene = canvas?.scene;
  if (!scene) return ui.notifications?.warn("DM Cockpit: Öffne zuerst eine Szene auf der Leinwand.");

  clearPendingSpawnPlacement();

  const handler = async event => {
    const button = event?.button ?? event?.nativeEvent?.button ?? 0;
    if (button !== 0) return;
    if (!pendingSpawnPlacement) return;

    clearPendingSpawnPlacement();

    try {
      const globalPoint = event?.global;
      if (!globalPoint || !canvas?.stage?.toLocal) throw new Error("Keine Canvas-Koordinaten verfügbar");
      const local = canvas.stage.toLocal(globalPoint);
      const snapped = canvas.tokens?.getSnappedPoint?.({x: local.x, y: local.y}) ?? local;
      const targetScene = game.scenes?.get(data.sceneId);
      if (!targetScene || canvas.scene?.id !== targetScene.id) {
        return ui.notifications?.warn("DM Cockpit: Die Szene wurde während des Setzens gewechselt.");
      }

      const points = getSpawnPoints(targetScene);
      points.push({
        id: makeId(),
        name: data.name,
        x: Math.round(snapped.x),
        y: Math.round(snapped.y)
      });
      await writeSpawnPoints(targetScene, points);
      ui.notifications?.info(`DM Cockpit: Spawnpunkt „${data.name}“ gespeichert.`);
      await app?.render?.({force: true});
    } catch (error) {
      console.error("DM Cockpit | Spawnpunkt konnte nicht gesetzt werden", error);
      ui.notifications?.error("DM Cockpit: Spawnpunkt konnte nicht gesetzt werden.");
    }
  };

  pendingSpawnPlacement = {handler};
  canvas.stage.on("pointerdown", handler);
  ui.notifications?.info("DM Cockpit: Klicke jetzt auf die gewünschte Position der Karte.");
}

async function resolveSpawnSource(scene, selectionValue) {
  const selection = parseSpawnSelection(selectionValue);

  if (selection.type === "token") {
    const token = scene?.tokens?.get(selection.parts[0]);
    if (!token?.actor) return null;
    const tokenData = foundry.utils.deepClone(token.toObject());
    delete tokenData._id;
    return {name: token.name ?? token.actor.name, tokenData};
  }

  if (selection.type === "world") {
    const actor = game.actors?.get(selection.parts[0]);
    return actor ? {name: actor.name, actor} : null;
  }

  if (selection.type === "compendium") {
    const [collection, entryId] = selection.parts;
    const pack = game.packs?.get(collection);
    if (!pack || pack.documentName !== "Actor") return null;

    const sourceUuid = pack.getUuid(entryId);
    let actor = game.actors?.contents?.find(candidate =>
      candidate.getFlag?.(MODULE_ID, SPAWN_COMPENDIUM_SOURCE_FLAG) === sourceUuid
    );

    if (!actor) {
      actor = await game.actors?.importFromCompendium?.(pack, entryId);
      if (!actor) return null;
      await actor.setFlag(MODULE_ID, SPAWN_COMPENDIUM_SOURCE_FLAG, sourceUuid);
    }

    return {name: actor.name, actor};
  }

  return null;
}

async function spawnEnemyAtPoint(scene, point, selectionValue) {
  if (!scene || !point || !game.user?.isGM) return;

  try {
    const source = await resolveSpawnSource(scene, selectionValue);
    if (!source) return ui.notifications?.warn("DM Cockpit: Der ausgewählte Gegner ist nicht mehr verfügbar.");

    let tokenData;
    if (source.tokenData) {
      tokenData = foundry.utils.deepClone(source.tokenData);
      tokenData.x = point.x;
      tokenData.y = point.y;
    } else {
      const tokenDocument = await source.actor.getTokenDocument({x: point.x, y: point.y});
      tokenData = tokenDocument.toObject();
      delete tokenData._id;
    }

    await scene.createEmbeddedDocuments("Token", [tokenData]);
    ui.notifications?.info(`DM Cockpit: ${source.name} bei „${point.name}“ gespawnt.`);
  } catch (error) {
    console.error("DM Cockpit | Gegner konnte nicht gespawnt werden", error);
    ui.notifications?.error("DM Cockpit: Gegner konnte nicht gespawnt werden.");
  }
}

/* ------------------------------------------------------------------------- */
/* Enemy Reserve Bench                                                       */
/* ------------------------------------------------------------------------- */

function normalizeReserveBench(value) {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .filter(item => item && item.source)
    .map(item => ({
      id: item.id ?? makeId(),
      name: String(item.name ?? "Unbenannter Gegner"),
      source: String(item.source ?? ""),
      sourceLabel: String(item.sourceLabel ?? "Quelle"),
      addedAt: item.addedAt ?? null
    }));
}

function getReserveBench(scene) {
  if (!scene) return [];
  try {
    return normalizeReserveBench(scene.getFlag(MODULE_ID, RESERVE_BENCH_KEY));
  } catch (error) {
    console.warn("DM Cockpit | Enemy Reserve Bench konnte nicht gelesen werden", error);
    return [];
  }
}

async function writeReserveBench(scene, items) {
  if (!scene || !game.user?.isGM) return;
  await scene.setFlag(MODULE_ID, RESERVE_BENCH_KEY, normalizeReserveBench(items));
}

function buildReserveBenchView(scene) {
  const items = getReserveBench(scene);
  return {
    reserveEnemies: items,
    reserveEnemyCount: items.length,
    hasReserveEnemies: items.length > 0
  };
}

async function spawnSourceMetadata(scene, selectionValue) {
  const selection = parseSpawnSelection(selectionValue);

  if (selection.type === "token") {
    const token = scene?.tokens?.get(selection.parts[0]);
    if (!token?.actor) return null;
    return {
      name: token.name ?? token.actor.name ?? "Unbenannter Token",
      sourceLabel: "Spielfeld"
    };
  }

  if (selection.type === "world") {
    const actor = game.actors?.get(selection.parts[0]);
    return actor ? {name: actor.name, sourceLabel: "Akteursliste"} : null;
  }

  if (selection.type === "compendium") {
    const [collection, entryId] = selection.parts;
    const pack = game.packs?.get(collection);
    if (!pack || pack.documentName !== "Actor") return null;
    try {
      const index = await pack.getIndex({fields: ["name"]});
      const entry = index?.get?.(entryId) ?? [...(index?.values?.() ?? [])].find(item => item?._id === entryId);
      if (!entry?.name) return null;
      return {
        name: String(entry.name),
        sourceLabel: `Kompendium · ${String(pack.title ?? pack.collection)}`
      };
    } catch (error) {
      console.warn(`DM Cockpit | Reserve-Quelle ${collection} konnte nicht gelesen werden`, error);
      return null;
    }
  }

  return null;
}

function spawnPointOptions(scene) {
  return getSpawnPoints(scene)
    .map(point => `<option value="${escapeHtml(point.id)}">${escapeHtml(point.name)} — ${point.x}, ${point.y}</option>`)
    .join("");
}

/* ------------------------------------------------------------------------- */
/* Szenen-Presets                                                            */
/* ------------------------------------------------------------------------- */

function allPlaylistSounds() {
  const rows = [];
  for (const playlist of game.playlists?.contents ?? []) {
    for (const sound of playlist.sounds?.contents ?? []) rows.push({playlist, sound});
  }
  return rows;
}

function getPlayingAudio() {
  return allPlaylistSounds()
    .filter(({sound}) => Boolean(sound.playing))
    .map(({playlist, sound}) => ({
      playlistId: playlist.id,
      playlistName: playlist.name,
      soundId: sound.id,
      soundName: sound.name
    }));
}

function getPresets(scene) {
  if (!scene) return [];

  const stored = scene.getFlag(MODULE_ID, PRESETS_KEY);
  if (Array.isArray(stored)) {
    return stored.map(preset => ({
      id: preset.id ?? makeId(),
      name: preset.name ?? "Unbenannt",
      savedAt: preset.savedAt ?? null,
      tokens: Array.isArray(preset.tokens) ? preset.tokens : [],
      doors: Array.isArray(preset.doors) ? preset.doors : [],
      lights: Array.isArray(preset.lights) ? preset.lights : [],
      audio: Array.isArray(preset.audio) ? preset.audio : null
    }));
  }

  // Kompatibilität mit alten Presets. Audio wird bei V0.4-Daten nicht verändert.
  const legacy = scene.getFlag(MODULE_ID, LEGACY_PRESET_KEY);
  if (legacy) {
    return [{
      id: "legacy-v04",
      name: "Preset aus V0.4",
      savedAt: legacy.savedAt ?? null,
      tokens: Array.isArray(legacy.tokens) ? legacy.tokens : [],
      doors: Array.isArray(legacy.doors) ? legacy.doors : [],
      lights: Array.isArray(legacy.lights) ? legacy.lights : [],
      audio: null
    }];
  }

  return [];
}

async function writePresets(scene, presets) {
  await scene.setFlag(MODULE_ID, PRESETS_KEY, presets);
  if (scene.getFlag(MODULE_ID, LEGACY_PRESET_KEY) !== undefined) {
    await scene.unsetFlag(MODULE_ID, LEGACY_PRESET_KEY);
  }
}

function capturePreset(scene, name, id = makeId()) {
  const tokens = getSceneDocuments(scene, "Token");
  const doors = getSceneDocuments(scene, "Wall").filter(wall => wall.isDoor);
  const lights = getSceneDocuments(scene, "AmbientLight");

  return {
    id,
    name,
    savedAt: new Date().toISOString(),
    tokens: tokens.map(token => ({id: token.id, hidden: Boolean(token.hidden)})),
    doors: doors.map(wall => ({id: wall.id, ds: wall.ds})),
    lights: lights.map(light => ({id: light.id, hidden: Boolean(light.hidden)})),
    audio: getPlayingAudio().map(item => ({playlistId: item.playlistId, soundId: item.soundId}))
  };
}

function audioKey(playlistId, soundId) {
  return `${playlistId}:${soundId}`;
}

function buildAudioPlan(preset) {
  if (!Array.isArray(preset?.audio)) {
    return {managed: false, starts: [], stops: [], missing: 0, total: 0};
  }

  const desiredKeys = new Set(preset.audio.map(item => audioKey(item.playlistId, item.soundId)));
  const currentPlaying = getPlayingAudio();
  const currentKeys = new Set(currentPlaying.map(item => audioKey(item.playlistId, item.soundId)));
  const starts = [];
  const stops = [];
  let missing = 0;

  for (const desired of preset.audio) {
    const playlist = game.playlists?.get(desired.playlistId);
    const sound = playlist?.sounds?.get(desired.soundId);
    if (!playlist || !sound) {
      missing += 1;
      continue;
    }
    if (!currentKeys.has(audioKey(desired.playlistId, desired.soundId))) starts.push({playlist, sound});
  }

  for (const current of currentPlaying) {
    if (desiredKeys.has(audioKey(current.playlistId, current.soundId))) continue;
    const playlist = game.playlists?.get(current.playlistId);
    const sound = playlist?.sounds?.get(current.soundId);
    if (playlist && sound) stops.push({playlist, sound});
  }

  return {managed: true, starts, stops, missing, total: starts.length + stops.length};
}

function presetChangePlan(scene, preset) {
  const tokens = scene?.getEmbeddedCollection("Token");
  const walls = scene?.getEmbeddedCollection("Wall");
  const lights = scene?.getEmbeddedCollection("AmbientLight");
  let missingSceneElements = 0;

  const tokenUpdates = (preset?.tokens ?? []).flatMap(saved => {
    const doc = tokens?.get(saved.id);
    if (!doc) { missingSceneElements += 1; return []; }
    if (Boolean(doc.hidden) === Boolean(saved.hidden)) return [];
    return [{_id: saved.id, hidden: Boolean(saved.hidden)}];
  });

  const wallUpdates = (preset?.doors ?? []).flatMap(saved => {
    const doc = walls?.get(saved.id);
    if (!doc) { missingSceneElements += 1; return []; }
    if (doc.ds === saved.ds) return [];
    return [{_id: saved.id, ds: saved.ds}];
  });

  const lightUpdates = (preset?.lights ?? []).flatMap(saved => {
    const doc = lights?.get(saved.id);
    if (!doc) { missingSceneElements += 1; return []; }
    if (Boolean(doc.hidden) === Boolean(saved.hidden)) return [];
    return [{_id: saved.id, hidden: Boolean(saved.hidden)}];
  });

  const audio = buildAudioPlan(preset);
  return {
    tokenUpdates,
    wallUpdates,
    lightUpdates,
    audio,
    missingSceneElements,
    total: tokenUpdates.length + wallUpdates.length + lightUpdates.length + audio.total
  };
}

function presetForView(preset) {
  return {
    ...preset,
    savedAtLabel: preset.savedAt ? new Date(preset.savedAt).toLocaleString() : "unbekannt",
    tokenCount: preset.tokens?.length ?? 0,
    doorCount: preset.doors?.length ?? 0,
    lightCount: preset.lights?.length ?? 0,
    audioCount: Array.isArray(preset.audio) ? preset.audio.length : 0,
    audioManaged: Array.isArray(preset.audio)
  };
}

async function applyAudioPlan(audioPlan) {
  if (!audioPlan?.managed) return;
  for (const item of audioPlan.stops) await item.playlist.stopSound(item.sound);
  for (const item of audioPlan.starts) await item.playlist.playSound(item.sound);
}

/* ------------------------------------------------------------------------- */
/* LIVE-Dashboard                                                            */
/* ------------------------------------------------------------------------- */

function buildLiveView() {
  const scene = currentScene();
  const playingAudio = getPlayingAudio();

  if (!scene) {
    return {
      hasScene: false,
      sceneName: "Keine aktive Szene",
      tokenCount: 0,
      visibleTokenCount: 0,
      hiddenTokenCount: 0,
      doorCount: 0,
      openDoorCount: 0,
      closedDoorCount: 0,
      lightCount: 0,
      playingAudioCount: playingAudio.length,
      playingAudio,
      hasPlayingAudio: playingAudio.length > 0,
      presets: [],
      presetCount: 0,
      hasPresets: false,
      spawnPoints: [],
      spawnPointCount: 0,
      hasSpawnPoints: false,
      reserveEnemies: [],
      reserveEnemyCount: 0,
      hasReserveEnemies: false
    };
  }

  const tokens = getSceneDocuments(scene, "Token");
  const doors = getSceneDocuments(scene, "Wall").filter(wall => wall.isDoor);
  const lights = getSceneDocuments(scene, "AmbientLight");
  const presets = getPresets(scene).map(presetForView);
  const spawnPointView = buildSpawnPointView(scene);
  const reserveBenchView = buildReserveBenchView(scene);
  const hiddenTokenCount = tokens.filter(token => token.hidden).length;
  const openDoorCount = doors.filter(wall => wall.isOpen).length;

  return {
    hasScene: true,
    sceneName: scene.name,
    tokenCount: tokens.length,
    visibleTokenCount: tokens.length - hiddenTokenCount,
    hiddenTokenCount,
    doorCount: doors.length,
    openDoorCount,
    closedDoorCount: doors.length - openDoorCount,
    lightCount: lights.length,
    playingAudioCount: playingAudio.length,
    playingAudio,
    hasPlayingAudio: playingAudio.length > 0,
    presets,
    presetCount: presets.length,
    hasPresets: presets.length > 0,
    ...spawnPointView,
    ...reserveBenchView
  };
}

/* ------------------------------------------------------------------------- */
/* Application                                                               */
/* ------------------------------------------------------------------------- */

class DMCockpitApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #activeTab = "live";

  static DEFAULT_OPTIONS = {
    id: "dm-cockpit",
    classes: ["dm-cockpit"],
    tag: "section",
    window: {
      title: "DM Cockpit",
      icon: "fa-solid fa-gauge-high",
      resizable: true
    },
    position: {width: 920, height: 720}
  };

  static PARTS = {
    main: {template: "modules/dm-cockpit/templates/cockpit.hbs"}
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      ...buildLiveView(),
      ...buildFlowView(),
      ...buildSpontaneousView(),
      activeTab: this.#activeTab,
      isLiveTab: this.#activeTab === "live",
      isAdventureTab: this.#activeTab === "adventure"
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;

    root.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        this.#activeTab = button.dataset.tab;
        this.render({force: true});
      });
    });

    root.querySelector('[data-action="create-spontaneous"]')?.addEventListener("click", async () => {
      const result = await DialogV2.input({
        window: {title: "Spontane Szene"},
        content: `
          <div class="form-group"><label>Name</label><div class="form-fields"><input name="name" type="text" autofocus></div></div>
          <div class="form-group stacked"><label>Kurze Notiz</label><textarea name="note" rows="3"></textarea></div>
        `,
        ok: {label: "Anlegen", icon: "fa-solid fa-plus"},
        modal: true,
        rejectClose: false
      });
      if (!result) return;
      const name = String(dialogValue(result, "name") ?? "").trim();
      if (!name) return ui.notifications?.warn("DM Cockpit: Bitte einen Namen eingeben.");

      const store = getSpontaneousStore();
      store.items.push({
        id: makeId(),
        name,
        note: String(dialogValue(result, "note") ?? "").trim(),
        createdAt: new Date().toISOString()
      });
      await writeSpontaneousStore(store);
      await this.render({force: true});
    });

    root.querySelectorAll('[data-action="delete-spontaneous"]').forEach(button => {
      button.addEventListener("click", async () => {
        const store = getSpontaneousStore();
        const item = store.items.find(entry => entry.id === button.dataset.id);
        if (!item) return;
        const confirmed = await DialogV2.confirm({
          window: {title: "Spontane Szene löschen?"},
          content: `<p>„<strong>${escapeHtml(item.name)}</strong>“ löschen?</p>`,
          modal: true,
          rejectClose: false
        });
        if (!confirmed) return;
        store.items = store.items.filter(entry => entry.id !== item.id);
        await writeSpontaneousStore(store);
        await this.render({force: true});
      });
    });

    root.querySelectorAll('[data-action="promote-spontaneous"]').forEach(button => {
      button.addEventListener("click", async () => {
        const store = getSpontaneousStore();
        const item = store.items.find(entry => entry.id === button.dataset.id);
        if (!item) return;
        const flow = getFlow();
        const position = nextNodePosition(flow);
        flow.nodes.push({id: makeId(), name: item.name, note: item.note, ...position});
        await writeFlow(flow);
        store.items = store.items.filter(entry => entry.id !== item.id);
        await writeSpontaneousStore(store);
        ui.notifications?.info(`DM Cockpit: „${item.name}“ in den Flowchart übernommen.`);
        await this.render({force: true});
      });
    });

    if (this.#activeTab === "adventure") {
      attachFlowDragging(root);

      root.querySelector('[data-action="create-flow-node"]')?.addEventListener("click", async () => {
        const result = await DialogV2.input({
          window: {title: "Flowchart-Knoten"},
          content: `
            <div class="form-group"><label>Name</label><div class="form-fields"><input name="name" type="text" autofocus></div></div>
            <div class="form-group stacked"><label>Kurze Notiz</label><textarea name="note" rows="3"></textarea></div>
          `,
          ok: {label: "Erstellen", icon: "fa-solid fa-plus"},
          modal: true,
          rejectClose: false
        });
        if (!result) return;
        const name = String(dialogValue(result, "name") ?? "").trim();
        if (!name) return ui.notifications?.warn("DM Cockpit: Bitte einen Namen eingeben.");

        const flow = getFlow();
        flow.nodes.push({
          id: makeId(),
          name,
          note: String(dialogValue(result, "note") ?? "").trim(),
          ...nextNodePosition(flow)
        });
        await writeFlow(flow);
        await this.render({force: true});
      });

      root.querySelectorAll('[data-action="edit-flow-node"]').forEach(button => {
        button.addEventListener("click", async () => {
          const flow = getFlow();
          const node = flow.nodes.find(item => item.id === button.dataset.id);
          if (!node) return;
          const result = await DialogV2.input({
            window: {title: "Knoten bearbeiten"},
            content: `
              <div class="form-group"><label>Name</label><div class="form-fields"><input name="name" type="text" value="${escapeHtml(node.name)}" autofocus></div></div>
              <div class="form-group stacked"><label>Kurze Notiz</label><textarea name="note" rows="3">${escapeHtml(node.note)}</textarea></div>
            `,
            ok: {label: "Speichern", icon: "fa-solid fa-floppy-disk"},
            modal: true,
            rejectClose: false
          });
          if (!result) return;
          const name = String(dialogValue(result, "name") ?? "").trim();
          if (!name) return ui.notifications?.warn("DM Cockpit: Bitte einen Namen eingeben.");
          node.name = name;
          node.note = String(dialogValue(result, "note") ?? "").trim();
          await writeFlow(flow);
          await this.render({force: true});
        });
      });

      root.querySelectorAll('[data-action="set-current-flow-node"]').forEach(button => {
        button.addEventListener("click", async () => {
          const flow = getFlow();
          if (!flow.nodes.some(node => node.id === button.dataset.id)) return;
          flow.currentNodeId = button.dataset.id;
          await writeFlow(flow);
          await this.render({force: true});
        });
      });

      root.querySelectorAll('[data-action="delete-flow-node"]').forEach(button => {
        button.addEventListener("click", async () => {
          const flow = getFlow();
          const node = flow.nodes.find(item => item.id === button.dataset.id);
          if (!node) return;
          const confirmed = await DialogV2.confirm({
            window: {title: "Knoten löschen?"},
            content: `<p>„<strong>${escapeHtml(node.name)}</strong>“ löschen?</p>`,
            modal: true,
            rejectClose: false
          });
          if (!confirmed) return;
          flow.nodes = flow.nodes.filter(item => item.id !== node.id);
          if (flow.currentNodeId === node.id) flow.currentNodeId = null;
          // Nur verwaiste Alt-Verbindungen entfernen; die Verbindungsfunktion selbst bleibt deaktiviert.
          if (Array.isArray(flow.edges)) {
            flow.edges = flow.edges.filter(edge => edge.from !== node.id && edge.to !== node.id);
          }
          await writeFlow(flow);
          await this.render({force: true});
        });
      });
    }

    root.querySelector('[data-action="create-spawn-point"]')?.addEventListener("click", async () => {
      const scene = canvas?.scene;
      if (!scene || !game.user?.isGM) return ui.notifications?.warn("DM Cockpit: Öffne zuerst eine Szene auf der Leinwand.");

      const result = await DialogV2.input({
        window: {title: "Spawnpunkt setzen"},
        content: `
          <div class="form-group"><label>Name des Spawnpunkts</label><div class="form-fields"><input name="name" type="text" placeholder="z. B. Eingangstür" autofocus></div></div>
          <p class="hint">Danach Position auf der Karte anklicken.</p>
        `,
        ok: {label: "Position wählen", icon: "fa-solid fa-location-dot"},
        modal: true,
        rejectClose: false
      });
      if (!result) return;
      const name = String(dialogValue(result, "name") ?? "").trim();
      if (!name) return ui.notifications?.warn("DM Cockpit: Bitte einen Namen eingeben.");

      await beginSpawnPointPlacement(this, {sceneId: scene.id, name});
    });

    root.querySelectorAll('[data-action="spawn-enemy"]').forEach(button => {
      button.addEventListener("click", async () => {
        const scene = currentScene();
        if (!scene || !game.user?.isGM) return;
        const point = getSpawnPoints(scene).find(item => item.id === button.dataset.id);
        if (!point) return;

        const options = await spawnActorOptions(scene);
        if (!options) return ui.notifications?.warn("DM Cockpit: Keine verfügbaren Gegner in Spielfeld, Akteursliste oder Kompendien gefunden.");

        const result = await DialogV2.input({
          window: {title: `Gegner bei ${point.name} spawnen`},
          content: `
            <div class="form-group"><label>Gegner auswählen</label><div class="form-fields"><select name="actorSource">${options}</select></div></div>
          `,
          ok: {label: "Gegner spawnen", icon: "fa-solid fa-user-plus"},
          modal: true,
          rejectClose: false
        });
        if (!result) return;
        const actorSource = String(dialogValue(result, "actorSource") ?? "").trim();
        if (!actorSource) return ui.notifications?.warn("DM Cockpit: Bitte einen Gegner auswählen.");

        await spawnEnemyAtPoint(scene, point, actorSource);
        await this.render({force: true});
      });
    });

    root.querySelectorAll('[data-action="delete-spawn-point"]').forEach(button => {
      button.addEventListener("click", async () => {
        const scene = currentScene();
        if (!scene || !game.user?.isGM) return;
        const points = getSpawnPoints(scene);
        const point = points.find(item => item.id === button.dataset.id);
        if (!point) return;
        const confirmed = await DialogV2.confirm({
          window: {title: "Spawnpunkt löschen?"},
          content: `<p>„<strong>${escapeHtml(point.name)}</strong>“ löschen?</p>`,
          modal: true,
          rejectClose: false
        });
        if (!confirmed) return;
        await writeSpawnPoints(scene, points.filter(item => item.id !== point.id));
        await this.render({force: true});
      });
    });

    root.querySelector('[data-action="add-reserve-enemy"]')?.addEventListener("click", async () => {
      const scene = currentScene();
      if (!scene || !game.user?.isGM) return ui.notifications?.warn("DM Cockpit: Öffne zuerst eine Szene.");

      const options = await spawnActorOptions(scene);
      if (!options) return ui.notifications?.warn("DM Cockpit: Keine verfügbaren Gegner gefunden.");

      const result = await DialogV2.input({
        window: {title: "Gegner auf Reserve legen"},
        content: `
          <div class="form-group"><label>Gegner auswählen</label><div class="form-fields"><select name="actorSource">${options}</select></div></div>
        `,
        ok: {label: "Auf Reserve", icon: "fa-solid fa-box-archive"},
        modal: true,
        rejectClose: false
      });
      if (!result) return;

      const actorSource = String(dialogValue(result, "actorSource") ?? "").trim();
      if (!actorSource) return ui.notifications?.warn("DM Cockpit: Bitte einen Gegner auswählen.");

      const metadata = await spawnSourceMetadata(scene, actorSource);
      if (!metadata) return ui.notifications?.warn("DM Cockpit: Der ausgewählte Gegner ist nicht mehr verfügbar.");

      const bench = getReserveBench(scene);
      bench.push({
        id: makeId(),
        name: metadata.name,
        source: actorSource,
        sourceLabel: metadata.sourceLabel,
        addedAt: new Date().toISOString()
      });
      await writeReserveBench(scene, bench);
      ui.notifications?.info(`DM Cockpit: ${metadata.name} auf Reserve gelegt.`);
      await this.render({force: true});
    });

    root.querySelectorAll('[data-action="spawn-reserve-enemy"]').forEach(button => {
      button.addEventListener("click", async () => {
        const scene = currentScene();
        if (!scene || !game.user?.isGM) return;
        const enemy = getReserveBench(scene).find(item => item.id === button.dataset.id);
        if (!enemy) return;

        const options = spawnPointOptions(scene);
        if (!options) return ui.notifications?.warn("DM Cockpit: Lege zuerst mindestens einen Spawnpunkt an.");

        const result = await DialogV2.input({
          window: {title: `${escapeHtml(enemy.name)} einsetzen`},
          content: `
            <div class="form-group"><label>Spawnpunkt</label><div class="form-fields"><select name="spawnPointId">${options}</select></div></div>
          `,
          ok: {label: "Spawnen", icon: "fa-solid fa-user-plus"},
          modal: true,
          rejectClose: false
        });
        if (!result) return;

        const pointId = String(dialogValue(result, "spawnPointId") ?? "").trim();
        const point = getSpawnPoints(scene).find(item => item.id === pointId);
        if (!point) return ui.notifications?.warn("DM Cockpit: Der Spawnpunkt ist nicht mehr verfügbar.");

        await spawnEnemyAtPoint(scene, point, enemy.source);
        await this.render({force: true});
      });
    });

    root.querySelectorAll('[data-action="delete-reserve-enemy"]').forEach(button => {
      button.addEventListener("click", async () => {
        const scene = currentScene();
        if (!scene || !game.user?.isGM) return;
        const bench = getReserveBench(scene);
        const enemy = bench.find(item => item.id === button.dataset.id);
        if (!enemy) return;

        const confirmed = await DialogV2.confirm({
          window: {title: "Reserve-Eintrag entfernen?"},
          content: `<p>„<strong>${escapeHtml(enemy.name)}</strong>“ von der Reserve entfernen?</p>`,
          modal: true,
          rejectClose: false
        });
        if (!confirmed) return;

        await writeReserveBench(scene, bench.filter(item => item.id !== enemy.id));
        await this.render({force: true});
      });
    });

    root.querySelector('[data-action="create-preset"]')?.addEventListener("click", async () => {
      const scene = currentScene();
      if (!scene || !game.user?.isGM) return;
      const result = await DialogV2.input({
        window: {title: "Neues Szenen-Preset"},
        content: `<div class="form-group"><label>Preset-Name</label><div class="form-fields"><input type="text" name="name" autofocus></div></div>`,
        ok: {label: "Preset speichern", icon: "fa-solid fa-floppy-disk"},
        modal: true,
        rejectClose: false
      });
      if (!result) return;
      const name = String(dialogValue(result, "name") ?? "").trim();
      if (!name) return ui.notifications?.warn("DM Cockpit: Bitte einen Namen eingeben.");
      const presets = getPresets(scene);
      if (presets.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        return ui.notifications?.warn(`DM Cockpit: „${name}“ existiert bereits.`);
      }
      presets.push(capturePreset(scene, name));
      await writePresets(scene, presets);
      await this.render({force: true});
    });

    root.querySelectorAll('[data-action="apply-preset"]').forEach(button => {
      button.addEventListener("click", async () => {
        const scene = currentScene();
        if (!scene || !game.user?.isGM) return;
        const preset = getPresets(scene).find(item => item.id === button.dataset.id);
        if (!preset) return;
        const plan = presetChangePlan(scene, preset);
        if (!plan.total) return ui.notifications?.info(`DM Cockpit: „${preset.name}“ ist bereits aktiv.`);

        const confirmed = await DialogV2.confirm({
          window: {title: `Preset „${escapeHtml(preset.name)}“ anwenden?`},
          content: `<p>${plan.total} Änderungen anwenden?</p><p>Token: ${plan.tokenUpdates.length} · Türen: ${plan.wallUpdates.length} · Licht: ${plan.lightUpdates.length} · Audio: ${plan.audio.total}</p>`,
          modal: true,
          rejectClose: false
        });
        if (!confirmed) return;

        try {
          if (plan.tokenUpdates.length) await scene.updateEmbeddedDocuments("Token", plan.tokenUpdates);
          if (plan.wallUpdates.length) await scene.updateEmbeddedDocuments("Wall", plan.wallUpdates);
          if (plan.lightUpdates.length) await scene.updateEmbeddedDocuments("AmbientLight", plan.lightUpdates);
          await applyAudioPlan(plan.audio);
          ui.notifications?.info(`DM Cockpit: „${preset.name}“ angewendet.`);
          await this.render({force: true});
        } catch (error) {
          console.error("DM Cockpit | Preset konnte nicht angewendet werden", error);
          ui.notifications?.error("DM Cockpit: Preset konnte nicht vollständig angewendet werden.");
        }
      });
    });

    root.querySelectorAll('[data-action="overwrite-preset"]').forEach(button => {
      button.addEventListener("click", async () => {
        const scene = currentScene();
        if (!scene || !game.user?.isGM) return;
        const presets = getPresets(scene);
        const index = presets.findIndex(item => item.id === button.dataset.id);
        if (index < 0) return;
        const preset = presets[index];
        const confirmed = await DialogV2.confirm({
          window: {title: "Preset aktualisieren?"},
          content: `<p>„<strong>${escapeHtml(preset.name)}</strong>“ mit dem aktuellen Zustand überschreiben?</p>`,
          modal: true,
          rejectClose: false
        });
        if (!confirmed) return;
        presets[index] = capturePreset(scene, preset.name, preset.id);
        await writePresets(scene, presets);
        await this.render({force: true});
      });
    });

    root.querySelectorAll('[data-action="delete-preset"]').forEach(button => {
      button.addEventListener("click", async () => {
        const scene = currentScene();
        if (!scene || !game.user?.isGM) return;
        const presets = getPresets(scene);
        const preset = presets.find(item => item.id === button.dataset.id);
        if (!preset) return;
        const confirmed = await DialogV2.confirm({
          window: {title: "Preset löschen?"},
          content: `<p>„<strong>${escapeHtml(preset.name)}</strong>“ löschen?</p>`,
          modal: true,
          rejectClose: false
        });
        if (!confirmed) return;
        await writePresets(scene, presets.filter(item => item.id !== preset.id));
        await this.render({force: true});
      });
    });
  }

  async close(options = {}) {
    clearPendingSpawnPlacement();
    if (dmCockpitApp === this) dmCockpitApp = null;
    return super.close(options);
  }
}

function openDMCockpit() {
  const existing = foundry.applications.instances.get("dm-cockpit");
  if (existing) {
    dmCockpitApp = existing;
    existing.bringToFront?.();
    return existing;
  }
  dmCockpitApp = new DMCockpitApp();
  dmCockpitApp.render({force: true});
  return dmCockpitApp;
}

function toggleDMCockpit() {
  const existing = foundry.applications.instances.get("dm-cockpit");
  if (existing) return existing.close();
  return openDMCockpit();
}

function refreshDMCockpit(document) {
  const existing = foundry.applications.instances.get("dm-cockpit") ?? dmCockpitApp;
  if (!existing) return;
  if (document?.documentName === "Scene" && currentScene() && document.id !== currentScene().id) return;
  dmCockpitApp = existing;
  existing.render({force: true});
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, FLOW_KEY, {
    name: "DM Cockpit Abenteuer-Flow",
    scope: "world",
    config: false,
    type: Object,
    default: emptyFlow(),
    onChange: () => refreshDMCockpit()
  });

  game.settings.register(MODULE_ID, SPONTANEOUS_KEY, {
    name: "DM Cockpit Spontane Szenen",
    scope: "world",
    config: false,
    type: Object,
    default: emptySpontaneousStore(),
    onChange: () => refreshDMCockpit()
  });

  console.log("DM Cockpit | V0.9.9 Enemy Reserve Bench initialisiert");
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM || !controls.tokens?.tools) return;
  controls.tokens.tools["dm-cockpit"] = {
    name: "dm-cockpit",
    title: "DM Cockpit öffnen/schließen",
    icon: "fa-solid fa-gauge-high",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: true,
    onChange: toggleDMCockpit
  };
});

for (const hook of [
  "canvasReady",
  "updateScene",
  "createToken", "updateToken", "deleteToken",
  "createWall", "updateWall", "deleteWall",
  "createAmbientLight", "updateAmbientLight", "deleteAmbientLight",
  "updatePlaylist", "updatePlaylistSound",
  "createActor", "updateActor", "deleteActor"
]) Hooks.on(hook, refreshDMCockpit);

Hooks.on("canvasTearDown", clearPendingSpawnPlacement);

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      open: openDMCockpit,
      toggle: toggleDMCockpit,
      refresh: refreshDMCockpit,
      getFlow,
      setFlow: writeFlow,
      getSpontaneousScenes: () => getSpontaneousStore().items,
      getSpawnPoints: scene => getSpawnPoints(scene ?? currentScene()),
      getReserveBench: scene => getReserveBench(scene ?? currentScene()),
      getPresets: scene => getPresets(scene ?? currentScene())
    };
  }
  console.log("DM Cockpit | V0.9.9 Enemy Reserve Bench bereit");
});
