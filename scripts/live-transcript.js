const DM_COCKPIT_TRANSCRIPT_VERSION = "V0.9.19";
const DM_COCKPIT_TRANSCRIPT_WS_KEY = "discordAudioAiWebSocketUrl";
const DM_COCKPIT_TRANSCRIPT_DEFAULT_WS = "ws://127.0.0.1:43170/v1";
const DM_COCKPIT_TRANSCRIPT_PROTOCOL = "1.0";
const DM_COCKPIT_TRANSCRIPT_MAX_SEGMENTS = 120;

function dmTranscriptEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dmTranscriptId(prefix = "msg") {
  const random = foundry.utils?.randomID?.() ?? crypto.randomUUID();
  return `${prefix}_${random}`;
}

function dmTranscriptIso(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function dmTranscriptFormatTime(value) {
  try {
    return new Intl.DateTimeFormat(game.i18n?.lang ?? "de", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(value));
  } catch (_error) {
    return "";
  }
}

function dmTranscriptIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmTranscriptWsUrl() {
  try {
    return String(game.settings.get("dm-cockpit", DM_COCKPIT_TRANSCRIPT_WS_KEY) ?? "").trim()
      || DM_COCKPIT_TRANSCRIPT_DEFAULT_WS;
  } catch (_error) {
    return DM_COCKPIT_TRANSCRIPT_DEFAULT_WS;
  }
}

function dmTranscriptSelectedNpcContext() {
  try {
    const actorId = String(game.settings.get("dm-cockpit", "npcMemorySelectedActorId") ?? "").trim();
    const actor = actorId ? game.actors?.get(actorId) : null;
    if (actor) {
      return {
        source: "cockpit",
        actorId: actor.id,
        actorUuid: actor.uuid ?? null,
        actorName: actor.name ?? null,
        changedAt: dmTranscriptIso()
      };
    }
  } catch (_error) {
    // NPC Memory kann deaktiviert oder noch nicht initialisiert sein.
  }

  const token = globalThis.canvas?.tokens?.controlled?.[0] ?? null;
  const actor = token?.actor ?? null;
  if (actor) {
    return {
      source: "selected-token",
      actorId: actor.id ?? null,
      actorUuid: actor.uuid ?? null,
      actorName: actor.name ?? token.name ?? null,
      changedAt: dmTranscriptIso()
    };
  }

  return {
    source: "none",
    actorId: null,
    actorUuid: null,
    actorName: null,
    changedAt: dmTranscriptIso()
  };
}

function dmTranscriptContextFingerprint(context) {
  return [context?.source, context?.actorId, context?.actorUuid, context?.actorName]
    .map(value => String(value ?? ""))
    .join("|");
}

class DMCockpitTranscriptTransport {
  constructor() {
    this.ws = null;
    this.url = dmTranscriptWsUrl();
    this.connectionState = "disconnected";
    this.capture = {
      state: "idle",
      policy: "notice_only",
      rawAudioRetention: "until_successful_transcription",
      noticeShown: false,
      legalAuthorizationConfirmedExternally: false
    };
    this.sessionId = null;
    this.segments = [];
    this.speakers = new Map();
    this.lastError = null;
    this.lastNpcContext = dmTranscriptSelectedNpcContext();
    this.lastNpcFingerprint = dmTranscriptContextFingerprint(this.lastNpcContext);
    this.contextTimer = null;
  }

  setConnectionState(state, error = null) {
    this.connectionState = state;
    this.lastError = error ? String(error) : null;
    Hooks.callAll("dmCockpitTranscriptStateChanged", this.snapshot());
  }

  snapshot() {
    return {
      connectionState: this.connectionState,
      capture: { ...this.capture },
      sessionId: this.sessionId,
      segments: [...this.segments],
      speakers: [...this.speakers.values()],
      lastError: this.lastError,
      npcContext: { ...this.lastNpcContext },
      url: this.url
    };
  }

  makeEnvelope(type, payload, sessionId = this.sessionId) {
    return {
      v: DM_COCKPIT_TRANSCRIPT_PROTOCOL,
      type,
      id: dmTranscriptId("msg"),
      ts: dmTranscriptIso(),
      sessionId: sessionId ?? null,
      payload: payload ?? {}
    };
  }

  async setUrl(url) {
    const normalized = String(url ?? "").trim() || DM_COCKPIT_TRANSCRIPT_DEFAULT_WS;
    if (!/^wss?:\/\//i.test(normalized)) throw new Error("WebSocket-URL muss mit ws:// oder wss:// beginnen.");
    this.url = normalized;
    await game.settings.set("dm-cockpit", DM_COCKPIT_TRANSCRIPT_WS_KEY, normalized);
    Hooks.callAll("dmCockpitTranscriptStateChanged", this.snapshot());
  }

  connect(url = this.url) {
    const normalized = String(url ?? "").trim() || DM_COCKPIT_TRANSCRIPT_DEFAULT_WS;
    if (!/^wss?:\/\//i.test(normalized)) {
      ui.notifications?.warn("DM Cockpit: Ungültige WebSocket-URL.");
      return;
    }

    this.disconnect({ silent: true });
    this.url = normalized;
    this.setConnectionState("connecting");

    try {
      const ws = new WebSocket(normalized);
      this.ws = ws;

      ws.addEventListener("open", () => {
        if (this.ws !== ws) return;
        this.setConnectionState("connected");
        this.send("hello", {
          client: "dm-cockpit-foundry",
          moduleVersion: DM_COCKPIT_TRANSCRIPT_VERSION.replace(/^V/i, ""),
          protocolVersion: DM_COCKPIT_TRANSCRIPT_PROTOCOL,
          features: ["transcript.segment", "capture.status", "npc.context", "mock-ui"]
        }, null);
        this.startContextWatch();
        this.sendNpcContext({ force: true });
      });

      ws.addEventListener("message", event => {
        if (this.ws !== ws) return;
        let data;
        try {
          data = JSON.parse(String(event.data ?? ""));
        } catch (error) {
          console.warn("DM Cockpit | Ungültige WebSocket-Nachricht", error);
          this.setConnectionState("connected", "Ungültige JSON-Nachricht empfangen.");
          return;
        }
        this.ingest(data);
      });

      ws.addEventListener("error", () => {
        if (this.ws !== ws) return;
        this.lastError = "WebSocket-Verbindungsfehler.";
        Hooks.callAll("dmCockpitTranscriptStateChanged", this.snapshot());
      });

      ws.addEventListener("close", () => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.stopContextWatch();
        this.setConnectionState("disconnected");
      });
    } catch (error) {
      console.error("DM Cockpit | WebSocket konnte nicht geöffnet werden", error);
      this.ws = null;
      this.stopContextWatch();
      this.setConnectionState("error", error?.message ?? error);
    }
  }

  disconnect({ silent = false } = {}) {
    this.stopContextWatch();
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState < WebSocket.CLOSING) {
      try {
        ws.close(1000, "DM Cockpit disconnect");
      } catch (_error) {
        // Nichts weiter nötig.
      }
    }
    if (!silent) this.setConnectionState("disconnected");
  }

  send(type, payload, sessionId = this.sessionId) {
    const envelope = this.makeEnvelope(type, payload, sessionId);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(envelope));
    return true;
  }

  ingest(envelope) {
    if (!envelope || typeof envelope !== "object" || envelope.v !== DM_COCKPIT_TRANSCRIPT_PROTOCOL) {
      console.warn("DM Cockpit | Nicht unterstützte Audio/KI-Nachricht", envelope);
      return false;
    }

    const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};
    if (envelope.sessionId !== undefined && envelope.sessionId !== null) this.sessionId = String(envelope.sessionId);

    switch (envelope.type) {
      case "hello.ack":
        this.setConnectionState("connected");
        break;

      case "session.started":
        this.sessionId = String(envelope.sessionId ?? payload.sessionId ?? this.sessionId ?? "") || null;
        break;

      case "session.ended":
        this.sessionId = null;
        this.capture = { ...this.capture, state: "idle" };
        break;

      case "speaker.upserted":
        if (payload.discordUserId) this.speakers.set(String(payload.discordUserId), { ...payload });
        break;

      case "capture.status":
        this.capture = {
          ...this.capture,
          ...payload,
          state: String(payload.state ?? this.capture.state)
        };
        break;

      case "transcript.segment":
        this.addSegment(payload);
        break;

      case "error":
        this.lastError = String(payload.message ?? payload.error ?? "Companion-Service meldet einen Fehler.");
        break;

      default:
        break;
    }

    Hooks.callAll("dmCockpitTranscriptStateChanged", this.snapshot());
    return true;
  }

  addSegment(payload) {
    const text = String(payload?.text ?? "").trim();
    const segmentId = String(payload?.segmentId ?? "").trim();
    if (!text || !segmentId) return false;

    const segment = {
      segmentId,
      discordUserId: String(payload.discordUserId ?? "unknown"),
      speakerName: String(payload.speakerName ?? "Unbekannt"),
      startedAt: payload.startedAt ?? dmTranscriptIso(),
      endedAt: payload.endedAt ?? dmTranscriptIso(),
      text,
      final: payload.final !== false,
      language: payload.language ?? null,
      provider: payload.provider ?? null,
      confidence: typeof payload.confidence === "number" ? payload.confidence : null
    };

    const existing = this.segments.findIndex(entry => entry.segmentId === segment.segmentId);
    if (existing >= 0) this.segments.splice(existing, 1, segment);
    else this.segments.push(segment);

    if (this.segments.length > DM_COCKPIT_TRANSCRIPT_MAX_SEGMENTS) {
      this.segments.splice(0, this.segments.length - DM_COCKPIT_TRANSCRIPT_MAX_SEGMENTS);
    }
    return true;
  }

  clearSegments() {
    this.segments = [];
    Hooks.callAll("dmCockpitTranscriptStateChanged", this.snapshot());
  }

  currentNpcContext() {
    const context = dmTranscriptSelectedNpcContext();
    const fingerprint = dmTranscriptContextFingerprint(context);
    if (fingerprint !== this.lastNpcFingerprint) {
      this.lastNpcFingerprint = fingerprint;
      this.lastNpcContext = context;
    } else {
      this.lastNpcContext = { ...this.lastNpcContext, changedAt: context.changedAt };
    }
    return { ...this.lastNpcContext };
  }

  sendNpcContext({ force = false } = {}) {
    const context = dmTranscriptSelectedNpcContext();
    const fingerprint = dmTranscriptContextFingerprint(context);
    const changed = fingerprint !== this.lastNpcFingerprint;
    this.lastNpcContext = context;
    this.lastNpcFingerprint = fingerprint;

    if ((changed || force) && this.ws?.readyState === WebSocket.OPEN) this.send("npc.context", context);
    if (changed || force) Hooks.callAll("dmCockpitTranscriptStateChanged", this.snapshot());
    return context;
  }

  startContextWatch() {
    this.stopContextWatch();
    this.contextTimer = window.setInterval(() => this.sendNpcContext(), 1500);
  }

  stopContextWatch() {
    if (this.contextTimer) window.clearInterval(this.contextTimer);
    this.contextTimer = null;
  }

  mockCapture() {
    this.sessionId ??= `mock_${Date.now()}`;
    const next = this.capture.state === "listening" ? "idle" : "listening";
    this.ingest(this.makeEnvelope("capture.status", {
      state: next,
      policy: "notice_only",
      rawAudioRetention: "until_successful_transcription",
      noticeShown: true,
      legalAuthorizationConfirmedExternally: false
    }));
  }

  mockSegment() {
    const samples = [
      ["Mira", "Ich verspreche dem Händler, morgen mit dem Schlüssel zurückzukommen."],
      ["Jonas", "Dann nehmen wir zuerst den Nordgang und lassen die Tür hinter uns offen."],
      ["Alex", "Der Wächter weiß jetzt, dass wir nach dem verschwundenen Kurier suchen."],
      ["Sam", "Ich stecke die silberne Münze ein und merke mir das Wappen darauf."]
    ];
    const index = this.segments.length % samples.length;
    const [speakerName, text] = samples[index];
    const now = Date.now();
    const payload = {
      segmentId: dmTranscriptId("seg"),
      discordUserId: `mock-user-${index + 1}`,
      speakerName,
      startedAt: dmTranscriptIso(now - 5000),
      endedAt: dmTranscriptIso(now),
      text,
      final: true,
      language: "de",
      provider: "mock",
      confidence: 0.96
    };
    this.ingest(this.makeEnvelope("transcript.segment", payload, this.sessionId ?? "mock-session"));
  }
}

const dmCockpitTranscriptTransport = new DMCockpitTranscriptTransport();

function dmTranscriptConnectionLabel(state) {
  return {
    disconnected: "Nicht verbunden",
    connecting: "Verbindet …",
    connected: "Verbunden",
    error: "Fehler"
  }[state] ?? String(state ?? "Unbekannt");
}

function dmTranscriptCaptureLabel(state) {
  return {
    idle: "Inaktiv",
    joining: "Bot joint",
    listening: "Live",
    paused: "Pausiert",
    stopping: "Stoppt",
    error: "Fehler"
  }[state] ?? String(state ?? "Unbekannt");
}

function dmTranscriptSegmentRows(segments) {
  if (!segments.length) {
    return `<div class="dm-transcript-empty"><i class="fa-solid fa-wave-square"></i><span>Noch keine Transkriptsegmente. Nutze „Mock-Segment“, um die UI ohne Discord zu testen.</span></div>`;
  }

  return [...segments].reverse().map(segment => {
    const confidence = typeof segment.confidence === "number"
      ? `<span class="dm-transcript-confidence">${Math.round(segment.confidence * 100)}%</span>`
      : "";
    const partial = segment.final ? "" : `<span class="dm-transcript-partial">vorläufig</span>`;
    return `<article class="dm-transcript-line ${segment.final ? "" : "is-partial"}" data-segment-id="${dmTranscriptEscape(segment.segmentId)}">
      <div class="dm-transcript-meta">
        <strong>${dmTranscriptEscape(segment.speakerName)}</strong>
        <span>${dmTranscriptEscape(dmTranscriptFormatTime(segment.endedAt))}</span>
        ${confidence}
        ${partial}
      </div>
      <p>${dmTranscriptEscape(segment.text)}</p>
    </article>`;
  }).join("");
}

function dmTranscriptNpcHtml(context) {
  if (!context || context.source === "none") {
    return `<span class="dm-transcript-npc-none"><i class="fa-solid fa-user-slash"></i> Kein NPC-Kontext</span>`;
  }
  const source = context.source === "cockpit" ? "Cockpit" : "Token";
  return `<span><i class="fa-solid fa-user-tag"></i> ${dmTranscriptEscape(context.actorName ?? "Actor")} <small>· ${source}</small></span>`;
}

function dmTranscriptSectionHtml(snapshot) {
  return `<details id="dm-live-transcript" class="dm-cockpit-card dm-cockpit-wide dm-collapsible" open>
    <summary class="dm-cockpit-card-title">
      <div>
        <h3>Discord Live-Transkript</h3>
        <p class="card-subtitle">Mock-/Transport-Client · noch ohne echten Discord-Bot oder Cloud-STT</p>
      </div>
      <span class="dm-summary-chevron"><i class="fa-solid fa-chevron-down"></i></span>
    </summary>
    <div class="dm-card-body" data-dm-transcript-root>
      <div class="dm-transcript-statusbar">
        <span class="dm-transcript-status" data-dm-transcript-connection></span>
        <span class="dm-transcript-status" data-dm-transcript-capture></span>
        <span class="dm-transcript-status dm-transcript-npc" data-dm-transcript-npc></span>
      </div>

      <div class="dm-transcript-connect-row">
        <input type="text" data-dm-transcript-url value="${dmTranscriptEscape(snapshot.url)}" aria-label="Companion WebSocket URL" spellcheck="false">
        <button type="button" class="dm-button-secondary small" data-dm-transcript-save-url><i class="fa-solid fa-floppy-disk"></i> URL</button>
        <button type="button" class="dm-button-secondary small" data-dm-transcript-connect><i class="fa-solid fa-plug"></i> Verbinden</button>
      </div>

      <div class="dm-section-actions dm-transcript-actions">
        <button type="button" class="dm-button-primary small" data-dm-transcript-mock-capture><i class="fa-solid fa-microphone-lines"></i> Mock-Status</button>
        <button type="button" class="dm-button-primary small" data-dm-transcript-mock-segment><i class="fa-solid fa-comment-dots"></i> Mock-Segment</button>
        <button type="button" class="dm-button-secondary small" data-dm-transcript-send-npc><i class="fa-solid fa-user-tag"></i> NPC-Kontext</button>
        <button type="button" class="dm-button-danger small" data-dm-transcript-clear><i class="fa-solid fa-trash"></i> Leeren</button>
      </div>

      <div class="dm-transcript-notice">
        <i class="fa-solid fa-circle-info"></i>
        <span>V1 zeigt den technischen Capture-Status sichtbar an. „notice_only“ ist nur eine Workflow-Einstellung und keine automatische rechtliche Freigabe.</span>
      </div>

      <div class="dm-transcript-feed" data-dm-transcript-feed>${dmTranscriptSegmentRows(snapshot.segments)}</div>
      <div class="dm-transcript-error" data-dm-transcript-error hidden></div>
    </div>
  </details>`;
}

function dmTranscriptRenderSection(section) {
  const snapshot = dmCockpitTranscriptTransport.snapshot();

  const connection = section.querySelector("[data-dm-transcript-connection]");
  if (connection) {
    connection.dataset.state = snapshot.connectionState;
    connection.innerHTML = `<i class="fa-solid fa-circle"></i> ${dmTranscriptEscape(dmTranscriptConnectionLabel(snapshot.connectionState))}`;
  }

  const capture = section.querySelector("[data-dm-transcript-capture]");
  if (capture) {
    capture.dataset.state = snapshot.capture.state;
    capture.innerHTML = `<i class="fa-solid fa-microphone"></i> ${dmTranscriptEscape(dmTranscriptCaptureLabel(snapshot.capture.state))}`;
  }

  const npc = section.querySelector("[data-dm-transcript-npc]");
  if (npc) npc.innerHTML = dmTranscriptNpcHtml(snapshot.npcContext);

  const connect = section.querySelector("[data-dm-transcript-connect]");
  if (connect) {
    const connected = snapshot.connectionState === "connected" || snapshot.connectionState === "connecting";
    connect.innerHTML = connected
      ? `<i class="fa-solid fa-plug-circle-xmark"></i> Trennen`
      : `<i class="fa-solid fa-plug"></i> Verbinden`;
  }

  const feed = section.querySelector("[data-dm-transcript-feed]");
  if (feed) feed.innerHTML = dmTranscriptSegmentRows(snapshot.segments);

  const error = section.querySelector("[data-dm-transcript-error]");
  if (error) {
    error.hidden = !snapshot.lastError;
    error.textContent = snapshot.lastError ?? "";
  }
}

function dmTranscriptInject(application, element) {
  if (!game.user?.isGM || !dmTranscriptIsCockpit(application)) return;

  const badge = element.querySelector?.(".dm-cockpit-badge");
  if (badge) badge.textContent = DM_COCKPIT_TRANSCRIPT_VERSION;

  const grid = element.querySelector?.(".dm-cockpit-grid");
  if (!grid || element.querySelector("#dm-live-transcript")) return;

  dmCockpitTranscriptTransport.sendNpcContext({ force: true });
  const wrapper = document.createElement("div");
  wrapper.innerHTML = dmTranscriptSectionHtml(dmCockpitTranscriptTransport.snapshot()).trim();
  const section = wrapper.firstElementChild;
  grid.appendChild(section);

  let stateHook;
  stateHook = Hooks.on("dmCockpitTranscriptStateChanged", () => {
    if (!section.isConnected) {
      Hooks.off("dmCockpitTranscriptStateChanged", stateHook);
      return;
    }
    dmTranscriptRenderSection(section);
  });

  section.addEventListener("click", async event => {
    const saveUrl = event.target.closest?.("[data-dm-transcript-save-url]");
    if (saveUrl) {
      const input = section.querySelector("[data-dm-transcript-url]");
      try {
        await dmCockpitTranscriptTransport.setUrl(input?.value);
        ui.notifications?.info("DM Cockpit: Companion-WebSocket-URL gespeichert.");
      } catch (error) {
        ui.notifications?.warn(`DM Cockpit: ${error.message}`);
      }
      return;
    }

    const connect = event.target.closest?.("[data-dm-transcript-connect]");
    if (connect) {
      if (["connected", "connecting"].includes(dmCockpitTranscriptTransport.connectionState)) {
        dmCockpitTranscriptTransport.disconnect();
      } else {
        const input = section.querySelector("[data-dm-transcript-url]");
        try {
          await dmCockpitTranscriptTransport.setUrl(input?.value);
          dmCockpitTranscriptTransport.connect();
        } catch (error) {
          ui.notifications?.warn(`DM Cockpit: ${error.message}`);
        }
      }
      return;
    }

    if (event.target.closest?.("[data-dm-transcript-mock-capture]")) {
      dmCockpitTranscriptTransport.mockCapture();
      return;
    }

    if (event.target.closest?.("[data-dm-transcript-mock-segment]")) {
      dmCockpitTranscriptTransport.mockSegment();
      return;
    }

    if (event.target.closest?.("[data-dm-transcript-send-npc]")) {
      const context = dmCockpitTranscriptTransport.sendNpcContext({ force: true });
      ui.notifications?.info(context.source === "none"
        ? "DM Cockpit: Kein NPC-Kontext aktiv."
        : `DM Cockpit: NPC-Kontext ${context.actorName} bereit.`);
      return;
    }

    if (event.target.closest?.("[data-dm-transcript-clear]")) {
      dmCockpitTranscriptTransport.clearSegments();
    }
  });

  dmTranscriptRenderSection(section);
}

Hooks.once("init", () => {
  game.settings.register("dm-cockpit", DM_COCKPIT_TRANSCRIPT_WS_KEY, {
    name: "DM Cockpit Discord Audio/KI WebSocket URL",
    scope: "client",
    config: false,
    type: String,
    default: DM_COCKPIT_TRANSCRIPT_DEFAULT_WS
  });
});

Hooks.once("ready", () => {
  globalThis.DMCockpitLiveTranscript = {
    transport: dmCockpitTranscriptTransport,
    connect: url => dmCockpitTranscriptTransport.connect(url),
    disconnect: () => dmCockpitTranscriptTransport.disconnect(),
    ingest: envelope => dmCockpitTranscriptTransport.ingest(envelope),
    mockSegment: () => dmCockpitTranscriptTransport.mockSegment(),
    mockCapture: () => dmCockpitTranscriptTransport.mockCapture(),
    npcContext: () => dmCockpitTranscriptTransport.sendNpcContext({ force: true }),
    snapshot: () => dmCockpitTranscriptTransport.snapshot()
  };
});

Hooks.on("renderApplicationV2", dmTranscriptInject);
Hooks.on("controlToken", () => dmCockpitTranscriptTransport.sendNpcContext());
Hooks.on("deleteActor", () => dmCockpitTranscriptTransport.sendNpcContext({ force: true }));

console.log(`DM Cockpit | ${DM_COCKPIT_TRANSCRIPT_VERSION} Live-Transkript Mock/Transport bereit`);
