import { WebSocket } from "ws";

const DEFAULT_ENDPOINT = "wss://api.eu.deepgram.com/v1/listen";
const DEFAULT_MODEL = "nova-3";
const DEFAULT_LANGUAGE = "de";
const DEFAULT_TIMEOUT_MS = 15_000;

function env(name, fallback = "") {
  const value = String(process.env[name] ?? "").trim();
  return value || fallback;
}

function errorText(error) {
  return String(error?.message ?? error ?? "Unbekannter Fehler");
}

export class DeepgramSttProvider {
  constructor() {
    this.apiKey = env("DEEPGRAM_API_KEY");
    this.endpoint = env("DEEPGRAM_STT_ENDPOINT", DEFAULT_ENDPOINT);
    this.model = env("DEEPGRAM_STT_MODEL", DEFAULT_MODEL);
    this.language = env("DEEPGRAM_STT_LANGUAGE", DEFAULT_LANGUAGE);
    this.timeoutMs = Number.parseInt(env("DEEPGRAM_STT_TIMEOUT_MS", String(DEFAULT_TIMEOUT_MS)), 10);
  }

  missingConfiguration() {
    return this.apiKey ? [] : ["DEEPGRAM_API_KEY"];
  }

  snapshot() {
    return {
      provider: "deepgram",
      configured: this.missingConfiguration().length === 0,
      missingConfiguration: this.missingConfiguration(),
      endpoint: this.endpoint,
      model: this.model,
      language: this.language,
      modelImprovementOptOut: true,
      audio: {
        encoding: "opus",
        sampleRate: 48_000,
        channels: 2
      }
    };
  }

  buildUrl() {
    const url = new URL(this.endpoint);
    url.searchParams.set("model", this.model);
    url.searchParams.set("language", this.language);
    url.searchParams.set("encoding", "opus");
    url.searchParams.set("sample_rate", "48000");
    url.searchParams.set("channels", "2");
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("interim_results", "false");
    // Privacy-sicherer Standard: Kundenaudio niemals für das freiwillige
    // Deepgram Model Improvement Partnership Program freigeben.
    url.searchParams.set("mip_opt_out", "true");
    return url.toString();
  }

  async transcribe(segment) {
    if (this.missingConfiguration().length) {
      throw new Error("Deepgram ist nicht konfiguriert: DEEPGRAM_API_KEY fehlt.");
    }
    if (!segment?.opusPackets?.length) {
      throw new Error("STT-Segment enthält keine Opus-Pakete.");
    }

    return new Promise((resolve, reject) => {
      const transcriptParts = [];
      const confidences = [];
      let settled = false;
      let finalizeSeen = false;
      let closeRequested = false;

      const ws = new WebSocket(this.buildUrl(), {
        headers: {
          Authorization: `Token ${this.apiKey}`
        },
        perMessageDeflate: false,
        maxPayload: 2 * 1024 * 1024
      });

      const timer = setTimeout(() => {
        finishError(new Error(`Deepgram STT Timeout nach ${this.timeoutMs} ms.`));
      }, this.timeoutMs);
      timer.unref?.();

      function cleanup() {
        clearTimeout(timer);
        ws.removeAllListeners();
      }

      function finishError(error) {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          ws.terminate();
        } catch (_error) {
          // Ignorieren.
        }
        reject(error);
      }

      function finishSuccess() {
        if (settled) return;
        const text = transcriptParts.join(" ").replace(/\s+/g, " ").trim();
        if (!text) {
          finishError(new Error("Deepgram lieferte kein Transkript für das Segment."));
          return;
        }

        settled = true;
        cleanup();
        const confidence = confidences.length
          ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
          : null;

        resolve({
          text,
          confidence,
          language: this.language,
          provider: "deepgram",
          model: this.model
        });
      }

      const requestClose = () => {
        if (closeRequested || ws.readyState !== WebSocket.OPEN) return;
        closeRequested = true;
        try {
          ws.send(JSON.stringify({ type: "CloseStream" }));
        } catch (error) {
          finishError(error);
        }
      };

      ws.once("open", () => {
        try {
          for (const packet of segment.opusPackets) {
            ws.send(packet, { binary: true });
          }
          ws.send(JSON.stringify({ type: "Finalize" }));
        } catch (error) {
          finishError(error);
        }
      });

      ws.on("message", raw => {
        let message;
        try {
          message = JSON.parse(raw.toString("utf8"));
        } catch (_error) {
          return;
        }

        if (message?.type === "Error") {
          finishError(new Error(`Deepgram: ${message.description ?? message.message ?? "API-Fehler"}`));
          return;
        }

        if (message?.type !== "Results") return;

        const alternative = message.channel?.alternatives?.[0];
        const text = String(alternative?.transcript ?? "").trim();
        if (message.is_final && text) {
          transcriptParts.push(text);
          if (typeof alternative?.confidence === "number") confidences.push(alternative.confidence);
        }

        if (message.from_finalize === true) {
          finalizeSeen = true;
          setTimeout(requestClose, 75).unref?.();
        }
      });

      ws.once("unexpected-response", (_request, response) => {
        finishError(new Error(`Deepgram WebSocket HTTP ${response.statusCode ?? "?"}.`));
      });

      ws.once("error", error => finishError(new Error(`Deepgram WebSocket: ${errorText(error)}`)));
      ws.once("close", () => {
        if (settled) return;
        if (!finalizeSeen && transcriptParts.length === 0) {
          finishError(new Error("Deepgram-Verbindung wurde ohne finales Ergebnis geschlossen."));
          return;
        }
        finishSuccess.call(this);
      });
    });
  }
}
