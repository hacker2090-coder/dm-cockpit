const DEFAULT_MAX_LENGTH = 32;
const DEFAULT_SEPARATOR = " | ";

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function codePoints(value) {
  return Array.from(String(value ?? ""));
}

function truncate(value, maxLength) {
  const chars = codePoints(value);
  return chars.length <= maxLength ? chars.join("") : chars.slice(0, maxLength).join("");
}

export function formatSessionNickname({
  characterName,
  playerName = null,
  maxLength = DEFAULT_MAX_LENGTH,
  separator = DEFAULT_SEPARATOR
} = {}) {
  const character = normalize(characterName);
  const player = normalize(playerName);
  const limit = Math.max(1, Math.min(32, Number.parseInt(String(maxLength), 10) || DEFAULT_MAX_LENGTH));
  if (!character) throw new Error("characterName fehlt für Session-Nickname.");

  const characterOnly = truncate(character, limit);
  if (!player || codePoints(character).length >= limit) return characterOnly;

  const sep = normalize(separator) ? String(separator) : DEFAULT_SEPARATOR;
  const remaining = limit - codePoints(character).length - codePoints(sep).length;
  if (remaining < 1) return characterOnly;

  return `${character}${sep}${truncate(player, remaining)}`;
}

export function nicknameLength(value) {
  return codePoints(value).length;
}
