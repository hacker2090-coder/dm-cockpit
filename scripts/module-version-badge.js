const DM_COCKPIT_MODULE_ID = "dm-cockpit";

function dmCockpitActualVersion() {
  const module = game.modules?.get(DM_COCKPIT_MODULE_ID);
  const version = String(module?.version ?? "").trim();
  return version ? `V${version.replace(/^v/i, "")}` : null;
}

function dmCockpitApplyVersionBadge(application, element) {
  const isCockpit = application?.id === DM_COCKPIT_MODULE_ID || application?.options?.id === DM_COCKPIT_MODULE_ID;
  if (!isCockpit) return;

  const apply = () => {
    const badge = element?.querySelector?.(".dm-cockpit-badge");
    const version = dmCockpitActualVersion();
    if (badge && version) badge.textContent = version;
  };

  apply();
  queueMicrotask(apply);
  window.setTimeout(apply, 0);
}

Hooks.on("renderApplicationV2", dmCockpitApplyVersionBadge);

console.log("DM Cockpit | Modulversionsanzeige bereit");
