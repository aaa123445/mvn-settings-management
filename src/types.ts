export type SourceType = "managed" | "external" | "ideaProject";

export interface MavenInfo {
  mvnPath: string | null;
  mavenHome: string | null;
  version: string | null;
  javaVersion: string | null;
  rawOutput: string;
  source: string;
}

export interface MavenVersionEntry {
  id: string;
  name: string;
  mvnPath: string;
  mavenHome: string | null;
  version: string | null;
  javaVersion: string | null;
  rawOutput: string;
  source: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MavenVersionIndex {
  entries: MavenVersionEntry[];
  defaultMavenVersionId: string | null;
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

export interface IdeaProjectEntry {
  id: string;
  name: string;
  projectPath: string;
  ideaDir: string | null;
  workspacePath: string | null;
  miscPath: string | null;
  pomPath: string | null;
  pomFiles: string[];
  mavenHome: string | null;
  mavenHomeType: string | null;
  localRepository: string | null;
  settingsPath: string | null;
  mavenConfig: string | null;
  jvmConfig: string | null;
  mavenVersionId: string | null;
  settingsId: string | null;
  importedAt: string;
  updatedAt: string;
}

export interface IdeaProjectImportResult {
  project: IdeaProjectEntry;
  settings: SettingsDocument | null;
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
