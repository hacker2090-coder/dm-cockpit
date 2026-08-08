const DM_COCKPIT_LOOT_SEARCH_VERSION = "V0.9.14";

function normalizeLootSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(game.i18n?.lang ?? "de")
    .trim();
}

function enhanceLootItemDialog(application, element) {
  if (!game.user?.isGM) return;

  const select = element?.querySelector?.('select[name="itemUuid"]');
  if (!select || element.querySelector('[data-dm-loot-item-search]')) return;

  const allItems = [...select.options].map(option => ({
    value: option.value,
    label: option.textContent ?? option.label ?? "",
    search: normalizeLootSearch(option.textContent ?? option.label ?? "")
  }));

  const group = document.createElement("div");
  group.className = "form-group";
  group.dataset.dmLootItemSearch = "true";
  group.innerHTML = `
    <label>Item suchen</label>
    <div class="form-fields">
      <input type="search" name="dmLootItemSearch" placeholder="Name, Welt oder Kompendium …" autocomplete="off">
    </div>
    <p class="hint" data-dm-loot-search-count>${allItems.length} Treffer</p>`;

  select.closest(".form-group")?.before(group);

  const input = group.querySelector('input[name="dmLootItemSearch"]');
  const count = group.querySelector('[data-dm-loot-search-count]');

  const render = () => {
    const terms = normalizeLootSearch(input?.value).split(/\s+/).filter(Boolean);
    const matches = terms.length
      ? allItems.filter(item => terms.every(term => item.search.includes(term)))
      : allItems;

    const previous = select.value;
    select.replaceChildren(...matches.map(item => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      return option;
    }));

    if (matches.some(item => item.value === previous)) select.value = previous;
    else if (matches.length) select.value = matches[0].value;
    else select.selectedIndex = -1;

    if (count) count.textContent = `${matches.length} Treffer`;
  };

  input?.addEventListener("input", render);
  input?.focus();
}

function refreshCockpitVersion(application, element) {
  const isCockpit = application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
  if (!isCockpit) return;
  const badge = element?.querySelector?.(".dm-cockpit-badge");
  if (badge) badge.textContent = DM_COCKPIT_LOOT_SEARCH_VERSION;
}

Hooks.on("renderApplicationV2", (application, element) => {
  enhanceLootItemDialog(application, element);
  refreshCockpitVersion(application, element);
});

console.log(`DM Cockpit | ${DM_COCKPIT_LOOT_SEARCH_VERSION} Loot-Item-Suche bereit`);
