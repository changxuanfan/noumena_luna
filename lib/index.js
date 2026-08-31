// src/index.ts
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";

// src/skills-sh.ts
import { createHash } from "node:crypto";
var ORIGIN = "https://skills.sh";
var SEARCH_LIMIT = 20;
var SkillsShError = class extends Error {
  constructor(code, message, status = 502, options) {
    super(message, options);
    this.code = code;
    this.status = status;
    this.name = "SkillsShError";
  }
};
var SkillsShClient = class {
  fetcher;
  origin;
  limit;
  constructor(options) {
    if (typeof options === "function") {
      this.fetcher = options;
      this.origin = ORIGIN;
      this.limit = SEARCH_LIMIT;
    } else {
      this.fetcher = options?.fetcher ?? defaultFetch;
      this.origin = options?.origin ?? ORIGIN;
      this.limit = options?.limit ?? SEARCH_LIMIT;
    }
    if (this.origin !== ORIGIN) {
      throw new Error(`skills.sh client only supports ${ORIGIN}`);
    }
  }
  async search(query, signal) {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];
    const params = new URLSearchParams({ q: trimmed, limit: String(this.limit) });
    const payload = await this.fetchJson(`${this.origin}/api/search?${params.toString()}`, signal);
    if (!isRecord(payload) || !Array.isArray(payload.skills)) {
      throw new SkillsShError(
        "UPSTREAM_INVALID_RESPONSE",
        "skills.sh returned an invalid search response."
      );
    }
    const entries = payload.skills.map(parseSearchEntry);
    return mapWithConcurrency(entries, 5, async (entry) => {
      const pageUrl = pageUrlFor(this.origin, entry.id);
      try {
        const detail = await this.getSkill(entry.id, signal);
        return {
          ...detail,
          installs: Math.max(entry.installs ?? 0, detail.installs),
          source: entry.source ?? detail.source
        };
      } catch (error) {
        if (error instanceof SkillsShError) {
          return {
            id: entry.id,
            skillId: entry.skillId ?? lastSegment(entry.id),
            name: entry.name ?? entry.skillId ?? lastSegment(entry.id),
            description: entry.description ?? "Description unavailable.",
            source: entry.source ?? sourceFor(entry.id),
            installs: entry.installs ?? 0,
            pageUrl,
            content: "",
            remoteRevision: "",
            detailError: error.message
          };
        }
        throw error;
      }
    });
  }
  async getSkill(id, signal) {
    validateSkillId(id);
    const pageUrl = pageUrlFor(this.origin, id);
    const response = await this.fetchText(pageUrl, signal);
    const metadata = parseJsonLd(response);
    const prose = extractProseBlock(response);
    const rest = extractRestBlock(response);
    if (metadata === void 0 || prose === void 0) {
      throw new SkillsShError(
        "UPSTREAM_INVALID_RESPONSE",
        "The skills.sh page does not contain a usable skill document."
      );
    }
    const content = htmlToMarkdown([prose, rest].filter((part) => part !== void 0).join("\n"));
    if (content.trim().length === 0) {
      throw new SkillsShError(
        "UPSTREAM_INVALID_RESPONSE",
        "The skills.sh page contains an empty skill document."
      );
    }
    const skillId = lastSegment(id);
    const name = stringValue(metadata.name) ?? skillId;
    const description = stringValue(metadata.description);
    if (description === void 0 || description.length === 0) {
      throw new SkillsShError(
        "UPSTREAM_INVALID_RESPONSE",
        "The skills.sh page does not contain a skill description."
      );
    }
    const installs = numberValue(
      isRecord(metadata.interactionStatistic) ? metadata.interactionStatistic.userInteractionCount : void 0
    ) ?? 0;
    return {
      id,
      skillId,
      name,
      description,
      source: sourceFor(id),
      installs,
      pageUrl,
      content,
      remoteRevision: createHash("sha256").update(content).digest("hex"),
      canInstall: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillId)
    };
  }
  async fetchJson(url, signal) {
    let response;
    try {
      response = await this.request(url, signal);
    } catch (error) {
      if (error instanceof SkillsShError) throw error;
      throw new SkillsShError("NETWORK_ERROR", "Unable to reach skills.sh.", 502, { cause: error });
    }
    if (!response.ok) {
      throw new SkillsShError(
        "SOURCE_UNAVAILABLE",
        `skills.sh search failed with HTTP ${response.status}.`,
        502
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw new SkillsShError(
        "UPSTREAM_INVALID_RESPONSE",
        "skills.sh returned invalid JSON.",
        502,
        { cause: error }
      );
    }
  }
  async fetchText(url, signal) {
    let response;
    try {
      response = await this.request(url, signal);
    } catch (error) {
      if (error instanceof SkillsShError) throw error;
      throw new SkillsShError("NETWORK_ERROR", "Unable to reach the skills.sh skill page.", 502, {
        cause: error
      });
    }
    if (!response.ok) {
      throw new SkillsShError(
        "SOURCE_UNAVAILABLE",
        `The skills.sh skill page returned HTTP ${response.status}.`,
        502
      );
    }
    try {
      return await response.text();
    } catch (error) {
      throw new SkillsShError(
        "UPSTREAM_INVALID_RESPONSE",
        "The skills.sh skill page could not be read.",
        502,
        { cause: error }
      );
    }
  }
  async request(url, signal) {
    let current = url;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(current, requestInit(signal));
      if (response.status < 300 || response.status >= 400) return response;
      const location = response.headers?.get("location");
      if (location === null || location === void 0) return response;
      const next = new URL(location, current);
      if (next.origin !== this.origin && next.origin !== "https://www.skills.sh") {
        throw new SkillsShError(
          "SOURCE_UNAVAILABLE",
          "skills.sh redirected to an unsupported source.",
          502
        );
      }
      current = next.toString();
    }
    throw new SkillsShError(
      "SOURCE_UNAVAILABLE",
      "skills.sh returned too many redirects.",
      502
    );
  }
};
function parseSearchEntry(value) {
  if (!isRecord(value) || typeof value.id !== "string" || !isSafeSkillId(value.id)) {
    throw new SkillsShError(
      "UPSTREAM_INVALID_RESPONSE",
      "skills.sh returned a search entry with an invalid identifier."
    );
  }
  return {
    id: value.id,
    skillId: optionalString(value.skillId),
    name: optionalString(value.name),
    installs: optionalNumber(value.installs),
    source: optionalString(value.source),
    description: optionalString(value.description)
  };
}
function parseJsonLd(html) {
  const matches = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    try {
      const value = JSON.parse(decodeHtmlEntities(match[1] ?? ""));
      if (isRecord(value) && value["@type"] === "SoftwareApplication") return value;
    } catch {
    }
  }
  return void 0;
}
function extractProseBlock(html) {
  const marker = html.search(/<span[^>]*>\s*SKILL\.md\s*<\/span>/i);
  if (marker < 0) return void 0;
  const start = html.indexOf("<div", marker);
  if (start < 0) return void 0;
  const openEnd = html.indexOf(">", start);
  if (openEnd < 0) return void 0;
  const classAttribute = html.slice(start, openEnd + 1);
  if (!/\bclass=["'][^"']*\bprose\b/i.test(classAttribute)) {
    const proseMatch = /<div\b[^>]*class=["'][^"']*\bprose\b[^"']*["'][^>]*>/gi;
    proseMatch.lastIndex = marker;
    const match = proseMatch.exec(html);
    const proseStart = match?.index ?? -1;
    if (proseStart < 0) return void 0;
    return matchingDivContent(html, proseStart);
  }
  return matchingDivContent(html, start);
}
function extractRestBlock(html) {
  const payload = decodeFlightPayloads(html);
  const reference = payload.match(/"restHtml":"\$([A-Za-z0-9]+)"/)?.[1];
  if (reference === void 0) return void 0;
  const record = new RegExp(
    `${escapeRegExp(reference)}:T[^,]*,([\\s\\S]*?)(?=\\n[A-Za-z0-9]+:[A-Z](?:\\[|$)|$)`
  ).exec(payload);
  return record?.[1];
}
function decodeFlightPayloads(html) {
  const payloads = [];
  for (const match of html.matchAll(/<script>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)) {
    try {
      payloads.push(JSON.parse(`"${match[1]}"`));
    } catch {
    }
  }
  return payloads.join("\n");
}
function matchingDivContent(html, start) {
  const openEnd = html.indexOf(">", start);
  if (openEnd < 0) return void 0;
  let depth = 1;
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = openEnd + 1;
  while (true) {
    const match = tags.exec(html);
    if (match === null) return void 0;
    if (match[0].startsWith("</")) depth -= 1;
    else if (!match[0].endsWith("/>")) depth += 1;
    if (depth === 0) return html.slice(openEnd + 1, match.index);
  }
}
function htmlToMarkdown(html) {
  let output = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, body) => `

\`\`\`
${stripTags(body)}
\`\`\`

`).replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, body) => {
    return `

${"#".repeat(Number(level))} ${stripTags(body)}

`;
  }).replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, body) => `
- ${stripTags(body)}
`).replace(/<(br|hr)\s*\/?>/gi, "\n").replace(/<\/(p|div|section|article|ul|ol|blockquote|table|tr)>/gi, "\n").replace(/<(p|div|section|article|ul|ol|blockquote|table|tr)\b[^>]*>/gi, "\n");
  output = stripTags(output);
  output = decodeHtmlEntities(output);
  return output.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function stripTags(value) {
  return value.replace(/<[^>]*>/g, "");
}
function decodeHtmlEntities(value) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function pageUrlFor(origin, id) {
  return `${origin}/${id.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}
function sourceFor(id) {
  return id.split("/").slice(0, 2).join("/");
}
function lastSegment(id) {
  return id.split("/").at(-1) ?? id;
}
function validateSkillId(id) {
  if (!isSafeSkillId(id)) {
    throw new SkillsShError("UPSTREAM_INVALID_RESPONSE", "The skill identifier is invalid.", 400);
  }
}
function isSafeSkillId(id) {
  const segments = id.split("/");
  return segments.length >= 2 && segments.length <= 8 && segments.every((segment) => /^[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=@%-]*$/.test(segment)) && segments.every((segment) => segment !== "." && segment !== "..");
}
function stringValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function optionalString(value) {
  return typeof value === "string" ? value : void 0;
}
function optionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requestInit(signal) {
  return {
    headers: { accept: "application/json, text/html" },
    redirect: "manual",
    signal
  };
}
var defaultFetch = (url, init) => globalThis.fetch(url, init);
async function mapWithConcurrency(entries, concurrency, callback) {
  const results = new Array(entries.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= entries.length) return;
      results[index] = await callback(entries[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()));
  return results;
}

// src/skill-manager.ts
import { createHash as createHash2, randomUUID } from "node:crypto";
import {
  access,
  lstat as lstat2,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";

// src/path-safety.ts
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
var PathSafetyError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "PathSafetyError";
    this.code = code;
  }
};
function isContained(root, candidate) {
  const distance = relative(root, candidate);
  return distance !== "" && distance !== ".." && !distance.startsWith(`..${sep}`) && !isAbsolute(distance);
}
function resolveContainedPath(root, child) {
  if (typeof child !== "string" || child.length === 0 || child.includes("\0")) {
    throw new PathSafetyError("PATH_OUTSIDE_SKILL_ROOT", "The operation path must name a child of the DSH skill root.");
  }
  const resolvedRoot = resolve(root);
  const candidate = resolve(resolvedRoot, child);
  if (!isContained(resolvedRoot, candidate)) {
    throw new PathSafetyError(
      "PATH_OUTSIDE_SKILL_ROOT",
      "The operation path must remain inside the DSH skill root."
    );
  }
  return candidate;
}
function assertSafeRelativePath(entry) {
  if (typeof entry !== "string" || entry.length === 0 || entry.includes("\0")) {
    throw new PathSafetyError("UNSAFE_RELATIVE_PATH", "The archive entry must be a non-empty relative path.");
  }
  const normalized = entry.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new PathSafetyError("UNSAFE_RELATIVE_PATH", "The archive entry must not be absolute.");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new PathSafetyError("UNSAFE_RELATIVE_PATH", "The archive entry contains an unsafe path segment.");
  }
  return segments.join("/");
}
function assertSafeSkillDirectoryName(name) {
  const normalized = assertSafeRelativePath(name);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new PathSafetyError("UNSAFE_RELATIVE_PATH", "The skill directory name is not a valid DSH skill name.");
  }
  return normalized;
}
async function assertExistingPathContained(root, target) {
  const [resolvedRoot, resolvedTarget] = await Promise.all([realpath(root), realpath(target)]);
  if (!isContained(resolvedRoot, resolvedTarget)) {
    throw new PathSafetyError(
      "SYMLINK_OUTSIDE_SKILL_ROOT",
      "The existing path resolves outside the DSH skill root."
    );
  }
}
async function assertNotSymbolicLink(target) {
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink()) {
    throw new PathSafetyError(
      "SYMLINK_OUTSIDE_SKILL_ROOT",
      "Symbolic links are not allowed for managed skill directories."
    );
  }
}

// src/skill-manager.ts
var MANIFEST_VERSION = 1;
var METADATA_DIRECTORY = ".noumena-luna";
var MANIFEST_FILE = "manifest.json";
var SKILL_FILE = "SKILL.md";
var SkillManagerError = class extends Error {
  constructor(code, message, status = 400, options) {
    super(message, options);
    this.code = code;
    this.status = status;
    this.name = "SkillManagerError";
  }
};
var ConfirmationRequiredError = class extends SkillManagerError {
  constructor(action = "install") {
    super(
      "CONFIRMATION_REQUIRED",
      `Confirmation is required before ${action}ing a managed skill.`,
      409
    );
    this.name = "ConfirmationRequiredError";
  }
};
var SkillManager = class {
  root;
  source;
  discover;
  constructor(options) {
    this.root = options.root;
    this.source = options.source;
    this.discover = options.discover ?? (() => {
    });
  }
  async search(query) {
    return this.source.search(query);
  }
  async listInstalled() {
    const manifest = await this.readManifest();
    const skills = await Promise.all(Object.values(manifest.skills).map(async (record) => ({
      ...record,
      exists: await this.managedPathExists(resolveContainedPath(this.root, record.directory))
    })));
    return skills.sort((left, right) => left.name.localeCompare(right.name));
  }
  async install(id, confirmed) {
    validateSkillId2(id);
    const manifest = await this.readManifest();
    const existing = manifest.skills[id];
    if (!confirmed) {
      throw new ConfirmationRequiredError(existing === void 0 ? "install" : "replace");
    }
    const remote = await this.loadRemote(id);
    const directory = existing?.directory ?? directoryFor(remote);
    const target = resolveContainedPath(this.root, directory);
    const targetExists = await this.pathExists(target);
    if (targetExists && existing === void 0) {
      throw new SkillManagerError(
        "UNMANAGED_CONFLICT",
        "A skill directory with this name exists but is not managed by this plugin.",
        409
      );
    }
    if (existing !== void 0 && targetExists) await this.assertManagedTarget(target);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const record = {
      id: remote.id,
      skillId: remote.skillId,
      name: remote.name,
      description: remote.description,
      source: remote.source,
      installs: remote.installs,
      pageUrl: remote.pageUrl,
      directory,
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
      contentHash: hashDocument(toSkillDocument(remote)),
      remoteRevision: remote.remoteRevision
    };
    await this.publish(
      target,
      toSkillDocument(remote),
      record,
      manifest,
      existing !== void 0 && targetExists ? existing : void 0
    );
    return { ...record, exists: true };
  }
  async checkUpdate(id) {
    validateSkillId2(id);
    const manifest = await this.readManifest();
    const current = manifest.skills[id];
    if (current === void 0) {
      throw new SkillManagerError("NOT_MANAGED", "The skill is not managed by this plugin.", 404);
    }
    const remote = await this.loadRemote(id);
    return {
      id,
      currentRevision: current.remoteRevision,
      latestRevision: remote.remoteRevision,
      hasUpdate: current.contentHash !== hashDocument(toSkillDocument(remote)),
      latest: remote
    };
  }
  async update(id, confirmed) {
    validateSkillId2(id);
    const manifest = await this.readManifest();
    const current = manifest.skills[id];
    if (current === void 0) {
      throw new SkillManagerError("NOT_MANAGED", "The skill is not managed by this plugin.", 404);
    }
    if (!confirmed) throw new ConfirmationRequiredError("update");
    const checked = await this.checkUpdate(id);
    if (!checked.hasUpdate) return checked;
    const remote = checked.latest;
    const updated = {
      ...current,
      skillId: remote.skillId,
      name: remote.name,
      description: remote.description,
      source: remote.source,
      installs: remote.installs,
      pageUrl: remote.pageUrl,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      contentHash: hashDocument(toSkillDocument(remote)),
      remoteRevision: remote.remoteRevision
    };
    const target = resolveContainedPath(this.root, current.directory);
    await this.assertManagedTarget(target);
    await this.publish(target, toSkillDocument(remote), updated, manifest, current);
    return {
      ...checked,
      currentRevision: updated.remoteRevision,
      latestRevision: updated.remoteRevision,
      hasUpdate: false
    };
  }
  async uninstall(id, confirmed) {
    validateSkillId2(id);
    const manifest = await this.readManifest();
    const current = manifest.skills[id];
    if (current === void 0) {
      throw new SkillManagerError("NOT_MANAGED", "The skill is not managed by this plugin.", 404);
    }
    if (!confirmed) throw new ConfirmationRequiredError("uninstall");
    const target = resolveContainedPath(this.root, current.directory);
    if (await this.pathExists(target)) await this.assertManagedTarget(target);
    const backup = resolveContainedPath(this.root, `.noumena-luna-backup-${randomToken()}`);
    const nextManifest = {
      ...manifest,
      skills: withoutSkill(manifest.skills, id)
    };
    let moved = false;
    try {
      if (await this.pathExists(target)) {
        await rename(target, backup);
        moved = true;
      }
      await this.writeManifest(nextManifest);
      await this.discover();
      if (moved) await rm(backup, { recursive: true, force: false });
    } catch (error) {
      try {
        if (moved && !await this.pathExists(target) && await this.pathExists(backup)) {
          await rename(backup, target);
        }
        await this.writeManifest(manifest);
      } catch (rollbackError) {
        throw new SkillManagerError(
          "ROLLBACK_FAILED",
          "Uninstall failed and the previous skill state could not be restored.",
          500,
          { cause: rollbackError }
        );
      }
      throw error;
    }
  }
  async publish(target, document, record, previousManifest, previousRecord) {
    await mkdir(this.root, { recursive: true });
    const staging = resolveContainedPath(this.root, `.noumena-luna-staging-${randomToken()}`);
    const backup = resolveContainedPath(this.root, `.noumena-luna-backup-${randomToken()}`);
    const nextManifest = {
      version: MANIFEST_VERSION,
      skills: { ...previousManifest.skills, [record.id]: record }
    };
    let moved = false;
    let published = false;
    try {
      await mkdir(staging, { recursive: false });
      const skillFile = resolveContainedPath(staging, SKILL_FILE);
      await writeFile(skillFile, document, { encoding: "utf8", flag: "wx" });
      if (hashDocument(await readFile(skillFile, "utf8")) !== record.contentHash) {
        throw new SkillManagerError("OPERATION_FAILED", "The staged skill content failed verification.", 500);
      }
      if (previousRecord !== void 0) {
        await rename(target, backup);
        moved = true;
      }
      await rename(staging, target);
      published = true;
      await this.writeManifest(nextManifest);
      await this.discover();
      if (moved) await rm(backup, { recursive: true, force: false });
    } catch (error) {
      try {
        if (published && await this.pathExists(target)) await rm(target, { recursive: true, force: false });
        if (moved && await this.pathExists(backup)) await rename(backup, target);
        if (await this.pathExists(staging)) await rm(staging, { recursive: true, force: false });
        await this.writeManifest(previousManifest);
      } catch (rollbackError) {
        throw new SkillManagerError(
          "ROLLBACK_FAILED",
          "The skill operation failed and the previous skill state could not be restored.",
          500,
          { cause: rollbackError }
        );
      }
      throw error;
    } finally {
      if (await this.pathExists(staging)) await rm(staging, { recursive: true, force: true });
    }
  }
  async assertManagedTarget(target) {
    await assertNotSymbolicLink(target);
    await assertExistingPathContained(this.root, target);
    const metadata = await lstat2(target);
    if (!metadata.isDirectory()) {
      throw new SkillManagerError("UNMANAGED_CONFLICT", "The managed skill target is not a directory.", 409);
    }
  }
  async loadRemote(id) {
    let remote;
    try {
      remote = await this.source.getSkill(id);
    } catch (error) {
      if (error instanceof SkillManagerError) throw error;
      throw new SkillManagerError(
        "SOURCE_UNAVAILABLE",
        "The skill source is unavailable.",
        502,
        { cause: error }
      );
    }
    if (remote.id !== id || remote.pageUrl.startsWith("https://skills.sh/") === false || remote.content.trim().length === 0) {
      throw new SkillManagerError(
        "INVALID_REMOTE_SKILL",
        "The skill source returned an invalid or incomplete skill.",
        502
      );
    }
    return remote;
  }
  async readManifest() {
    const { directory, path } = this.manifestPaths();
    try {
      if (!await this.pathExists(directory)) return emptyManifest();
      await this.assertDirectoryInsideRoot(directory);
      if (!await this.pathExists(path)) return emptyManifest();
      await assertNotSymbolicLink(path);
      await assertExistingPathContained(this.root, path);
      const raw = await readFile(path, "utf8");
      return parseManifest(raw);
    } catch (error) {
      if (isMissing(error)) return emptyManifest();
      if (error instanceof SkillManagerError) throw error;
      throw new SkillManagerError("STATE_CORRUPT", "The plugin management record could not be read.", 500, {
        cause: error
      });
    }
  }
  async writeManifest(manifest) {
    await mkdir(this.root, { recursive: true });
    const { directory, path } = this.manifestPaths();
    if (await this.pathExists(directory)) {
      await this.assertDirectoryInsideRoot(directory);
    } else {
      await mkdir(directory, { recursive: false });
      await this.assertDirectoryInsideRoot(directory);
    }
    if (await this.pathExists(path)) {
      await assertNotSymbolicLink(path);
      await assertExistingPathContained(this.root, path);
    }
    const temporary = resolveContainedPath(
      this.root,
      join(METADATA_DIRECTORY, `.manifest-${randomToken()}.tmp`)
    );
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}
`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, path);
  }
  manifestPaths() {
    const directory = resolveContainedPath(this.root, METADATA_DIRECTORY);
    return {
      directory,
      path: resolveContainedPath(this.root, join(METADATA_DIRECTORY, MANIFEST_FILE))
    };
  }
  async assertDirectoryInsideRoot(directory) {
    await assertNotSymbolicLink(directory);
    await assertExistingPathContained(this.root, directory);
    if (!(await lstat2(directory)).isDirectory()) {
      throw new SkillManagerError("STATE_CORRUPT", "The plugin metadata path is not a directory.", 500);
    }
  }
  async pathExists(path) {
    try {
      await access(path);
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }
  async managedPathExists(path) {
    try {
      await assertNotSymbolicLink(path);
      await assertExistingPathContained(this.root, path);
      return (await lstat2(path)).isDirectory();
    } catch (error) {
      if (isMissing(error) || error instanceof PathSafetyError) return false;
      throw error;
    }
  }
};
function parseManifest(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new SkillManagerError("STATE_CORRUPT", "The plugin management record is not valid JSON.", 500, {
      cause: error
    });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value) || value.version !== MANIFEST_VERSION || typeof value.skills !== "object" || value.skills === null || Array.isArray(value.skills)) {
    throw new SkillManagerError("STATE_CORRUPT", "The plugin management record has an unsupported shape.", 500);
  }
  return value;
}
function emptyManifest() {
  return { version: MANIFEST_VERSION, skills: {} };
}
function withoutSkill(skills, id) {
  const next = { ...skills };
  delete next[id];
  return next;
}
function directoryFor(remote) {
  try {
    return assertSafeSkillDirectoryName(remote.skillId);
  } catch (error) {
    throw new SkillManagerError("INVALID_REMOTE_SKILL", "The remote skill name is not safe to install.", 502, {
      cause: error
    });
  }
}
function toSkillDocument(remote) {
  directoryFor(remote);
  const description = JSON.stringify(remote.description);
  const content = remote.content.replace(/^---\s*[\s\S]*?\s*---\s*/, "").trim();
  if (content.length === 0) {
    throw new SkillManagerError("INVALID_REMOTE_SKILL", "The remote skill has no usable content.", 502);
  }
  return `---
name: ${remote.skillId}
description: ${description}
---

${content}
`;
}
function hashDocument(document) {
  return createHash2("sha256").update(document).digest("hex");
}
function randomToken() {
  return randomUUID();
}
function isMissing(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function validateSkillId2(id) {
  const segments = id.split("/");
  if (segments.length < 2 || segments.length > 8 || segments.some((segment) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)) || segments.some((segment) => segment === "." || segment === "..")) {
    throw new SkillManagerError("INVALID_SKILL_ID", "The skill identifier is invalid.", 400);
  }
}

// src/index.ts
var API_PREFIX = "/api/noumena-luna";
function apply(ctx) {
  ctx.inject(["webServer"], (webCtx) => {
    const source = new SkillsShClient();
    const manager = new SkillManager({
      root: dshHomePath("skills"),
      source,
      discover: () => ctx.emit("skills/change")
    });
    const dispose = webCtx.webServer.register({
      kind: "prefix",
      path: API_PREFIX,
      handler: (request, response) => handleApiRequest(request, response, manager, ctx)
    });
    webCtx.effect(() => dispose, "noumena-luna: API routes");
  });
}
async function handleApiRequest(request, response, manager, ctx) {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = url.pathname.slice(API_PREFIX.length);
    if (request.method === "GET" && path === "/skills/search") {
      const query = url.searchParams.get("q") ?? "";
      return sendJson(response, 200, { data: { skills: await manager.search(query) } });
    }
    if (request.method === "GET" && path === "/skills/installed") {
      return sendJson(response, 200, { data: { skills: await manager.listInstalled() } });
    }
    if (request.method === "POST" && path === "/skills/install") {
      const body = await actionBody(request);
      return sendJson(response, 200, { data: await manager.install(body.id, body.confirmed) });
    }
    if (request.method === "POST" && path === "/skills/check-update") {
      const body = await actionBody(request);
      return sendJson(response, 200, { data: await manager.checkUpdate(body.id) });
    }
    if (request.method === "POST" && path === "/skills/update") {
      const body = await actionBody(request);
      return sendJson(response, 200, { data: await manager.update(body.id, body.confirmed) });
    }
    if (request.method === "POST" && path === "/skills/uninstall") {
      const body = await actionBody(request);
      await manager.uninstall(body.id, body.confirmed);
      return sendJson(response, 200, { data: { ok: true } });
    }
    return sendJson(response, 404, {
      error: { code: "NOT_FOUND", message: "The requested Skill Manager endpoint does not exist." }
    });
  } catch (error) {
    const failure = publicFailure(error);
    if (failure.status >= 500) {
      ctx?.logger.error(error instanceof Error ? error : new Error(String(error)));
    }
    return sendJson(response, failure.status, {
      error: { code: failure.code, message: failure.message }
    });
  }
}
async function actionBody(request) {
  const raw = await readBody(request);
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new SkillManagerError("OPERATION_FAILED", "The request body is not valid JSON.", 400, {
      cause: error
    });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value) || typeof value.id !== "string" || typeof value.confirmed !== "boolean") {
    throw new SkillManagerError(
      "OPERATION_FAILED",
      "The request must include a skill id and an explicit confirmation value.",
      400
    );
  }
  return {
    id: value.id,
    confirmed: value.confirmed
  };
}
async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 64 * 1024) {
      throw new SkillManagerError("OPERATION_FAILED", "The request body is too large.", 413);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function sendJson(response, status, body) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}
function publicFailure(error) {
  if (error instanceof SkillManagerError || error instanceof SkillsShError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return {
      status: 500,
      code: "INTERNAL_ERROR",
      message: "The Skill Manager could not complete the request."
    };
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "The Skill Manager could not complete the request."
  };
}
export {
  API_PREFIX,
  ConfirmationRequiredError,
  PathSafetyError,
  SkillManager,
  SkillManagerError,
  SkillsShClient,
  SkillsShError,
  apply,
  assertExistingPathContained,
  assertNotSymbolicLink,
  assertSafeRelativePath,
  assertSafeSkillDirectoryName,
  handleApiRequest,
  resolveContainedPath
};
//# sourceMappingURL=index.js.map
