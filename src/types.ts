export type SourceType = "managed" | "external";

export interface MavenInfo {
  mvnPath: string | null;
  mavenHome: string | null;
  version: string | null;
  javaVersion: string | null;
  rawOutput: string;
  source: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SettingsEntry {
  id: string;
  name: string;
  filePath: string;
  sourceType: SourceType;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsIndex {
  entries: SettingsEntry[];
  defaultSettingsId: string | null;
  userSettingsPath: string;
}

export interface SettingsDocument {
  entry: SettingsEntry;
  xml: string;
  validation: ValidationResult;
}

export interface BackupResult {
  settingsPath: string;
  backupPath: string | null;
  defaultSettingsId: string;
}

export interface BackupInfo {
  fileName: string;
  filePath: string;
  size: number;
  modifiedAt: string;
}

export interface MavenTestResult {
  success: boolean;
  command: string;
  output: string;
}

export interface MirrorConfig {
  id: string;
  name: string;
  url: string;
  mirrorOf: string;
}

export interface ProxyConfig {
  id: string;
  active: boolean;
  protocol: string;
  host: string;
  port: string;
  username: string;
  password: string;
  nonProxyHosts: string;
}

export interface ServerConfig {
  id: string;
  username: string;
  password: string;
}

export interface ProfileProperty {
  key: string;
  value: string;
}

export interface ProfileRepository {
  id: string;
  url: string;
  releases: boolean;
  snapshots: boolean;
}

export interface ProfileConfig {
  id: string;
  active: boolean;
  extraXml: string[];
  properties: ProfileProperty[];
  repositories: ProfileRepository[];
}

export interface SettingsModel {
  localRepository: string;
  interactiveMode: boolean;
  offline: boolean;
  extraXml: string[];
  pluginGroups: string[];
  mirrors: MirrorConfig[];
  proxies: ProxyConfig[];
  servers: ServerConfig[];
  profiles: ProfileConfig[];
}
