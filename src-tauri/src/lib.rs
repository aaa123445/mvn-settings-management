use roxmltree::Document;
use serde::{Deserialize, Serialize};
use std::{
  collections::HashSet,
  env,
  fs,
  path::{Path, PathBuf},
  process::Command,
  time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
  maven_path: Option<String>,
  default_settings_id: Option<String>,
  settings: Vec<SettingsEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MavenInfo {
  mvn_path: Option<String>,
  maven_home: Option<String>,
  version: Option<String>,
  java_version: Option<String>,
  raw_output: String,
  source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
  valid: bool,
  errors: Vec<String>,
  warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsEntry {
  id: String,
  name: String,
  file_path: String,
  source_type: String,
  is_default: bool,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsIndex {
  entries: Vec<SettingsEntry>,
  default_settings_id: Option<String>,
  user_settings_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDocument {
  entry: SettingsEntry,
  xml: String,
  validation: ValidationResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
  settings_path: String,
  backup_path: Option<String>,
  default_settings_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
  file_name: String,
  file_path: String,
  size: u64,
  modified_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MavenTestResult {
  success: bool,
  command: String,
  output: String,
}

#[tauri::command]
fn detect_maven() -> Result<MavenInfo, String> {
  let config = load_config()?;
  let candidates = maven_candidates(config.maven_path.as_deref());
  for (path, source) in candidates {
    if let Ok(info) = run_maven_version(&path, &source) {
      return Ok(info);
    }
  }
  Err("未找到可用 Maven，请手动设置 Maven home 或 mvn 路径".to_string())
}

#[tauri::command]
fn set_maven_path(path: String) -> Result<MavenInfo, String> {
  let mvn_path = resolve_maven_input(&path)?;
  let info = run_maven_version(&mvn_path, "manual")?;
  let mut config = load_config()?;
  config.maven_path = Some(mvn_path.to_string_lossy().to_string());
  save_config(&config)?;
  Ok(info)
}

#[tauri::command]
fn list_settings() -> Result<SettingsIndex, String> {
  let config = load_config()?;
  Ok(index_from_config(config))
}

#[tauri::command]
fn create_settings(name: String, mode: String) -> Result<SettingsDocument, String> {
  ensure_app_dirs()?;
  let mut config = load_config()?;
  let id = make_id(&name);
  let now = now_stamp();
  let file_path = settings_dir()?.join(format!("{id}.xml"));
  let xml = if mode == "default" && user_settings_path().exists() {
    fs::read_to_string(user_settings_path()).map_err(|error| format!("读取默认 settings 失败：{error}"))?
  } else {
    empty_settings_xml()
  };
  let validation = validate_settings_xml(&xml);
  if !validation.errors.is_empty() {
    return Err(validation.errors.join("；"));
  }
  fs::write(&file_path, &xml).map_err(|error| format!("写入 settings 文件失败：{error}"))?;

  let entry = SettingsEntry {
    id,
    name: normalize_name(&name),
    file_path: file_path.to_string_lossy().to_string(),
    source_type: "managed".to_string(),
    is_default: false,
    created_at: now.clone(),
    updated_at: now,
  };
  config.settings.push(entry.clone());
  save_config(&config)?;
  Ok(SettingsDocument {
    entry,
    xml,
    validation,
  })
}

#[tauri::command]
fn import_settings(path: String, name: String) -> Result<SettingsDocument, String> {
  let file_path = expand_tilde(&path);
  if !file_path.exists() {
    return Err("settings 文件不存在".to_string());
  }
  let xml = fs::read_to_string(&file_path).map_err(|error| format!("读取 settings 文件失败：{error}"))?;
  let validation = validate_settings_xml(&xml);
  if !validation.errors.is_empty() {
    return Err(validation.errors.join("；"));
  }

  let mut config = load_config()?;
  let default_name = file_stem(&file_path);
  let id_source = if name.trim().is_empty() { default_name.as_str() } else { &name };
  let id = make_id(id_source);
  let now = now_stamp();
  let entry = SettingsEntry {
    id,
    name: if name.trim().is_empty() { file_stem(&file_path) } else { normalize_name(&name) },
    file_path: absolute_path(&file_path).to_string_lossy().to_string(),
    source_type: "external".to_string(),
    is_default: false,
    created_at: now.clone(),
    updated_at: now,
  };
  config.settings.push(entry.clone());
  save_config(&config)?;
  Ok(SettingsDocument {
    entry,
    xml,
    validation,
  })
}

#[tauri::command]
fn read_settings(id: String) -> Result<SettingsDocument, String> {
  let config = load_config()?;
  let entry = find_entry(&config, &id)?;
  let xml = fs::read_to_string(&entry.file_path).map_err(|error| format!("读取 settings 文件失败：{error}"))?;
  let validation = validate_settings_xml(&xml);
  Ok(SettingsDocument {
    entry,
    xml,
    validation,
  })
}

#[tauri::command]
fn save_settings(id: String, xml: String) -> Result<SettingsDocument, String> {
  let validation = validate_settings_xml(&xml);
  if !validation.errors.is_empty() {
    return Err(validation.errors.join("；"));
  }

  let mut config = load_config()?;
  let entry = config
    .settings
    .iter_mut()
    .find(|entry| entry.id == id)
    .ok_or_else(|| "未找到 settings 配置".to_string())?;
  fs::write(&entry.file_path, &xml).map_err(|error| format!("保存 settings 文件失败：{error}"))?;
  entry.updated_at = now_stamp();
  let saved_entry = entry.clone();
  save_config(&config)?;
  Ok(SettingsDocument {
    entry: saved_entry,
    xml,
    validation,
  })
}

#[tauri::command]
fn rename_settings(id: String, name: String) -> Result<SettingsEntry, String> {
  let next_name = normalize_name(&name);
  let mut config = load_config()?;
  let entry = config
    .settings
    .iter_mut()
    .find(|entry| entry.id == id)
    .ok_or_else(|| "未找到 settings 配置".to_string())?;
  entry.name = next_name;
  entry.updated_at = now_stamp();
  let saved_entry = entry.clone();
  save_config(&config)?;
  Ok(saved_entry)
}

#[tauri::command]
fn duplicate_settings(id: String, name: String) -> Result<SettingsDocument, String> {
  ensure_app_dirs()?;
  let mut config = load_config()?;
  let source = find_entry(&config, &id)?;
  let xml = fs::read_to_string(&source.file_path).map_err(|error| format!("读取 settings 文件失败：{error}"))?;
  let validation = validate_settings_xml(&xml);
  if !validation.errors.is_empty() {
    return Err(validation.errors.join("；"));
  }

  let next_name = normalize_name(&name);
  let new_id = make_id(&next_name);
  let file_path = settings_dir()?.join(format!("{new_id}.xml"));
  fs::write(&file_path, &xml).map_err(|error| format!("写入 settings 副本失败：{error}"))?;

  let now = now_stamp();
  let entry = SettingsEntry {
    id: new_id,
    name: next_name,
    file_path: file_path.to_string_lossy().to_string(),
    source_type: "managed".to_string(),
    is_default: false,
    created_at: now.clone(),
    updated_at: now,
  };
  config.settings.push(entry.clone());
  save_config(&config)?;
  Ok(SettingsDocument {
    entry,
    xml,
    validation,
  })
}

#[tauri::command]
fn set_default_settings(id: String) -> Result<BackupResult, String> {
  let mut config = load_config()?;
  let entry = find_entry(&config, &id)?;
  let xml = fs::read_to_string(&entry.file_path).map_err(|error| format!("读取 settings 文件失败：{error}"))?;
  let validation = validate_settings_xml(&xml);
  if !validation.errors.is_empty() {
    return Err(validation.errors.join("；"));
  }

  let target = user_settings_path();
  if let Some(parent) = target.parent() {
    fs::create_dir_all(parent).map_err(|error| format!("创建 .m2 目录失败：{error}"))?;
  }

  let backup_path = if target.exists() {
    fs::create_dir_all(backups_dir()?).map_err(|error| format!("创建备份目录失败：{error}"))?;
    let backup = backups_dir()?.join(format!("settings-{}.xml", now_stamp()));
    fs::copy(&target, &backup).map_err(|error| format!("备份默认 settings 失败：{error}"))?;
    Some(backup.to_string_lossy().to_string())
  } else {
    None
  };

  fs::write(&target, xml).map_err(|error| format!("写入默认 settings 失败：{error}"))?;
  config.default_settings_id = Some(id.clone());
  for item in &mut config.settings {
    item.is_default = item.id == id;
  }
  save_config(&config)?;

  Ok(BackupResult {
    settings_path: target.to_string_lossy().to_string(),
    backup_path,
    default_settings_id: id,
  })
}

#[tauri::command]
fn list_backups() -> Result<Vec<BackupInfo>, String> {
  ensure_app_dirs()?;
  let mut backups = Vec::new();
  for item in fs::read_dir(backups_dir()?).map_err(|error| format!("读取备份目录失败：{error}"))? {
    let item = item.map_err(|error| format!("读取备份文件失败：{error}"))?;
    let path = item.path();
    if !path.is_file() {
      continue;
    }
    let metadata = item.metadata().map_err(|error| format!("读取备份元数据失败：{error}"))?;
    backups.push(BackupInfo {
      file_name: path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("settings-backup.xml")
        .to_string(),
      file_path: path.to_string_lossy().to_string(),
      size: metadata.len(),
      modified_at: metadata
        .modified()
        .ok()
        .and_then(system_time_stamp)
        .unwrap_or_else(|| "0".to_string()),
    });
  }
  backups.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
  Ok(backups)
}

#[tauri::command]
fn restore_backup(path: String) -> Result<BackupResult, String> {
  ensure_app_dirs()?;
  let backup_path = absolute_path(&expand_tilde(&path));
  if !backup_path.exists() {
    return Err("备份文件不存在".to_string());
  }
  if !is_inside(&backup_path, &backups_dir()?) {
    return Err("只能恢复应用备份目录中的 settings 文件".to_string());
  }
  let validation = validate_settings_xml(
    &fs::read_to_string(&backup_path).map_err(|error| format!("读取备份文件失败：{error}"))?,
  );
  if !validation.errors.is_empty() {
    return Err(validation.errors.join("；"));
  }

  let target = user_settings_path();
  if let Some(parent) = target.parent() {
    fs::create_dir_all(parent).map_err(|error| format!("创建 .m2 目录失败：{error}"))?;
  }
  let rollback_path = if target.exists() {
    let rollback = backups_dir()?.join(format!("settings-before-restore-{}.xml", now_stamp()));
    fs::copy(&target, &rollback).map_err(|error| format!("备份当前默认 settings 失败：{error}"))?;
    Some(rollback.to_string_lossy().to_string())
  } else {
    None
  };
  fs::copy(&backup_path, &target).map_err(|error| format!("恢复默认 settings 失败：{error}"))?;
  let config = load_config()?;
  Ok(BackupResult {
    settings_path: target.to_string_lossy().to_string(),
    backup_path: rollback_path,
    default_settings_id: config.default_settings_id.unwrap_or_default(),
  })
}

#[tauri::command]
fn delete_settings(id: String) -> Result<(), String> {
  let mut config = load_config()?;
  let index = config
    .settings
    .iter()
    .position(|entry| entry.id == id)
    .ok_or_else(|| "未找到 settings 配置".to_string())?;
  let entry = config.settings.remove(index);
  if entry.source_type == "managed" {
    let path = PathBuf::from(&entry.file_path);
    if is_inside(&path, &settings_dir()?) {
      let _ = fs::remove_file(path);
    }
  }
  if config.default_settings_id.as_deref() == Some(&id) {
    config.default_settings_id = None;
  }
  save_config(&config)
}

#[tauri::command]
fn copy_command(id: String) -> Result<String, String> {
  let config = load_config()?;
  let entry = find_entry(&config, &id)?;
  Ok(format!("mvn -s {}", quote_path(&entry.file_path)))
}

#[tauri::command]
fn test_settings(id: String) -> Result<MavenTestResult, String> {
  let config = load_config()?;
  let entry = find_entry(&config, &id)?;
  let validation = validate_settings_xml(
    &fs::read_to_string(&entry.file_path).map_err(|error| format!("读取 settings 文件失败：{error}"))?,
  );
  if !validation.errors.is_empty() {
    return Err(validation.errors.join("；"));
  }

  let maven = detect_maven()?;
  let mvn_path = maven
    .mvn_path
    .ok_or_else(|| "未找到可用 Maven，请先设置 Maven 路径".to_string())?;
  let command = format!(
    "{} -s {} --offline help:effective-settings -DskipTests",
    quote_path(&mvn_path),
    quote_path(&entry.file_path)
  );
  let output = Command::new(&mvn_path)
    .arg("-s")
    .arg(&entry.file_path)
    .arg("--offline")
    .arg("help:effective-settings")
    .arg("-DskipTests")
    .output()
    .map_err(|error| format!("执行 Maven 校验失败：{error}"))?;
  let combined = strip_ansi(&format!(
    "{}{}",
    String::from_utf8_lossy(&output.stdout),
    String::from_utf8_lossy(&output.stderr)
  ));
  Ok(MavenTestResult {
    success: output.status.success(),
    command,
    output: combined,
  })
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      detect_maven,
      set_maven_path,
      list_settings,
      create_settings,
      import_settings,
      read_settings,
      save_settings,
      rename_settings,
      duplicate_settings,
      set_default_settings,
      delete_settings,
      copy_command,
      list_backups,
      restore_backup,
      test_settings
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn maven_candidates(manual_path: Option<&str>) -> Vec<(PathBuf, String)> {
  let mut candidates = Vec::new();
  if let Some(path) = manual_path {
    if let Ok(resolved) = resolve_maven_input(path) {
      candidates.push((resolved, "manual".to_string()));
    }
  }
  for key in ["MAVEN_HOME", "M2_HOME"] {
    if let Ok(value) = env::var(key) {
      if let Ok(path) = resolve_maven_input(&value) {
        candidates.push((path, key.to_string()));
      }
    }
  }
  if let Some(paths) = env::var_os("PATH") {
    for dir in env::split_paths(&paths) {
      for name in mvn_names() {
        let candidate = dir.join(name);
        if candidate.exists() {
          candidates.push((candidate, "PATH".to_string()));
        }
      }
    }
  }
  candidates
}

fn resolve_maven_input(path: &str) -> Result<PathBuf, String> {
  let input = expand_tilde(path);
  if input.is_dir() {
    for name in mvn_names() {
      let candidate = input.join("bin").join(name);
      if candidate.exists() {
        return Ok(candidate);
      }
    }
  }
  if input.exists() {
    return Ok(input);
  }
  Err("Maven 路径不存在，需填写 Maven home 或 mvn 可执行文件路径".to_string())
}

fn mvn_names() -> Vec<&'static str> {
  if cfg!(windows) {
    vec!["mvn.cmd", "mvn.bat", "mvn"]
  } else {
    vec!["mvn"]
  }
}

fn run_maven_version(path: &Path, source: &str) -> Result<MavenInfo, String> {
  let output = Command::new(path)
    .arg("-v")
    .output()
    .map_err(|error| format!("执行 mvn -v 失败：{error}"))?;
  if !output.status.success() {
    return Err("mvn -v 执行失败".to_string());
  }
  let raw = format!(
    "{}{}",
    String::from_utf8_lossy(&output.stdout),
    String::from_utf8_lossy(&output.stderr)
  );
  let clean = strip_ansi(&raw);
  Ok(MavenInfo {
    mvn_path: Some(path.to_string_lossy().to_string()),
    maven_home: parse_prefixed_line(&clean, "Maven home:"),
    version: parse_maven_version(&clean),
    java_version: parse_prefixed_line(&clean, "Java version:"),
    raw_output: clean,
    source: source.to_string(),
  })
}

fn parse_maven_version(output: &str) -> Option<String> {
  output.lines().find_map(|line| {
    let line = line.trim();
    line.strip_prefix("Apache Maven ")
      .and_then(|rest| rest.split_whitespace().next())
      .map(ToOwned::to_owned)
  })
}

fn parse_prefixed_line(output: &str, prefix: &str) -> Option<String> {
  output
    .lines()
    .find_map(|line| line.trim().strip_prefix(prefix).map(|value| value.trim().to_string()))
}

fn validate_settings_xml(xml: &str) -> ValidationResult {
  match Document::parse(xml) {
    Ok(doc) => {
      let root = doc.root_element();
      let mut errors = Vec::new();
      let mut warnings = Vec::new();
      if root.tag_name().name() != "settings" {
        errors.push("根节点必须是 settings".to_string());
      }
      for tag in ["mirror", "server", "proxy", "profile", "repository"] {
        collect_id_warnings(&root, tag, &mut warnings);
      }
      ValidationResult {
        valid: errors.is_empty(),
        errors,
        warnings,
      }
    }
    Err(error) => ValidationResult {
      valid: false,
      errors: vec![format!("XML 格式不正确：{error}")],
      warnings: Vec::new(),
    },
  }
}

fn collect_id_warnings(root: &roxmltree::Node<'_, '_>, tag: &str, warnings: &mut Vec<String>) {
  let mut seen = HashSet::new();
  for (index, node) in root.descendants().filter(|node| node.has_tag_name(tag)).enumerate() {
    let id = child_text(&node, "id").unwrap_or_default();
    if id.trim().is_empty() {
      warnings.push(format!("{tag} 第 {} 项缺少 id", index + 1));
    } else if !seen.insert(id.clone()) {
      warnings.push(format!("{tag} 存在重复 id：{id}"));
    }
  }
}

fn child_text(node: &roxmltree::Node<'_, '_>, tag: &str) -> Option<String> {
  node.children()
    .find(|child| child.has_tag_name(tag))
    .and_then(|child| child.text())
    .map(|value| value.trim().to_string())
}

fn load_config() -> Result<AppConfig, String> {
  ensure_app_dirs()?;
  let path = config_path()?;
  if !path.exists() {
    return Ok(AppConfig::default());
  }
  let text = fs::read_to_string(&path).map_err(|error| format!("读取应用配置失败：{error}"))?;
  let mut config: AppConfig = serde_json::from_str(&text).map_err(|error| format!("解析应用配置失败：{error}"))?;
  normalize_config_defaults(&mut config);
  Ok(config)
}

fn save_config(config: &AppConfig) -> Result<(), String> {
  ensure_app_dirs()?;
  let text = serde_json::to_string_pretty(config).map_err(|error| format!("序列化应用配置失败：{error}"))?;
  fs::write(config_path()?, text).map_err(|error| format!("保存应用配置失败：{error}"))
}

fn normalize_config_defaults(config: &mut AppConfig) {
  for entry in &mut config.settings {
    entry.is_default = config.default_settings_id.as_deref() == Some(entry.id.as_str());
  }
}

fn index_from_config(mut config: AppConfig) -> SettingsIndex {
  normalize_config_defaults(&mut config);
  SettingsIndex {
    entries: config.settings,
    default_settings_id: config.default_settings_id,
    user_settings_path: user_settings_path().to_string_lossy().to_string(),
  }
}

fn find_entry(config: &AppConfig, id: &str) -> Result<SettingsEntry, String> {
  let mut entry = config
    .settings
    .iter()
    .find(|entry| entry.id == id)
    .cloned()
    .ok_or_else(|| "未找到 settings 配置".to_string())?;
  entry.is_default = config.default_settings_id.as_deref() == Some(entry.id.as_str());
  Ok(entry)
}

fn ensure_app_dirs() -> Result<(), String> {
  fs::create_dir_all(app_dir()).map_err(|error| format!("创建应用目录失败：{error}"))?;
  fs::create_dir_all(settings_dir()?).map_err(|error| format!("创建 settings 目录失败：{error}"))?;
  fs::create_dir_all(backups_dir()?).map_err(|error| format!("创建备份目录失败：{error}"))?;
  Ok(())
}

fn config_path() -> Result<PathBuf, String> {
  Ok(app_dir().join("config.json"))
}

fn settings_dir() -> Result<PathBuf, String> {
  Ok(app_dir().join("settings"))
}

fn backups_dir() -> Result<PathBuf, String> {
  Ok(app_dir().join("backups"))
}

fn app_dir() -> PathBuf {
  if cfg!(windows) {
    env::var_os("APPDATA")
      .map(PathBuf::from)
      .unwrap_or_else(|| home_dir().join("AppData").join("Roaming"))
      .join("Maven Settings Management")
  } else if cfg!(target_os = "macos") {
    home_dir().join("Library").join("Application Support").join("Maven Settings Management")
  } else {
    env::var_os("XDG_DATA_HOME")
      .map(PathBuf::from)
      .unwrap_or_else(|| home_dir().join(".local").join("share"))
      .join("maven-settings-management")
  }
}

fn user_settings_path() -> PathBuf {
  home_dir().join(".m2").join("settings.xml")
}

fn home_dir() -> PathBuf {
  env::var_os("HOME")
    .or_else(|| env::var_os("USERPROFILE"))
    .map(PathBuf::from)
    .unwrap_or_else(|| PathBuf::from("."))
}

fn expand_tilde(path: &str) -> PathBuf {
  if path == "~" {
    return home_dir();
  }
  if let Some(rest) = path.strip_prefix("~/") {
    return home_dir().join(rest);
  }
  PathBuf::from(path)
}

fn absolute_path(path: &Path) -> PathBuf {
  fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn is_inside(path: &Path, parent: &Path) -> bool {
  let path = absolute_path(path);
  let parent = absolute_path(parent);
  path.starts_with(parent)
}

fn normalize_name(name: &str) -> String {
  let value = name.trim();
  if value.is_empty() {
    "新配置".to_string()
  } else {
    value.to_string()
  }
}

fn make_id(name: &str) -> String {
  let slug: String = name
    .chars()
    .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
    .collect::<String>()
    .trim_matches('-')
    .to_string();
  format!("{}-{}", if slug.is_empty() { "settings" } else { &slug }, now_stamp())
}

fn now_stamp() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs()
    .to_string()
}

fn system_time_stamp(value: SystemTime) -> Option<String> {
  value.duration_since(UNIX_EPOCH).ok().map(|duration| duration.as_secs().to_string())
}

fn file_stem(path: &Path) -> String {
  path.file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or("settings")
    .to_string()
}

fn quote_path(path: &str) -> String {
  format!("\"{}\"", path.replace('"', "\\\""))
}

fn strip_ansi(input: &str) -> String {
  let mut output = String::new();
  let mut chars = input.chars().peekable();
  while let Some(ch) = chars.next() {
    if ch == '\u{1b}' {
      while let Some(next) = chars.next() {
        if next.is_ascii_alphabetic() {
          break;
        }
      }
    } else {
      output.push(ch);
    }
  }
  output
}

fn empty_settings_xml() -> String {
  r#"<?xml version="1.0" encoding="UTF-8"?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 https://maven.apache.org/xsd/settings-1.0.0.xsd">
  <interactiveMode>true</interactiveMode>
  <offline>false</offline>
</settings>
"#
  .to_string()
}
