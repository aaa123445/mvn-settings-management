import type {
  MirrorConfig,
  ProfileConfig,
  ProfileProperty,
  ProfileRepository,
  ProxyConfig,
  ServerConfig,
  SettingsModel,
  ValidationResult,
} from "./types";

const KNOWN_SETTINGS_CHILDREN = new Set([
  "localRepository",
  "interactiveMode",
  "offline",
  "pluginGroups",
  "servers",
  "mirrors",
  "proxies",
  "profiles",
  "activeProfiles",
]);

const KNOWN_PROFILE_CHILDREN = new Set(["id", "properties", "repositories"]);

export function createEmptySettings(): SettingsModel {
  return {
    localRepository: "",
    interactiveMode: true,
    offline: false,
    extraXml: [],
    pluginGroups: [],
    mirrors: [],
    proxies: [],
    servers: [],
    profiles: [],
  };
}

export function parseSettingsXml(xmlText: string): SettingsModel {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("XML 格式不正确");
  }

  const settings = doc.documentElement;
  if (!settings || settings.localName !== "settings") {
    throw new Error("根节点必须是 settings");
  }

  const activeProfiles = childElements(settings, "activeProfiles")
    .flatMap((node) => childElements(node, "activeProfile"))
    .map((node) => text(node))
    .filter(Boolean);

  return normalizeSettings({
    localRepository: readText(settings, "localRepository"),
    interactiveMode: readText(settings, "interactiveMode") !== "false",
    offline: readText(settings, "offline") === "true",
    extraXml: unsupportedChildXml(settings, KNOWN_SETTINGS_CHILDREN),
    pluginGroups: childElements(settings, "pluginGroups")
      .flatMap((node) => childElements(node, "pluginGroup"))
      .map((node) => text(node))
      .filter(Boolean),
    mirrors: childElements(settings, "mirrors")
      .flatMap((node) => childElements(node, "mirror"))
      .map(parseMirror),
    proxies: childElements(settings, "proxies")
      .flatMap((node) => childElements(node, "proxy"))
      .map(parseProxy),
    servers: childElements(settings, "servers")
      .flatMap((node) => childElements(node, "server"))
      .map(parseServer),
    profiles: childElements(settings, "profiles")
      .flatMap((node) => childElements(node, "profile"))
      .map((profile) => parseProfile(profile, activeProfiles)),
  });
}

export function normalizeSettings(value: Partial<SettingsModel>): SettingsModel {
  return {
    localRepository: value.localRepository || "",
    interactiveMode: value.interactiveMode !== false,
    offline: Boolean(value.offline),
    extraXml: Array.isArray(value.extraXml) ? value.extraXml : [],
    pluginGroups: Array.isArray(value.pluginGroups) ? value.pluginGroups : [],
    mirrors: Array.isArray(value.mirrors) ? value.mirrors.map(normalizeMirror) : [],
    proxies: Array.isArray(value.proxies) ? value.proxies.map(normalizeProxy) : [],
    servers: Array.isArray(value.servers) ? value.servers.map(normalizeServer) : [],
    profiles: Array.isArray(value.profiles) ? value.profiles.map(normalizeProfile) : [],
  };
}

export function buildSettingsXml(data: SettingsModel): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"',
    '          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 https://maven.apache.org/xsd/settings-1.0.0.xsd">',
  ];

  appendTextNode(lines, 1, "localRepository", data.localRepository);
  lines.push(`${indent(1)}<interactiveMode>${data.interactiveMode ? "true" : "false"}</interactiveMode>`);
  lines.push(`${indent(1)}<offline>${data.offline ? "true" : "false"}</offline>`);

  if (data.pluginGroups.length) {
    lines.push(`${indent(1)}<pluginGroups>`);
    data.pluginGroups.filter(Boolean).forEach((groupId) => appendTextNode(lines, 2, "pluginGroup", groupId));
    lines.push(`${indent(1)}</pluginGroups>`);
  }

  if (data.servers.length) {
    lines.push(`${indent(1)}<servers>`);
    data.servers.forEach((server) => {
      lines.push(`${indent(2)}<server>`);
      appendTextNode(lines, 3, "id", server.id);
      appendTextNode(lines, 3, "username", server.username);
      appendTextNode(lines, 3, "password", server.password);
      lines.push(`${indent(2)}</server>`);
    });
    lines.push(`${indent(1)}</servers>`);
  }

  if (data.mirrors.length) {
    lines.push(`${indent(1)}<mirrors>`);
    data.mirrors.forEach((mirror) => {
      lines.push(`${indent(2)}<mirror>`);
      appendTextNode(lines, 3, "id", mirror.id);
      appendTextNode(lines, 3, "name", mirror.name);
      appendTextNode(lines, 3, "url", mirror.url);
      appendTextNode(lines, 3, "mirrorOf", mirror.mirrorOf || "*");
      lines.push(`${indent(2)}</mirror>`);
    });
    lines.push(`${indent(1)}</mirrors>`);
  }

  if (data.proxies.length) {
    lines.push(`${indent(1)}<proxies>`);
    data.proxies.forEach((proxy) => {
      lines.push(`${indent(2)}<proxy>`);
      appendTextNode(lines, 3, "id", proxy.id);
      lines.push(`${indent(3)}<active>${proxy.active ? "true" : "false"}</active>`);
      appendTextNode(lines, 3, "protocol", proxy.protocol || "http");
      appendTextNode(lines, 3, "host", proxy.host);
      appendTextNode(lines, 3, "port", proxy.port);
      appendTextNode(lines, 3, "username", proxy.username);
      appendTextNode(lines, 3, "password", proxy.password);
      appendTextNode(lines, 3, "nonProxyHosts", proxy.nonProxyHosts);
      lines.push(`${indent(2)}</proxy>`);
    });
    lines.push(`${indent(1)}</proxies>`);
  }

  if (data.profiles.length) {
    lines.push(`${indent(1)}<profiles>`);
    data.profiles.forEach((profile) => {
      lines.push(`${indent(2)}<profile>`);
      appendTextNode(lines, 3, "id", profile.id);
      appendRawXml(lines, 3, profile.extraXml);
      appendProperties(lines, profile.properties);
      appendRepositories(lines, profile.repositories);
      lines.push(`${indent(2)}</profile>`);
    });
    lines.push(`${indent(1)}</profiles>`);
  }

  const activeProfiles = data.profiles.filter((profile) => profile.active && profile.id);
  if (activeProfiles.length) {
    lines.push(`${indent(1)}<activeProfiles>`);
    activeProfiles.forEach((profile) => appendTextNode(lines, 2, "activeProfile", profile.id));
    lines.push(`${indent(1)}</activeProfiles>`);
  }

  appendRawXml(lines, 1, data.extraXml);
  lines.push("</settings>");
  return `${lines.join("\n")}\n`;
}

export function validateSettingsXml(xmlText: string): ValidationResult {
  try {
    const model = parseSettingsXml(xmlText);
    return validateSettingsModel(model);
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : "XML 校验失败"],
      warnings: [],
    };
  }
}

export function validateSettingsModel(model: SettingsModel): ValidationResult {
  const warnings: string[] = [];
  collectIdWarnings("mirror", model.mirrors, warnings);
  collectIdWarnings("server", model.servers, warnings);
  collectIdWarnings("proxy", model.proxies, warnings);
  collectIdWarnings("profile", model.profiles, warnings);
  model.profiles.forEach((profile) => collectIdWarnings(`profile ${profile.id || "未命名"} repository`, profile.repositories, warnings));

  return { valid: true, errors: [], warnings };
}

function parseMirror(node: Element): MirrorConfig {
  return normalizeMirror({
    id: readText(node, "id"),
    name: readText(node, "name"),
    url: readText(node, "url"),
    mirrorOf: readText(node, "mirrorOf") || "*",
  });
}

function parseProxy(node: Element): ProxyConfig {
  return normalizeProxy({
    id: readText(node, "id"),
    active: readText(node, "active") !== "false",
    protocol: readText(node, "protocol") || "http",
    host: readText(node, "host"),
    port: readText(node, "port"),
    username: readText(node, "username"),
    password: readText(node, "password"),
    nonProxyHosts: readText(node, "nonProxyHosts"),
  });
}

function parseServer(node: Element): ServerConfig {
  return normalizeServer({
    id: readText(node, "id"),
    username: readText(node, "username"),
    password: readText(node, "password"),
  });
}

function parseProfile(node: Element, activeProfiles: string[]): ProfileConfig {
  const id = readText(node, "id");
  return normalizeProfile({
    id,
    active: activeProfiles.includes(id),
    extraXml: unsupportedChildXml(node, KNOWN_PROFILE_CHILDREN),
    properties: parseProperties(node),
    repositories: parseRepositories(node),
  });
}

function parseProperties(profile: Element): ProfileProperty[] {
  return childElements(profile, "properties")
    .flatMap((node) => Array.from(node.children))
    .map((node) => ({ key: node.localName, value: text(node) }));
}

function parseRepositories(profile: Element): ProfileRepository[] {
  return childElements(profile, "repositories")
    .flatMap((node) => childElements(node, "repository"))
    .map((repo) => ({
      id: readText(repo, "id"),
      url: readText(repo, "url"),
      releases: readText(firstChild(repo, "releases") || repo, "enabled") !== "false",
      snapshots: readText(firstChild(repo, "snapshots") || repo, "enabled") === "true",
    }));
}

function childElements(parent: Element, tagName: string): Element[] {
  return Array.from(parent.children).filter((node) => node.localName === tagName);
}

function firstChild(parent: Element, tagName: string): Element | null {
  return childElements(parent, tagName)[0] || null;
}

function readText(parent: Element, tagName: string): string {
  const node = firstChild(parent, tagName);
  return node ? text(node) : "";
}

function text(node: Element): string {
  return node.textContent?.trim() || "";
}

function normalizeMirror(value: Partial<MirrorConfig>): MirrorConfig {
  return {
    id: value.id || "",
    name: value.name || "",
    url: value.url || "",
    mirrorOf: value.mirrorOf || "*",
  };
}

function normalizeProxy(value: Partial<ProxyConfig>): ProxyConfig {
  return {
    id: value.id || "",
    active: value.active !== false,
    protocol: value.protocol || "http",
    host: value.host || "",
    port: value.port || "",
    username: value.username || "",
    password: value.password || "",
    nonProxyHosts: value.nonProxyHosts || "",
  };
}

function normalizeServer(value: Partial<ServerConfig>): ServerConfig {
  return {
    id: value.id || "",
    username: value.username || "",
    password: value.password || "",
  };
}

function normalizeProfile(value: Partial<ProfileConfig>): ProfileConfig {
  return {
    id: value.id || "",
    active: Boolean(value.active),
    extraXml: Array.isArray(value.extraXml) ? value.extraXml : [],
    properties: Array.isArray(value.properties) ? value.properties : [],
    repositories: Array.isArray(value.repositories) ? value.repositories : [],
  };
}

function appendProperties(lines: string[], properties: ProfileProperty[]): void {
  const cleanProperties = properties.filter((item) => item.key);
  if (!cleanProperties.length) return;
  lines.push(`${indent(3)}<properties>`);
  cleanProperties.forEach((item) => appendTextNode(lines, 4, item.key, item.value));
  lines.push(`${indent(3)}</properties>`);
}

function appendRepositories(lines: string[], repositories: ProfileRepository[]): void {
  if (!repositories.length) return;
  lines.push(`${indent(3)}<repositories>`);
  repositories.forEach((repo) => {
    lines.push(`${indent(4)}<repository>`);
    appendTextNode(lines, 5, "id", repo.id);
    appendTextNode(lines, 5, "url", repo.url);
    lines.push(`${indent(5)}<releases>`);
    appendTextNode(lines, 6, "enabled", repo.releases ? "true" : "false");
    lines.push(`${indent(5)}</releases>`);
    lines.push(`${indent(5)}<snapshots>`);
    appendTextNode(lines, 6, "enabled", repo.snapshots ? "true" : "false");
    lines.push(`${indent(5)}</snapshots>`);
    lines.push(`${indent(4)}</repository>`);
  });
  lines.push(`${indent(3)}</repositories>`);
}

function appendTextNode(lines: string[], level: number, tagName: string, value: string): void {
  if (value === "") return;
  lines.push(`${indent(level)}<${tagName}>${escapeXml(value)}</${tagName}>`);
}

function appendRawXml(lines: string[], level: number, fragments: string[]): void {
  fragments.filter(Boolean).forEach((fragment) => {
    const prefix = indent(level);
    fragment.split(/\r?\n/).forEach((line) => {
      if (line.trim()) {
        lines.push(`${prefix}${line}`);
      }
    });
  });
}

function unsupportedChildXml(parent: Element, knownChildren: Set<string>): string[] {
  const serializer = new XMLSerializer();
  return Array.from(parent.children)
    .filter((node) => !knownChildren.has(node.localName))
    .map((node) => serializer.serializeToString(node));
}

function collectIdWarnings(label: string, items: Array<{ id: string }>, warnings: string[]): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const id = item.id.trim();
    if (!id) {
      warnings.push(`${label} 第 ${index + 1} 项缺少 id`);
      return;
    }
    if (seen.has(id)) {
      warnings.push(`${label} 存在重复 id: ${id}`);
    }
    seen.add(id);
  });
}

function indent(level: number): string {
  return "  ".repeat(level);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
