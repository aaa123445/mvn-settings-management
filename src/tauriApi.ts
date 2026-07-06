import { invoke } from "@tauri-apps/api/core";
import type { BackupInfo, BackupResult, MavenInfo, MavenTestResult, SettingsDocument, SettingsEntry, SettingsIndex } from "./types";

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

export function listSettings(): Promise<SettingsIndex> {
  return invokeClient("list_settings");
}

export function createSettings(name: string, mode: "empty" | "default"): Promise<SettingsDocument> {
  return invokeClient("create_settings", { name, mode });
}

export function importSettings(path: string, name: string): Promise<SettingsDocument> {
  return invokeClient("import_settings", { path, name });
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
