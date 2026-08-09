import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CompanionStore } from "./store.js";
import { PlayerCharacterIdentityRegistry } from "./player-character-identity.js";

const dir = mkdtempSync(join(tmpdir(), "dm-cockpit-identity-"));
const dbPath = join(dir, "identity.sqlite");

try {
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE speakers (
      discord_user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      global_name TEXT,
      is_bot INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE transcript_segments (
      segment_id TEXT PRIMARY KEY,
      session_id TEXT,
      discord_user_id TEXT NOT NULL,
      speaker_name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      text TEXT NOT NULL,
      final INTEGER NOT NULL,
      language TEXT,
      provider TEXT,
      confidence REAL,
      created_at TEXT NOT NULL
    );
  `);
  legacy.close();

  const store = new CompanionStore(dbPath);

  const speakerColumns = new Set(
    store.db.prepare("PRAGMA table_info(speakers)").all().map(row => String(row.name))
  );
  assert.equal(speakerColumns.has("server_nickname"), true, "server_nickname migration fehlt");

  const transcriptColumns = new Set(
    store.db.prepare("PRAGMA table_info(transcript_segments)").all().map(row => String(row.name))
  );
  for (const column of ["player_name", "actor_id", "actor_uuid", "character_name"]) {
    assert.equal(transcriptColumns.has(column), true, `Transcript-Migration fehlt: ${column}`);
  }

  const mapping = {
    discordUserId: "discord-42",
    playerName: "Mira",
    actorId: "actor-7",
    actorUuid: "Actor.actor-7",
    characterName: "Ragna",
    updatedAt: "2026-08-09T16:00:00.000Z"
  };

  assert.equal(
    store.replacePlayerCharacterMappings("world-test", [mapping], "2026-08-09T16:00:00.000Z"),
    true,
    "Mapping konnte nicht gespeichert werden"
  );
  assert.deepEqual(store.listPlayerCharacterMappings("world-test"), [mapping]);

  const identity = new PlayerCharacterIdentityRegistry();
  assert.equal(identity.replace({ worldId: "world-test", mappings: [mapping] }), true);
  assert.equal(identity.worldId, "world-test");
  assert.deepEqual(identity.get("discord-42"), {
    discordUserId: "discord-42",
    playerName: "Mira",
    actorId: "actor-7",
    actorUuid: "Actor.actor-7",
    characterName: "Ragna"
  });

  const enriched = identity.enrichTranscript({
    segmentId: "segment-test",
    discordUserId: "discord-42",
    speakerName: "Mira Discord",
    startedAt: "2026-08-09T16:01:00.000Z",
    endedAt: "2026-08-09T16:01:03.000Z",
    text: "Ich öffne die Tür.",
    final: true,
    language: "de",
    provider: "test",
    confidence: 0.99
  });

  assert.equal(enriched.playerName, "Mira");
  assert.equal(enriched.actorId, "actor-7");
  assert.equal(enriched.actorUuid, "Actor.actor-7");
  assert.equal(enriched.characterName, "Ragna");

  const unmapped = identity.enrichTranscript({
    discordUserId: "discord-99",
    speakerName: "Noah"
  });
  assert.equal(unmapped.playerName, "Noah");
  assert.equal(unmapped.actorId, null);
  assert.equal(unmapped.characterName, null);

  store.upsertSpeaker({
    discordUserId: "discord-42",
    displayName: "Mira",
    globalName: "Mira",
    serverNickname: "Ragna | Mira",
    isBot: false
  });

  assert.equal(store.upsertTranscriptSegment("session-test", enriched), true);

  const transcript = store.db.prepare(`
    SELECT discord_user_id, speaker_name, player_name, actor_id, actor_uuid, character_name
    FROM transcript_segments
    WHERE segment_id = ?
  `).get("segment-test");

  assert.deepEqual(transcript, {
    discord_user_id: "discord-42",
    speaker_name: "Mira Discord",
    player_name: "Mira",
    actor_id: "actor-7",
    actor_uuid: "Actor.actor-7",
    character_name: "Ragna"
  });

  assert.equal(store.replacePlayerCharacterMappings("world-test", []), true);
  assert.deepEqual(store.listPlayerCharacterMappings("world-test"), []);

  identity.clear();
  assert.equal(identity.worldId, null);
  assert.equal(identity.get("discord-42"), null);

  store.close();
  console.log("Identity-Mapping-Smoke-Test erfolgreich: Legacy-Migration -> Mapping -> Registry -> Transcript-Attribution -> Clear bestätigt.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
