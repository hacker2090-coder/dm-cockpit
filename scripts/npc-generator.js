const DM_COCKPIT_NPC_VERSION = "V0.9.18";
const DM_COCKPIT_NPC_KEY = "npcQuickGeneratorLast";
const DM_COCKPIT_NPC_MEMORY_SELECTED_KEY = "npcMemorySelectedActorId";

const DM_NPC_DATA = {
  first: ["Aren", "Brenna", "Cael", "Dara", "Edrin", "Fenna", "Garrik", "Hela", "Iven", "Jora", "Kael", "Liora", "Marek", "Nessa", "Orin", "Pera", "Rovan", "Sela", "Tarin", "Veyra"],
  last: ["Aschenfeld", "Dorn", "Falkenried", "Grauwald", "Heller", "Kessel", "Morgen", "Nachtquell", "Rabenau", "Stein", "Talbruck", "Winter"],
  role: ["Wirt/in", "Händler/in", "Stadtwache", "Heiler/in", "Schreiber/in", "Bote/Botin", "Schmied/in", "Jäger/in", "Priester/in", "Söldner/in", "Gelehrte/r", "Reisende/r"],
  appearance: ["makellos gepflegte Kleidung", "Ruß an Händen und Ärmeln", "übermüdet und angespannt", "auffälliger abgenutzter Schmuck", "alte Narbe über einer Augenbraue", "zu viele Taschen und Beutel", "sichtbares religiöses Symbol", "bewegt sich überraschend leise"],
  personality: ["freundlich, aber neugierig", "trocken und sachlich", "misstrauisch gegenüber Fremden", "redet sehr schnell", "ruhig und schwer aus der Fassung zu bringen", "übertrieben höflich", "sarkastisch, aber hilfsbereit", "nervös und aufmerksam"],
  motivation: ["Geld für einen Neuanfang sammeln", "eine nahestehende Person schützen", "gesellschaftliche Anerkennung gewinnen", "einen alten Fehler wiedergutmachen", "aus der Stadt verschwinden", "eine einflussreiche Person beeindrucken", "eine Schuld abbezahlen", "endlich ernst genommen werden"],
  quirk: ["zählt unbewusst Münzen oder Schritte", "beendet Sätze häufig mit einer Gegenfrage", "ordnet Dinge während Gesprächen neu", "flüstert wichtige Aussagen", "merkt sich jedes Gesicht, aber kaum Namen", "entschuldigt sich ständig", "prüft wiederholt Türen und Fenster", "notiert sich Kleinigkeiten sofort"],
  secret: ["arbeitet heimlich für eine lokale Fraktion", "kennt einen verborgenen Zugang in der Nähe", "hat bei einem früheren Vorfall gelogen", "wurde für Schweigen bezahlt", "kennt die wahre Identität einer wichtigen Person", "hat eine Nachricht abgefangen", "plant, den Ort noch heute zu verlassen", "kennt einen belastenden Zusammenhang, aber keine Beweise"]
};

function dmNpcEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function dmNpcPick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function dmNpcGenerate() {
  return {
    name: `${dmNpcPick(DM_NPC_DATA.first)} ${dmNpcPick(DM_NPC_DATA.last)}`,
    role: dmNpcPick(DM_NPC_DATA.role),
    appearance: dmNpcPick(DM_NPC_DATA.appearance),
    personality: dmNpcPick(DM_NPC_DATA.personality),
    motivation: dmNpcPick(DM_NPC_DATA.motivation),
    quirk: dmNpcPick(DM_NPC_DATA.quirk),
    secret: dmNpcPick(DM_NPC_DATA.secret)
  };
}

function dmNpcNormalize(value) {
  const fields = ["name", "role", "appearance", "personality", "motivation", "quirk", "secret"];
  if (!value || typeof value !== "object" || !fields.every(field => typeof value[field] === "string" && value[field].trim())) return null;
  const npc = Object.fromEntries(fields.map(field => [field, value[field].trim()]));
  if (typeof value.actorId === "string" && value.actorId.trim()) npc.actorId = value.actorId.trim();
  return npc;
}

function dmNpcGet() {
  try {
    return dmNpcNormalize(game.settings.get("dm-cockpit", DM_COCKPIT_NPC_KEY));
  } catch (error) {
    console.warn("DM Cockpit | Schnell-NPC konnte nicht gelesen werden", error);
    return null;
  }
}

function dmNpcCardHtml(npc) {
  if (!npc) return `<div class="dm-empty-inline"><span>Noch kein NPC erzeugt.</span></div>`;
  const rows = [
    ["Rolle", npc.role],
    ["Auftreten", npc.appearance],
    ["Persönlichkeit", npc.personality],
    ["Motivation", npc.motivation],
    ["Eigenheit", npc.quirk],
    ["Geheimnis", npc.secret]
  ];
  return `<div class="dm-list"><article class="dm-list-item"><div><strong>${dmNpcEscape(npc.name)}</strong><p>Sofort spielbarer NPC${npc.actorId ? " · im Actor-Tab angelegt" : ""}</p></div></article>${rows.map(([label, value]) => `<article class="dm-list-item"><div><strong>${dmNpcEscape(label)}</strong><p>${dmNpcEscape(value)}</p></div></article>`).join("")}</div>`;
}

function dmNpcActionsHtml(npc) {
  const transfer = !npc
    ? ""
    : npc.actorId && game.actors?.get(npc.actorId)
      ? `<button type="button" class="dm-button-secondary" data-dm-npc-open-actor="${dmNpcEscape(npc.actorId)}"><i class="fa-solid fa-user"></i> Actor öffnen</button>`
      : `<button type="button" class="dm-button-secondary" data-dm-npc-create-actor><i class="fa-solid fa-user-plus"></i> Als Actor anlegen</button>`;
  return `<button type="button" class="dm-button-primary" data-dm-npc-generate><i class="fa-solid fa-dice"></i> ${npc ? "Neu würfeln" : "NPC generieren"}</button>${transfer}`;
}

function dmNpcSectionHtml(npc) {
  return `<details id="dm-npc-generator" class="dm-cockpit-card dm-cockpit-wide dm-collapsible" open>
    <summary class="dm-cockpit-card-title"><div><h3>NPC-Schnellgenerator</h3><p class="card-subtitle">Sofort einen spielbaren NPC erzeugen</p></div><span class="dm-summary-chevron"><i class="fa-solid fa-chevron-down"></i></span></summary>
    <div class="dm-card-body">
      <div class="dm-section-actions" data-dm-npc-actions>${dmNpcActionsHtml(npc)}</div>
      <div data-dm-npc-output>${dmNpcCardHtml(npc)}</div>
    </div>
  </details>`;
}

function dmNpcActorType() {
  const types = [...(Actor.implementation?.TYPES ?? [])].filter(type => typeof type === "string" && type);
  return types.find(type => type === "npc")
    ?? types.find(type => type.toLocaleLowerCase().includes("npc"))
    ?? types.find(type => type === "character")
    ?? types[0]
    ?? null;
}

function dmNpcDefaultImage() {
  return Actor.implementation?.DEFAULT_ICON ?? CONST.DEFAULT_TOKEN;
}

async function dmNpcCreateActor(npc) {
  const type = dmNpcActorType();
  if (!type) {
    ui.notifications?.error("DM Cockpit: Das aktive Spielsystem stellt keinen Actor-Typ bereit.");
    return null;
  }

  const img = dmNpcDefaultImage();
  const actor = await Actor.implementation.create({
    name: npc.name,
    type,
    img,
    prototypeToken: {
      name: npc.name,
      texture: { src: img }
    },
    flags: {
      "dm-cockpit": {
        generatedByQuickNpc: true,
        quickNpc: {
          name: npc.name,
          role: npc.role,
          appearance: npc.appearance,
          personality: npc.personality,
          motivation: npc.motivation,
          quirk: npc.quirk,
          secret: npc.secret,
          createdAt: Date.now()
        }
      }
    }
  });

  if (!actor) return null;

  try {
    await game.settings.set("dm-cockpit", DM_COCKPIT_NPC_MEMORY_SELECTED_KEY, actor.id);
  } catch (_error) {
    // Die Memory-Erweiterung kann deaktiviert oder noch nicht initialisiert sein.
  }

  Hooks.callAll("dmCockpitQuickNpcActorCreated", actor);
  ui.notifications?.info(`DM Cockpit: ${actor.name} wurde im Actor-Tab angelegt.`);
  return actor;
}

function dmNpcIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmNpcInject(application, element) {
  if (!game.user?.isGM || !dmNpcIsCockpit(application)) return;
  const badge = element.querySelector?.(".dm-cockpit-badge");
  if (badge) badge.textContent = DM_COCKPIT_NPC_VERSION;
  const grid = element.querySelector?.(".dm-cockpit-grid");
  if (!grid || element.querySelector("#dm-npc-generator")) return;

  let currentNpc = dmNpcGet();
  const wrapper = document.createElement("div");
  wrapper.innerHTML = dmNpcSectionHtml(currentNpc).trim();
  const section = wrapper.firstElementChild;
  const compendium = grid.querySelector("#dm-compendium-search");
  if (compendium) compendium.after(section);
  else grid.appendChild(section);

  const renderNpc = () => {
    const actions = section.querySelector("[data-dm-npc-actions]");
    const output = section.querySelector("[data-dm-npc-output]");
    if (actions) actions.innerHTML = dmNpcActionsHtml(currentNpc);
    if (output) output.innerHTML = dmNpcCardHtml(currentNpc);
  };

  section.addEventListener("click", async event => {
    const generate = event.target.closest?.("[data-dm-npc-generate]");
    if (generate) {
      currentNpc = dmNpcGenerate();
      await game.settings.set("dm-cockpit", DM_COCKPIT_NPC_KEY, currentNpc);
      renderNpc();
      Hooks.callAll("dmCockpitQuickNpcChanged", currentNpc);
      return;
    }

    const createActor = event.target.closest?.("[data-dm-npc-create-actor]");
    if (createActor && currentNpc) {
      createActor.disabled = true;
      try {
        const actor = await dmNpcCreateActor(currentNpc);
        if (actor) {
          currentNpc = { ...currentNpc, actorId: actor.id };
          await game.settings.set("dm-cockpit", DM_COCKPIT_NPC_KEY, currentNpc);
          renderNpc();
        }
      } catch (error) {
        console.error("DM Cockpit | Schnell-NPC konnte nicht als Actor angelegt werden", error);
        ui.notifications?.error("DM Cockpit: Der NPC konnte nicht im Actor-Tab angelegt werden.");
        createActor.disabled = false;
      }
      return;
    }

    const openActor = event.target.closest?.("[data-dm-npc-open-actor]");
    if (openActor) {
      const actor = game.actors?.get(openActor.dataset.dmNpcOpenActor);
      if (!actor) return ui.notifications?.warn("DM Cockpit: Der Actor existiert nicht mehr.");
      actor.sheet?.render({ force: true });
    }
  });
}

Hooks.once("init", () => {
  game.settings.register("dm-cockpit", DM_COCKPIT_NPC_KEY, {
    name: "DM Cockpit letzter Schnell-NPC",
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
});

Hooks.on("renderApplicationV2", dmNpcInject);

console.log(`DM Cockpit | ${DM_COCKPIT_NPC_VERSION} NPC-Schnellgenerator bereit`);
