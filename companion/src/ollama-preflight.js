const DEFAULT_ENDPOINT = "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL = "qwen3:4b";
const DEFAULT_TIMEOUT_MS = 5000;

function env(name, fallback = "") {
  const value = String(process.env[name] ?? "").trim();
  return value || fallback;
}

function endpointOrigin(value) {
  const url = new URL(value);
  return url.origin;
}

const endpoint = env("OLLAMA_AI_ENDPOINT", DEFAULT_ENDPOINT);
const model = env("OLLAMA_AI_MODEL", DEFAULT_MODEL);
const timeoutMs = Math.max(1000, Number.parseInt(env("OLLAMA_PREFLIGHT_TIMEOUT_MS", String(DEFAULT_TIMEOUT_MS)), 10) || DEFAULT_TIMEOUT_MS);
const origin = endpointOrigin(endpoint);
const showUrl = `${origin}/api/show`;

let response;
try {
  response = await fetch(showUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model }),
    signal: AbortSignal.timeout(timeoutMs)
  });
} catch (error) {
  console.error(`Ollama-Preflight fehlgeschlagen: Ollama ist unter ${origin} nicht erreichbar.`);
  console.error(`Details: ${error?.message ?? error}`);
  process.exit(1);
}

let payload = null;
try {
  payload = await response.json();
} catch (_error) {
  console.error(`Ollama-Preflight fehlgeschlagen: ${showUrl} lieferte kein gültiges JSON (HTTP ${response.status}).`);
  process.exit(1);
}

if (!response.ok) {
  const reason = String(payload?.error ?? payload?.message ?? `HTTP ${response.status}`);
  console.error(`Ollama-Preflight fehlgeschlagen: Modell '${model}' ist nicht verwendbar (${reason}).`);
  console.error(`Falls Ollama installiert ist: ollama pull ${model}`);
  process.exit(1);
}

console.log(`Ollama erreichbar: ${origin}`);
console.log(`Modell vorhanden: ${model}`);
if (payload?.details?.parameter_size) console.log(`Parameter: ${payload.details.parameter_size}`);
if (payload?.details?.quantization_level) console.log(`Quantisierung: ${payload.details.quantization_level}`);
console.log("Ollama-Preflight erfolgreich.");
