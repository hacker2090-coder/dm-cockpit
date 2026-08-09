function normalize(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function hasAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

export class MockAiExtractionProvider {
  snapshot() {
    return {
      provider: "mock",
      model: "deterministic-v1",
      configured: true,
      externalDataTransfer: false
    };
  }

  missingConfiguration() {
    return [];
  }

  async extract({ segment, npcContext = null }) {
    const text = normalize(segment?.text);
    const lower = text.toLocaleLowerCase("de-DE");
    const npcCandidates = [];
    const sessionEventCandidates = [];

    if (!text) {
      return { npcCandidates, sessionEventCandidates };
    }

    if (npcContext?.actorId && hasAny(lower, [/versprech/, /ich schwöre/, /ich werde .* zurück/])) {
      npcCandidates.push({
        actorId: String(npcContext.actorId),
        actorUuid: npcContext.actorUuid ? String(npcContext.actorUuid) : null,
        kind: "promise",
        text,
        confidence: 1
      });
    }

    if (hasAny(lower, [/morgen.*zurück/, /zurück.*morgen/, /müssen .* zurück/, /sollen .* zurück/])) {
      sessionEventCandidates.push({
        kind: "task",
        text,
        confidence: 1
      });
    }

    if (hasAny(lower, [/wir entscheiden/, /wir haben entschieden/, /entscheidung ist/])) {
      sessionEventCandidates.push({
        kind: "decision",
        text,
        confidence: 1
      });
    }

    return { npcCandidates, sessionEventCandidates };
  }
}
