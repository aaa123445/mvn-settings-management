import { invoke } from "@tauri-apps/api/core";
import type {
  BackupInfo,
  BackupResult,
  IdeaProjectEntry,
  IdeaProjectImportResult,
  MavenInfo,
  MavenTestResult,
  MavenVersionEntry,
  MavenVersionIndex,
  SettingsDocument,
  SettingsEntry,
  SettingsIndex,
} from "./types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

function invokeClient<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!window.__TAURI_INTERNALS__) {
    return Promise.reject(new Error("请在 Tauri 客户端中使用本地功能"));
  }
  return invoke<T>(command, args);
}

export function detectMaven(): Promise<MavenInfo> {
  return invokeClient("detect_maven");
}

export function setMavenPath(path: string): Promise<MavenInfo> {
  return invokeClient("set_maven_path", { path });
}

export function listMavenVersions(): Promise<MavenVersionIndex> {
  return invokeClient("list_maven_versions");
}

export function addMavenVersion(path: string, name: string): Promise<MavenVersionEntry> {
  return invokeClient("add_maven_version", { path, name });
}

export function detectAndAddMavenVersion(): Promise<MavenVersionEntry> {
  return invokeClient("detect_and_add_maven_version");
}

export function renameMavenVersion(id: string, name: string): Promise<MavenVersionEntry> {
  return invokeClient("rename_maven_version", { id, name });
}

export function setDefaultMavenVersion(id: string): Promise<MavenVersionEntry> {
  return invokeClient("set_default_maven_version", { id });
}

export function deleteMavenVersion(id: string): Promise<void> {
  return invokeClient("delete_maven_version", { id });
}

export function listSettings(): Promise<SettingsIndex> {
  return invokeClient("list_settings");
}

export function createSettings(name: string, mode: "empty" | "default"): Promise<SettingsDocument> {
  return invokeClient("create_settings", { name, mode });
}

export function importSettings(path: string, name: string): Promise<SettingsDocument> {
  return invokeClient("import_settings", { path, name });
}

export function listIdeaProjects(): Promise<IdeaProjectEntry[]> {
  return invokeClient("list_idea_projects");
}

export function importIdeaProject(projectPath: string): Promise<IdeaProjectImportResult> {
  return invokeClient("import_idea_project", { projectPath });
}

export function saveIdeaProjectConfig(
  id: string,
  mavenVersionId: string,
  localRepository: string,
  settingsId: string,
  mavenConfig: string,
  jvmConfig: string,
): Promise<IdeaProjectEntry> {
  return invokeClient("save_idea_project_config", { id, mavenVersionId, localRepository, settingsId, mavenConfig, jvmConfig });
}

export function readSettings(id: string): Promise<SettingsDocument> {
  return invokeClient("read_settings", { id });
}

export function saveSettings(id: string, xml: string): Promise<SettingsDocument> {
  return invokeClient("save_settings", { id, xml });
}

export function renameSettings(id: string, name: string): Promise<SettingsEntry> {
  return invokeClient("rename_settings", { id, name });
}

export function duplicateSettings(id: string, name: string): Promise<SettingsDocument> {
  return invokeClient("duplicate_settings", { id, name });
}

export function setDefaultSettings(id: string): Promise<BackupResult> {
  return invokeClient("set_default_settings", { id });
}

export function deleteSettings(id: string): Promise<void> {
  return invokeClient("delete_settings", { id });
}

export function copyCommand(id: string): Promise<string> {
  return invokeClient("copy_command", { id });
}

export function listBackups(): Promise<BackupInfo[]> {
  return invokeClient("list_backups");
}

export function restoreBackup(path: string): Promise<BackupResult> {
  return invokeClient("restore_backup", { path });
}

export function testSettings(id: string): Promise<MavenTestResult> {
  return invokeClient("test_settings", { id });
}
