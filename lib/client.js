window.__ModuleLoader__.load({ id: "noumena-luna", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var API_PREFIX = "/api/noumena-luna";
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "noumena-luna",
    order: 25,
    label: "DSH Skill Manager"
  }, SkillManagerSection));
}
function SkillManagerSection({ close }) {
  const [query, setQuery] = (0, import_react.useState)("");
  const [results, setResults] = (0, import_react.useState)([]);
  const [installed, setInstalled] = (0, import_react.useState)([]);
  const [updates, setUpdates] = (0, import_react.useState)({});
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [installedLoading, setInstalledLoading] = (0, import_react.useState)(true);
  const [error, setError] = (0, import_react.useState)();
  const [message, setMessage] = (0, import_react.useState)();
  const loadInstalled = (0, import_react.useCallback)(async () => {
    setInstalledLoading(true);
    setError(void 0);
    try {
      const payload = await requestJson("/skills/installed");
      setInstalled(payload.skills);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setInstalledLoading(false);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    void loadInstalled();
  }, [loadInstalled]);
  const search = (0, import_react.useCallback)(async () => {
    if (query.trim().length === 0) {
      setResults([]);
      setError(void 0);
      return;
    }
    setLoading(true);
    setError(void 0);
    setMessage(void 0);
    try {
      const params = new URLSearchParams({ q: query.trim() });
      const payload = await requestJson(
        `/skills/search?${params.toString()}`
      );
      setResults(payload.skills);
    } catch (cause) {
      setResults([]);
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [query]);
  const install = (0, import_react.useCallback)(async (skill) => {
    if (!window.confirm(`Install "${skill.name}" into the DSH skill directory?`)) return;
    setLoading(true);
    setError(void 0);
    setMessage(void 0);
    try {
      await requestJson(`/skills/install`, {
        method: "POST",
        body: JSON.stringify({ id: skill.id, confirmed: true })
      });
      setMessage(`Installed ${skill.name}.`);
      await loadInstalled();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [loadInstalled]);
  const checkUpdate = (0, import_react.useCallback)(async (skill) => {
    setError(void 0);
    try {
      const result = await requestJson("/skills/check-update", {
        method: "POST",
        body: JSON.stringify({ id: skill.id, confirmed: false })
      });
      setUpdates((previous) => ({ ...previous, [skill.id]: result }));
      setMessage(result.hasUpdate ? `${skill.name} has an update available.` : `${skill.name} is up to date.`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);
  const update = (0, import_react.useCallback)(async (skill) => {
    if (!window.confirm(`Update "${skill.name}" and replace its current files?`)) return;
    setLoading(true);
    setError(void 0);
    setMessage(void 0);
    try {
      await requestJson("/skills/update", {
        method: "POST",
        body: JSON.stringify({ id: skill.id, confirmed: true })
      });
      setMessage(`Updated ${skill.name}.`);
      setUpdates((previous) => {
        const next = { ...previous };
        delete next[skill.id];
        return next;
      });
      await loadInstalled();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [loadInstalled]);
  const uninstall = (0, import_react.useCallback)(async (skill) => {
    if (!window.confirm(`Uninstall "${skill.name}" from the DSH skill directory?`)) return;
    setLoading(true);
    setError(void 0);
    setMessage(void 0);
    try {
      await requestJson("/skills/uninstall", {
        method: "POST",
        body: JSON.stringify({ id: skill.id, confirmed: true })
      });
      setMessage(`Uninstalled ${skill.name}.`);
      await loadInstalled();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [loadInstalled]);
  const copy = (0, import_react.useMemo)(() => ({
    search: "Search skills.sh",
    searchPlaceholder: "Try pdf, testing, or react",
    installed: "Managed local skills",
    noResults: query.trim().length === 0 ? "Enter a keyword to search skills.sh." : "No skills found.",
    noInstalled: "No skills are managed by this plugin yet.",
    loading: "Loading\u2026",
    searchButton: "Search",
    install: "Install",
    checkUpdate: "Check update",
    update: "Update",
    uninstall: "Uninstall",
    missing: "Directory missing",
    close: "Close"
  }), [query]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: styles.section, "aria-label": "DSH Skill Manager", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { style: styles.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { style: styles.title, children: "DSH Skill Manager" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.subtitle, children: "Search, install, update, and remove skills from skills.sh." })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: close, style: styles.secondaryButton, children: copy.close })
    ] }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", style: styles.error, children: error }) : null,
    message ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", style: styles.success, children: message }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: styles.heading, children: copy.search }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "form",
        {
          style: styles.searchRow,
          onSubmit: (event) => {
            event.preventDefault();
            void search();
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                "aria-label": "Search skills.sh",
                value: query,
                onChange: (event) => setQuery(event.target.value),
                placeholder: copy.searchPlaceholder,
                style: styles.input,
                disabled: loading
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "submit", style: styles.primaryButton, disabled: loading, children: loading ? copy.loading : copy.searchButton })
          ]
        }
      ),
      loading && results.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.muted, children: copy.loading }) : null,
      !loading && results.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.muted, children: copy.noResults }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: styles.list, children: results.map((skill) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { style: styles.item, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.itemBody, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { style: styles.itemTitle, children: skill.name }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.description, children: skill.description }),
          skill.detailError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: styles.warning, children: [
            "Details unavailable: ",
            skill.detailError
          ] }) : null,
          skill.canInstall === false ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.warning, children: "This skill name is not compatible with the DSH skill format." }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", { style: styles.details, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { style: styles.term, children: "Source" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { style: styles.value, children: skill.source })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { style: styles.term, children: "Installs" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { style: styles.value, children: formatInstalls(skill.installs) })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: skill.pageUrl, target: "_blank", rel: "noreferrer", style: styles.link, children: "Open on skills.sh" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: styles.primaryButton,
            onClick: () => {
              void install(skill);
            },
            disabled: loading || skill.content.length === 0 || skill.canInstall === false,
            children: copy.install
          }
        )
      ] }, skill.id)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: styles.heading, children: copy.installed }),
      installedLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.muted, children: copy.loading }) : null,
      !installedLoading && installed.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.muted, children: copy.noInstalled }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: styles.list, children: installed.map((skill) => {
        const updateInfo = updates[skill.id];
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { style: styles.item, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.itemBody, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { style: styles.itemTitle, children: skill.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.description, children: skill.description }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: skill.exists ? styles.muted : styles.warning, children: skill.exists ? `${skill.source} \xB7 ${skill.directory}` : copy.missing }),
            updateInfo?.hasUpdate ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.warning, children: "Update available." }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.actions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: styles.secondaryButton, onClick: () => {
              void checkUpdate(skill);
            }, disabled: loading, children: copy.checkUpdate }),
            updateInfo?.hasUpdate ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: styles.primaryButton, onClick: () => {
              void update(skill);
            }, disabled: loading, children: copy.update }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: styles.dangerButton, onClick: () => {
              void uninstall(skill);
            }, disabled: loading, children: copy.uninstall })
          ] })
        ] }, skill.id);
      }) })
    ] })
  ] });
}
async function requestJson(path, init) {
  let response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...init?.headers
      }
    });
  } catch (cause) {
    throw new Error(`Unable to reach the DSH Skill Manager: ${errorMessage(cause)}`);
  }
  let body;
  try {
    body = await response.json();
  } catch (cause) {
    throw new Error(`The DSH Skill Manager returned invalid data: ${errorMessage(cause)}`);
  }
  if (!response.ok || "error" in body) {
    throw new Error(body && "error" in body ? body.error.message : `Request failed with HTTP ${response.status}.`);
  }
  return body.data;
}
function errorMessage(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}
function formatInstalls(installs) {
  return new Intl.NumberFormat().format(installs);
}
var styles = {
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 920,
    paddingBottom: 32
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: 16,
    justifyContent: "space-between"
  },
  title: { margin: 0, fontSize: 20, fontWeight: 600 },
  subtitle: { color: "var(--dsw-alias-label-secondary)", margin: "6px 0 0", fontSize: 13 },
  heading: { margin: "0 0 12px", fontSize: 15, fontWeight: 600 },
  card: {
    border: "1px solid var(--dsw-alias-border-l2)",
    borderRadius: 12,
    padding: 16
  },
  searchRow: { display: "flex", gap: 8 },
  input: {
    background: "var(--dsw-alias-bg-layer-3)",
    border: "1px solid var(--dsw-alias-border-l2)",
    borderRadius: 8,
    color: "var(--dsw-alias-label-primary)",
    flex: 1,
    font: "inherit",
    minWidth: 0,
    padding: "9px 12px"
  },
  list: { display: "flex", flexDirection: "column", gap: 10, marginTop: 14 },
  item: {
    alignItems: "flex-start",
    background: "var(--dsw-alias-bg-layer-3)",
    border: "1px solid var(--dsw-alias-border-l2)",
    borderRadius: 10,
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    padding: 12
  },
  itemBody: { minWidth: 0 },
  itemTitle: { margin: 0, fontSize: 14, fontWeight: 600 },
  description: { color: "var(--dsw-alias-label-secondary)", fontSize: 13, lineHeight: 1.5, margin: "5px 0 8px" },
  details: { display: "flex", flexWrap: "wrap", gap: "4px 18px", margin: 0 },
  term: { color: "var(--dsw-alias-label-tertiary)", display: "inline", fontSize: 12 },
  value: { display: "inline", fontSize: 12, margin: 0 },
  link: { color: "var(--dsw-alias-brand-primary)", display: "inline-block", fontSize: 12, marginTop: 8 },
  actions: { display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" },
  primaryButton: {
    background: "var(--dsw-alias-brand-primary)",
    border: 0,
    borderRadius: 7,
    color: "white",
    cursor: "pointer",
    font: "inherit",
    fontSize: 12,
    padding: "8px 11px",
    whiteSpace: "nowrap"
  },
  secondaryButton: {
    background: "transparent",
    border: "1px solid var(--dsw-alias-border-l2)",
    borderRadius: 7,
    color: "var(--dsw-alias-label-primary)",
    cursor: "pointer",
    font: "inherit",
    fontSize: 12,
    padding: "7px 10px",
    whiteSpace: "nowrap"
  },
  dangerButton: {
    background: "transparent",
    border: "1px solid var(--dsw-alias-label-error)",
    borderRadius: 7,
    color: "var(--dsw-alias-label-error)",
    cursor: "pointer",
    font: "inherit",
    fontSize: 12,
    padding: "7px 10px",
    whiteSpace: "nowrap"
  },
  muted: { color: "var(--dsw-alias-label-tertiary)", fontSize: 13, margin: "10px 0 0" },
  error: {
    background: "color-mix(in srgb, var(--dsw-alias-label-error) 12%, transparent)",
    borderRadius: 8,
    color: "var(--dsw-alias-label-error)",
    fontSize: 13,
    margin: 0,
    padding: "9px 11px"
  },
  success: {
    background: "color-mix(in srgb, var(--dsw-alias-label-success) 12%, transparent)",
    borderRadius: 8,
    color: "var(--dsw-alias-label-success)",
    fontSize: 13,
    margin: 0,
    padding: "9px 11px"
  },
  warning: { color: "var(--dsw-alias-label-warning)", fontSize: 12, margin: "6px 0" }
};
return module.exports; } });
//# sourceMappingURL=client.js.map
