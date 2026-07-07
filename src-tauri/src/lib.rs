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
  #[serde(default)]
  maven_path: Option<String>,
  #[serde(default)]
  default_maven_version_id: Option<String>,
  #[serde(default)]
  maven_versions: Vec<MavenVersionEntry>,
  default_settings_id: Option<String>,
  #[serde(default)]
  idea_projects: Vec<IdeaProjectEntry>,
  #[serde(default)]
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
pub struct MavenVersionEntry {
  id: String,
  name: String,
  mvn_path: String,
  maven_home: Option<String>,
  version: Option<String>,
  java_version: Option<String>,
  raw_output: String,
  source: String,
  is_default: bool,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MavenVersionIndex {
  entries: Vec<MavenVersionEntry>,
  default_maven_version_id: Option<String>,
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
pub struct IdeaProjectEntry {
  id: String,
  name: String,
  project_path: String,
  idea_dir: Option<String>,
  workspace_path: Option<String>,
  misc_path: Option<String>,
  pom_path: Option<String>,
  #[serde(default)]
  pom_files: Vec<String>,
  #[serde(default)]
  maven_home: Option<String>,
  #[serde(default)]
  maven_home_type: Option<String>,
  #[serde(default)]
  local_repository: Option<String>,
  #[serde(default)]
  settings_path: Option<String>,
  maven_config: Option<String>,
  jvm_config: Option<String>,
  #[serde(default)]
  maven_version_id: Option<String>,
  settings_id: Option<String>,
  imported_at: String,
  updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeaProjectImportResult {
  project: IdeaProjectEntry,
  settings: Option<SettingsDocument>,
}

#[derive(Debug, Clone, Default)]
struct IdeaMavenMetadata {
  workspace_path: Option<String>,
  misc_path: Option<String>,
  maven_home: Option<String>,
  maven_home_type: Option<String>,
  local_repository: Option<String>,
  user_settings_file: Option<String>,
  pom_files: Vec<String>,
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
  if let Some(entry) = default_maven_version(&config) {
    return Ok(maven_info_from_entry(&entry));
  }
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
  let entry = add_or_update_maven_version(path, "".to_string(), "manual".to_string(), true)?;
  Ok(maven_info_from_entry(&entry))
}

#[tauri::command]
fn list_maven_versions() -> Result<MavenVersionIndex, String> {
  let config = load_config()?;
  save_config(&config)?;
  Ok(maven_index_from_config(config))
}

#[tauri::command]
fn add_maven_version(path: String, name: String) -> Result<MavenVersionEntry, String> {
  add_or_update_maven_version(path, name, "manual".to_string(), false)
}

#[tauri::command]
fn detect_and_add_maven_version() -> Result<MavenVersionEntry, String> {
  let config = load_config()?;
  for (path, source) in maven_candidates(config.maven_path.as_deref()) {
    if let Ok(info) = run_maven_version(&path, &source) {
      return save_maven_version_from_info(info, "".to_string(), source, false);
    }
  }
  Err("未找到可用 Maven，请手动添加 Maven home 或 mvn 路径".to_string())
}

#[tauri::command]
fn rename_maven_version(id: String, name: String) -> Result<MavenVersionEntry, String> {
  let next_name = normalize_name(&name);
  let mut config = load_config()?;
  let entry = config
    .maven_versions
    .iter_mut()
    .find(|entry| entry.id == id)
    .ok_or_else(|| "未找到 Maven 版本".to_string())?;
  entry.name = next_name;
  entry.updated_at = now_stamp();
  let saved_entry = entry.clone();
  save_config(&config)?;
  Ok(saved_entry)
}

#[tauri::command]
fn set_default_maven_version(id: String) -> Result<MavenVersionEntry, String> {
  let mut config = load_config()?;
  if !config.maven_versions.iter().any(|entry| entry.id == id) {
    return Err("未找到 Maven 版本".to_string());
  }
  config.default_maven_version_id = Some(id.clone());
  normalize_config_defaults(&mut config);
  let entry = config
    .maven_versions
    .iter()
    .find(|entry| entry.id == id)
    .cloned()
    .ok_or_else(|| "未找到 Maven 版本".to_string())?;
  save_config(&config)?;
  Ok(entry)
}

#[tauri::command]
fn delete_maven_version(id: String) -> Result<(), String> {
  let mut config = load_config()?;
  let index = config
    .maven_versions
    .iter()
    .position(|entry| entry.id == id)
    .ok_or_else(|| "未找到 Maven 版本".to_string())?;
  config.maven_versions.remove(index);
  if config.default_maven_version_id.as_deref() == Some(&id) {
    config.default_maven_version_id = config.maven_versions.first().map(|entry| entry.id.clone());
  }
  for project in &mut config.idea_projects {
    if project.maven_version_id.as_deref() == Some(&id) {
      project.maven_version_id = None;
      project.updated_at = now_stamp();
    }
  }
  normalize_config_defaults(&mut config);
  save_config(&config)
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
    file_path: path_to_display_string(&file_path),
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
  let target_path = settings_dir()?.join(format!("{id}.xml"));
  fs::write(&target_path, &xml).map_err(|error| format!("写入 settings 文件失败：{error}"))?;
  let entry = SettingsEntry {
    id,
    name: if name.trim().is_empty() { file_stem(&file_path) } else { normalize_name(&name) },
    file_path: path_to_display_string(&target_path),
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
fn list_idea_projects() -> Result<Vec<IdeaProjectEntry>, String> {
  let mut config = load_config()?;
  refresh_idea_projects_from_disk(&mut config)?;
  save_config(&config)?;
  Ok(config.idea_projects)
}

#[tauri::command]
fn import_idea_project(project_path: String) -> Result<IdeaProjectImportResult, String> {
  ensure_app_dirs()?;
  let project_root = absolute_path(&expand_tilde(&project_path));
  if !project_root.is_dir() {
    return Err("IDEA 项目目录不存在".to_string());
  }

  let idea_dir = project_root.join(".idea");
  let pom_path = project_root.join("pom.xml");
  let mvn_dir = project_root.join(".mvn");
  if !idea_dir.is_dir() && !pom_path.is_file() && !mvn_dir.is_dir() {
    return Err("请选择包含 .idea、pom.xml 或 .mvn 的项目根目录".to_string());
  }

  let project_name = dir_name(&project_root);
  let maven_config = read_optional_text(&mvn_dir.join("maven.config"))?;
  let jvm_config = read_optional_text(&mvn_dir.join("jvm.config"))?;
  let idea_metadata = read_idea_maven_metadata(&project_root)?;
  let settings_source = idea_metadata
    .user_settings_file
    .as_deref()
    .map(PathBuf::from)
    .filter(|path| path.is_file())
    .or_else(|| find_project_settings_path(&project_root));
  let project_settings_path = settings_source.as_ref().map(|path| absolute_path_string(path));
  let now = now_stamp();
  let mut config = load_config()?;
  let existing_index = config
    .idea_projects
    .iter()
    .position(|project| absolute_path(Path::new(&project.project_path)) == project_root);
  let existing_project = existing_index.and_then(|index| config.idea_projects.get(index).cloned());
  let existing_settings_id = existing_project.as_ref().and_then(|project| project.settings_id.clone());
  let existing_maven_version_id = existing_project.as_ref().and_then(|project| project.maven_version_id.clone());
  let mut linked_settings_id = existing_settings_id.clone();
  let mut imported_settings = None;

  if let Some(settings_path) = settings_source {
    let xml = fs::read_to_string(&settings_path).map_err(|error| format!("读取项目 settings 失败：{error}"))?;
    let validation = validate_settings_xml(&xml);
    if !validation.errors.is_empty() {
      return Err(validation.errors.join("；"));
    }

    let settings_id = existing_settings_id
      .filter(|id| config.settings.iter().any(|entry| entry.id == *id))
      .unwrap_or_else(|| make_id(&format!("{project_name}-idea-settings")));
    let target_path = settings_dir()?.join(format!("{settings_id}.xml"));
    fs::write(&target_path, &xml).map_err(|error| format!("写入 IDEA 项目 settings 副本失败：{error}"))?;

    let settings_name = format!("{project_name} IDEA settings");
    let saved_entry = if let Some(entry) = config.settings.iter_mut().find(|entry| entry.id == settings_id) {
      entry.name = settings_name;
      entry.file_path = path_to_display_string(&target_path);
      entry.source_type = "managed".to_string();
      entry.updated_at = now.clone();
      entry.clone()
    } else {
      let entry = SettingsEntry {
        id: settings_id.clone(),
        name: settings_name,
        file_path: path_to_display_string(&target_path),
        source_type: "managed".to_string(),
        is_default: false,
        created_at: now.clone(),
        updated_at: now.clone(),
      };
      config.settings.push(entry.clone());
      entry
    };

    linked_settings_id = Some(settings_id);
    imported_settings = Some(SettingsDocument {
      entry: saved_entry,
      xml,
      validation,
    });
  }

  let linked_maven_version_id = valid_or_matched_maven_version_id(&config, existing_maven_version_id, &idea_metadata.maven_home);
  let project = IdeaProjectEntry {
    id: existing_project
      .as_ref()
      .map(|project| project.id.clone())
      .unwrap_or_else(|| make_id(&project_name)),
    name: project_name,
    project_path: path_to_display_string(&project_root),
    idea_dir: path_if_dir(&idea_dir),
    workspace_path: idea_metadata.workspace_path,
    misc_path: idea_metadata.misc_path,
    pom_path: path_if_file(&pom_path),
    pom_files: idea_metadata.pom_files,
    maven_home: idea_metadata.maven_home,
    maven_home_type: idea_metadata.maven_home_type,
    local_repository: idea_metadata.local_repository,
    settings_path: project_settings_path.or_else(|| existing_project.as_ref().and_then(|project| project.settings_path.clone())),
    maven_config,
    jvm_config,
    maven_version_id: linked_maven_version_id,
    settings_id: linked_settings_id,
    imported_at: existing_project
      .as_ref()
      .map(|project| project.imported_at.clone())
      .unwrap_or_else(|| now.clone()),
    updated_at: now,
  };

  if let Some(index) = existing_index {
    config.idea_projects[index] = project.clone();
  } else {
    config.idea_projects.push(project.clone());
  }
  save_config(&config)?;
  Ok(IdeaProjectImportResult {
    project,
    settings: imported_settings,
  })
}

#[tauri::command]
fn save_idea_project_config(
  id: String,
  maven_version_id: String,
  local_repository: String,
  settings_id: String,
  maven_config: String,
  jvm_config: String,
) -> Result<IdeaProjectEntry, String> {
  let mut config = load_config()?;
  let index = config
    .idea_projects
    .iter()
    .position(|project| project.id == id)
    .ok_or_else(|| "未找到 IDEA 项目配置".to_string())?;
  let project_root = absolute_path(Path::new(&config.idea_projects[index].project_path));
  if !project_root.is_dir() {
    return Err("IDEA 项目目录不存在，无法写回项目级 Maven 配置".to_string());
  }

  let mvn_dir = project_root.join(".mvn");
  let saved_maven_config = write_optional_project_text(&mvn_dir.join("maven.config"), &maven_config)?;
  let saved_jvm_config = write_optional_project_text(&mvn_dir.join("jvm.config"), &jvm_config)?;
  let selected_maven_version_id = if maven_version_id.trim().is_empty() {
    None
  } else {
    Some(maven_version_id.trim().to_string())
  };
  let selected_maven_entry = selected_maven_version_id
    .as_deref()
    .map(|id| find_maven_version(&config, id))
    .transpose()?;
  let saved_maven_home = selected_maven_entry
    .as_ref()
    .map(maven_home_for_entry)
    .transpose()?;
  let saved_local_repository = normalize_optional_path(&local_repository);
  let selected_settings_id = if settings_id.trim().is_empty() { None } else { Some(settings_id.trim().to_string()) };
  let saved_settings_path = if let Some(settings_id) = selected_settings_id.as_deref() {
    Some(write_global_settings_to_project(&config, settings_id, &mvn_dir)?)
  } else {
    None
  };
  let (workspace_path, maven_home_type) = save_idea_maven_general_settings(
    &project_root,
    saved_maven_home.as_deref(),
    saved_local_repository.as_deref(),
    saved_settings_path.as_deref(),
  )?;
  let project = &mut config.idea_projects[index];
  project.workspace_path = Some(workspace_path);
  project.maven_home = saved_maven_home;
  project.maven_home_type = maven_home_type;
  project.local_repository = saved_local_repository;
  project.settings_path = saved_settings_path;
  project.maven_config = saved_maven_config;
  project.jvm_config = saved_jvm_config;
  project.maven_version_id = selected_maven_version_id;
  project.settings_id = selected_settings_id;
  project.updated_at = now_stamp();
  let saved_project = project.clone();
  save_config(&config)?;
  Ok(saved_project)
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
  let entry_index = config
    .settings
    .iter()
    .position(|entry| entry.id == id)
    .ok_or_else(|| "未找到 settings 配置".to_string())?;
  let entry_path = config.settings[entry_index].file_path.clone();
  let project_settings_target = if config.settings[entry_index].source_type == "ideaProject" {
    config
      .idea_projects
      .iter()
      .position(|project| project.settings_id.as_deref() == Some(&id))
      .map(|project_index| project_settings_target(&config.idea_projects[project_index]).map(|path| (project_index, path)))
      .transpose()?
  } else {
    None
  };

  fs::write(&entry_path, &xml).map_err(|error| format!("保存 settings 文件失败：{error}"))?;
  if let Some((project_index, target_path)) = project_settings_target {
    if let Some(parent) = target_path.parent() {
      fs::create_dir_all(parent).map_err(|error| format!("创建项目 .mvn 目录失败：{error}"))?;
    }
    fs::write(&target_path, &xml).map_err(|error| format!("写回 IDEA 项目 settings 失败：{error}"))?;
    config.idea_projects[project_index].settings_path = Some(path_to_display_string(&target_path));
    config.idea_projects[project_index].updated_at = now_stamp();
  }

  let entry = config
    .settings
    .get_mut(entry_index)
    .ok_or_else(|| "未找到 settings 配置".to_string())?;
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
    file_path: path_to_display_string(&file_path),
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
    Some(path_to_display_string(&backup))
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
    settings_path: path_to_display_string(&target),
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
      file_path: path_to_display_string(&path),
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
    Some(path_to_display_string(&rollback))
  } else {
    None
  };
  fs::copy(&backup_path, &target).map_err(|error| format!("恢复默认 settings 失败：{error}"))?;
  let config = load_config()?;
  Ok(BackupResult {
    settings_path: path_to_display_string(&target),
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
  for project in &mut config.idea_projects {
    if project.settings_id.as_deref() == Some(&id) {
      project.settings_id = None;
      project.updated_at = now_stamp();
    }
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

  let mvn_path = default_maven_version(&config)
    .map(|entry| entry.mvn_path)
    .or_else(|| detect_maven().ok().and_then(|info| info.mvn_path))
    .ok_or_else(|| "未找到可用 Maven，请先在全局配置中添加 Maven 版本".to_string())?;
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
      list_maven_versions,
      add_maven_version,
      detect_and_add_maven_version,
      rename_maven_version,
      set_default_maven_version,
      delete_maven_version,
      list_settings,
      create_settings,
      import_settings,
      list_idea_projects,
      import_idea_project,
      save_idea_project_config,
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

fn add_or_update_maven_version(path: String, name: String, source: String, set_default: bool) -> Result<MavenVersionEntry, String> {
  let mvn_path = resolve_maven_input(&path)?;
  let info = run_maven_version(&mvn_path, &source)?;
  save_maven_version_from_info(info, name, source, set_default)
}

fn save_maven_version_from_info(
  info: MavenInfo,
  name: String,
  source: String,
  set_default: bool,
) -> Result<MavenVersionEntry, String> {
  let mut config = load_config()?;
  let now = now_stamp();
  let mvn_path = info
    .mvn_path
    .clone()
    .ok_or_else(|| "未识别 mvn 可执行文件路径".to_string())?;
  let maven_home = info.maven_home.clone().or_else(|| infer_maven_home(Path::new(&mvn_path)));
  let next_name = normalize_maven_name(&name, info.version.as_deref(), maven_home.as_deref(), &source);
  let existing_index = config.maven_versions.iter().position(|entry| same_path(&entry.mvn_path, &mvn_path));
  let should_default = set_default || config.default_maven_version_id.is_none() || config.maven_versions.is_empty();

  let entry = if let Some(index) = existing_index {
    let entry = config
      .maven_versions
      .get_mut(index)
      .ok_or_else(|| "未找到 Maven 版本".to_string())?;
    entry.name = next_name;
    entry.mvn_path = mvn_path;
    entry.maven_home = maven_home;
    entry.version = info.version;
    entry.java_version = info.java_version;
    entry.raw_output = info.raw_output;
    entry.source = source;
    entry.updated_at = now;
    entry.clone()
  } else {
    let entry = MavenVersionEntry {
      id: make_id(&next_name),
      name: next_name,
      mvn_path,
      maven_home,
      version: info.version,
      java_version: info.java_version,
      raw_output: info.raw_output,
      source,
      is_default: false,
      created_at: now.clone(),
      updated_at: now,
    };
    config.maven_versions.push(entry.clone());
    entry
  };

  if should_default {
    config.default_maven_version_id = Some(entry.id.clone());
  }
  config.maven_path = Some(entry.mvn_path.clone());
  normalize_config_defaults(&mut config);
  let saved_entry = config
    .maven_versions
    .iter()
    .find(|item| item.id == entry.id)
    .cloned()
    .ok_or_else(|| "保存 Maven 版本失败".to_string())?;
  save_config(&config)?;
  Ok(saved_entry)
}

fn normalize_maven_name(name: &str, version: Option<&str>, maven_home: Option<&str>, source: &str) -> String {
  let value = name.trim();
  if !value.is_empty() {
    return value.to_string();
  }
  if let Some(version) = version {
    return format!("Maven {version}");
  }
  if let Some(home) = maven_home {
    return format!("Maven {}", dir_name(Path::new(home)));
  }
  format!("Maven {source}")
}

fn maven_info_from_entry(entry: &MavenVersionEntry) -> MavenInfo {
  MavenInfo {
    mvn_path: Some(entry.mvn_path.clone()),
    maven_home: entry.maven_home.clone(),
    version: entry.version.clone(),
    java_version: entry.java_version.clone(),
    raw_output: entry.raw_output.clone(),
    source: entry.source.clone(),
  }
}

fn maven_index_from_config(mut config: AppConfig) -> MavenVersionIndex {
  normalize_config_defaults(&mut config);
  MavenVersionIndex {
    entries: config.maven_versions,
    default_maven_version_id: config.default_maven_version_id,
  }
}

fn find_maven_version(config: &AppConfig, id: &str) -> Result<MavenVersionEntry, String> {
  config
    .maven_versions
    .iter()
    .find(|entry| entry.id == id)
    .cloned()
    .ok_or_else(|| "未找到 Maven 版本".to_string())
}

fn default_maven_version(config: &AppConfig) -> Option<MavenVersionEntry> {
  config
    .default_maven_version_id
    .as_deref()
    .and_then(|id| config.maven_versions.iter().find(|entry| entry.id == id))
    .or_else(|| config.maven_versions.iter().find(|entry| entry.is_default))
    .or_else(|| config.maven_versions.first())
    .cloned()
}

fn maven_home_for_entry(entry: &MavenVersionEntry) -> Result<String, String> {
  entry
    .maven_home
    .clone()
    .or_else(|| infer_maven_home(Path::new(&entry.mvn_path)))
    .ok_or_else(|| format!("Maven 版本 \"{}\" 未识别 Maven Home", entry.name))
}

fn infer_maven_home(mvn_path: &Path) -> Option<String> {
  let bin_dir = mvn_path.parent()?;
  if bin_dir
    .file_name()
    .and_then(|value| value.to_str())
    .is_some_and(|name| name.eq_ignore_ascii_case("bin"))
  {
    return bin_dir.parent().map(absolute_path_string);
  }
  None
}

fn valid_or_matched_maven_version_id(config: &AppConfig, existing_id: Option<String>, maven_home: &Option<String>) -> Option<String> {
  if existing_id
    .as_ref()
    .is_some_and(|id| config.maven_versions.iter().any(|entry| entry.id == *id))
  {
    return existing_id;
  }
  let maven_home = maven_home.as_deref()?;
  config
    .maven_versions
    .iter()
    .find(|entry| {
      entry
        .maven_home
        .as_deref()
        .is_some_and(|entry_home| same_path(entry_home, maven_home))
    })
    .map(|entry| entry.id.clone())
}

fn same_path(left: &str, right: &str) -> bool {
  absolute_path(&expand_tilde(left)) == absolute_path(&expand_tilde(right))
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
    mvn_path: Some(path_to_display_string(path)),
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
  migrate_legacy_maven_path(config);
  normalize_config_paths(config);
  if config.default_maven_version_id.is_none() {
    config.default_maven_version_id = config.maven_versions.first().map(|entry| entry.id.clone());
  }
  let default_maven_version_id = config.default_maven_version_id.clone();
  for entry in &mut config.maven_versions {
    entry.is_default = default_maven_version_id.as_deref() == Some(entry.id.as_str());
  }
  for entry in &mut config.settings {
    entry.is_default = config.default_settings_id.as_deref() == Some(entry.id.as_str());
  }
  let settings_ids: HashSet<String> = config.settings.iter().map(|entry| entry.id.clone()).collect();
  let maven_version_ids: HashSet<String> = config.maven_versions.iter().map(|entry| entry.id.clone()).collect();
  for project in &mut config.idea_projects {
    if project
      .maven_version_id
      .as_ref()
      .is_some_and(|maven_version_id| !maven_version_ids.contains(maven_version_id))
    {
      project.maven_version_id = None;
    }
    if project
      .settings_id
      .as_ref()
      .is_some_and(|settings_id| !settings_ids.contains(settings_id))
    {
      project.settings_id = None;
    }
  }
}

fn normalize_config_paths(config: &mut AppConfig) {
  normalize_optional_path_value(&mut config.maven_path);
  for entry in &mut config.maven_versions {
    normalize_path_value(&mut entry.mvn_path);
    normalize_optional_path_value(&mut entry.maven_home);
  }
  for entry in &mut config.settings {
    normalize_path_value(&mut entry.file_path);
  }
  for project in &mut config.idea_projects {
    normalize_path_value(&mut project.project_path);
    normalize_optional_path_value(&mut project.idea_dir);
    normalize_optional_path_value(&mut project.workspace_path);
    normalize_optional_path_value(&mut project.misc_path);
    normalize_optional_path_value(&mut project.pom_path);
    normalize_optional_path_value(&mut project.maven_home);
    normalize_optional_path_value(&mut project.local_repository);
    normalize_optional_path_value(&mut project.settings_path);
    for pom_file in &mut project.pom_files {
      normalize_path_value(pom_file);
    }
  }
}

fn normalize_optional_path_value(value: &mut Option<String>) {
  if let Some(path) = value {
    normalize_path_value(path);
  }
}

fn normalize_path_value(value: &mut String) {
  let normalized = normalize_windows_verbatim_path(value);
  if normalized != *value {
    *value = normalized;
  }
}

fn migrate_legacy_maven_path(config: &mut AppConfig) {
  if !config.maven_versions.is_empty() {
    return;
  }
  let Some(path) = config.maven_path.clone() else {
    return;
  };
  let Ok(mvn_path) = resolve_maven_input(&path) else {
    return;
  };
  let Ok(info) = run_maven_version(&mvn_path, "manual") else {
    return;
  };
  let now = now_stamp();
  let maven_home = info.maven_home.clone().or_else(|| infer_maven_home(&mvn_path));
  let name = normalize_maven_name("", info.version.as_deref(), maven_home.as_deref(), "manual");
  let entry = MavenVersionEntry {
    id: make_id(&name),
    name,
    mvn_path: path_to_display_string(&mvn_path),
    maven_home,
    version: info.version,
    java_version: info.java_version,
    raw_output: info.raw_output,
    source: "manual".to_string(),
    is_default: true,
    created_at: now.clone(),
    updated_at: now,
  };
  config.default_maven_version_id = Some(entry.id.clone());
  config.maven_versions.push(entry);
}

fn index_from_config(mut config: AppConfig) -> SettingsIndex {
  normalize_config_defaults(&mut config);
  SettingsIndex {
    entries: config.settings,
    default_settings_id: config.default_settings_id,
    user_settings_path: path_to_display_string(&user_settings_path()),
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

fn absolute_path_string(path: &Path) -> String {
  path_to_display_string(&absolute_path(path))
}

fn path_to_display_string(path: &Path) -> String {
  normalize_windows_verbatim_path(&path.to_string_lossy())
}

fn normalize_windows_verbatim_path(value: &str) -> String {
  if let Some(rest) = value.strip_prefix("\\\\?\\UNC\\") {
    format!("\\\\{rest}")
  } else if let Some(rest) = value.strip_prefix("\\\\?\\") {
    rest.to_string()
  } else {
    value.to_string()
  }
}

#[cfg(test)]
mod tests {
  use super::normalize_windows_verbatim_path;

  #[test]
  fn strips_windows_verbatim_drive_prefix() {
    assert_eq!(
      normalize_windows_verbatim_path(r"\\?\C:\Users\demo\project"),
      r"C:\Users\demo\project"
    );
  }

  #[test]
  fn strips_windows_verbatim_unc_prefix() {
    assert_eq!(
      normalize_windows_verbatim_path(r"\\?\UNC\server\share\project"),
      r"\\server\share\project"
    );
  }

  #[test]
  fn keeps_regular_path() {
    assert_eq!(
      normalize_windows_verbatim_path(r"C:\Users\demo\project"),
      r"C:\Users\demo\project"
    );
  }
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

fn dir_name(path: &Path) -> String {
  path
    .file_name()
    .and_then(|value| value.to_str())
    .filter(|value| !value.trim().is_empty())
    .unwrap_or("IDEA 项目")
    .to_string()
}

fn path_if_dir(path: &Path) -> Option<String> {
  path.is_dir().then(|| absolute_path_string(path))
}

fn path_if_file(path: &Path) -> Option<String> {
  path.is_file().then(|| absolute_path_string(path))
}

fn read_optional_text(path: &Path) -> Result<Option<String>, String> {
  if !path.is_file() {
    return Ok(None);
  }
  fs::read_to_string(path)
    .map(Some)
    .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))
}

fn write_optional_project_text(path: &Path, value: &str) -> Result<Option<String>, String> {
  let normalized = value.trim().to_string();
  if normalized.is_empty() {
    if path.exists() {
      fs::remove_file(path).map_err(|error| format!("删除 {} 失败：{error}", path.to_string_lossy()))?;
    }
    return Ok(None);
  }
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| format!("创建项目 .mvn 目录失败：{error}"))?;
  }
  fs::write(path, &normalized).map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))?;
  Ok(Some(normalized))
}

fn refresh_idea_projects_from_disk(config: &mut AppConfig) -> Result<(), String> {
  let mut refreshed = Vec::with_capacity(config.idea_projects.len());
  for project in config.idea_projects.clone() {
    let project_root = absolute_path(Path::new(&project.project_path));
    if !project_root.is_dir() {
      refreshed.push(project);
      continue;
    }

    let idea_dir = project_root.join(".idea");
    let pom_path = project_root.join("pom.xml");
    let mvn_dir = project_root.join(".mvn");
    let metadata = read_idea_maven_metadata(&project_root)?;
    let maven_config = read_optional_text(&mvn_dir.join("maven.config"))?;
    let jvm_config = read_optional_text(&mvn_dir.join("jvm.config"))?;
    let settings_source = metadata
      .user_settings_file
      .as_deref()
      .map(PathBuf::from)
      .filter(|path| path.is_file())
      .or_else(|| find_project_settings_path(&project_root));
    let settings_path = settings_source.as_ref().map(|path| absolute_path_string(path));
    let settings_id = project.settings_id.clone();
    let maven_version_id = valid_or_matched_maven_version_id(config, project.maven_version_id.clone(), &metadata.maven_home);

    refreshed.push(IdeaProjectEntry {
      id: project.id,
      name: dir_name(&project_root),
      project_path: path_to_display_string(&project_root),
      idea_dir: path_if_dir(&idea_dir),
      workspace_path: metadata.workspace_path,
      misc_path: metadata.misc_path,
      pom_path: path_if_file(&pom_path),
      pom_files: metadata.pom_files,
      maven_home: metadata.maven_home,
      maven_home_type: metadata.maven_home_type,
      local_repository: metadata.local_repository,
      settings_path,
      maven_config,
      jvm_config,
      maven_version_id,
      settings_id,
      imported_at: project.imported_at,
      updated_at: now_stamp(),
    });
  }
  config.idea_projects = refreshed;
  normalize_config_defaults(config);
  Ok(())
}

fn write_global_settings_to_project(config: &AppConfig, settings_id: &str, mvn_dir: &Path) -> Result<String, String> {
  let entry = find_entry(config, settings_id)?;
  let xml = fs::read_to_string(&entry.file_path).map_err(|error| format!("读取全局 settings 配置失败：{error}"))?;
  let validation = validate_settings_xml(&xml);
  if !validation.errors.is_empty() {
    return Err(validation.errors.join("；"));
  }
  fs::create_dir_all(mvn_dir).map_err(|error| format!("创建项目 .mvn 目录失败：{error}"))?;
  let target = mvn_dir.join("settings.xml");
  fs::write(&target, xml).map_err(|error| format!("写入项目 settings.xml 失败：{error}"))?;
  Ok(path_to_display_string(&target))
}

fn normalize_optional_path(path: &str) -> Option<String> {
  let value = path.trim();
  if value.is_empty() {
    None
  } else {
    Some(absolute_path_string(&expand_tilde(value)))
  }
}

fn read_idea_maven_metadata(project_root: &Path) -> Result<IdeaMavenMetadata, String> {
  let idea_dir = project_root.join(".idea");
  let workspace_path = idea_dir.join("workspace.xml");
  let misc_path = idea_dir.join("misc.xml");
  let mut metadata = IdeaMavenMetadata {
    workspace_path: path_if_file(&workspace_path),
    misc_path: path_if_file(&misc_path),
    ..IdeaMavenMetadata::default()
  };

  for file_path in [&workspace_path, &misc_path] {
    if !file_path.is_file() {
      continue;
    }
    let text = fs::read_to_string(file_path).map_err(|error| format!("读取 IDEA 配置失败：{error}"))?;
    let doc = Document::parse(&text).map_err(|error| format!("解析 IDEA 配置失败：{error}"))?;
    for node in doc.descendants().filter(|node| node.has_tag_name("MavenGeneralSettings")) {
      metadata.maven_home = metadata
        .maven_home
        .or_else(|| idea_option_value(&node, "customMavenHome").or_else(|| idea_option_value(&node, "mavenHome")))
        .map(|value| resolve_idea_path(project_root, &value));
      metadata.maven_home_type = metadata.maven_home_type.or_else(|| idea_option_value(&node, "mavenHomeTypeForPersistence"));
      metadata.local_repository = metadata
        .local_repository
        .or_else(|| idea_option_value(&node, "localRepository"))
        .map(|value| resolve_idea_path(project_root, &value));
      metadata.user_settings_file = metadata
        .user_settings_file
        .or_else(|| idea_option_value(&node, "userSettingsFile"))
        .map(|value| resolve_idea_path(project_root, &value));
    }
    for node in doc.descendants().filter(|node| node.has_tag_name("option") && node.attribute("name") == Some("originalFiles")) {
      for item in node.descendants().filter(|child| child.has_tag_name("option")) {
        if let Some(value) = item.attribute("value") {
          let resolved = resolve_idea_path(project_root, value);
          if !metadata.pom_files.contains(&resolved) {
            metadata.pom_files.push(resolved);
          }
        }
      }
    }
  }

  if metadata.pom_files.is_empty() {
    let pom_path = project_root.join("pom.xml");
    if pom_path.is_file() {
      metadata.pom_files.push(path_to_display_string(&pom_path));
    }
  }
  Ok(metadata)
}

fn idea_option_value(node: &roxmltree::Node<'_, '_>, name: &str) -> Option<String> {
  node
    .children()
    .find(|child| child.has_tag_name("option") && child.attribute("name") == Some(name))
    .and_then(|child| child.attribute("value"))
    .map(ToOwned::to_owned)
}

fn resolve_idea_path(project_root: &Path, value: &str) -> String {
  let mut path = value.trim().trim_start_matches("file://").to_string();
  path = path.replace("$PROJECT_DIR$", &project_root.to_string_lossy());
  path = path.replace("$USER_HOME$", &home_dir().to_string_lossy());
  path = path.replace("$MAVEN_REPOSITORY$", &home_dir().join(".m2").join("repository").to_string_lossy());
  let path_buf = PathBuf::from(&path);
  let resolved = if path_buf.is_absolute() { path_buf } else { project_root.join(path_buf) };
  absolute_path_string(&resolved)
}

fn save_idea_maven_general_settings(
  project_root: &Path,
  maven_home: Option<&str>,
  local_repository: Option<&str>,
  settings_path: Option<&str>,
) -> Result<(String, Option<String>), String> {
  let idea_dir = project_root.join(".idea");
  fs::create_dir_all(&idea_dir).map_err(|error| format!("创建 .idea 目录失败：{error}"))?;
  let workspace_path = idea_dir.join("workspace.xml");
  let mut text = if workspace_path.is_file() {
    fs::read_to_string(&workspace_path).map_err(|error| format!("读取 IDEA workspace 失败：{error}"))?
  } else {
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<project version=\"4\">\n</project>\n".to_string()
  };
  let settings_block = build_maven_general_settings_block(maven_home, local_repository, settings_path);
  let option_block = format!("    <option name=\"generalSettings\">\n{}\n    </option>", settings_block);
  let component_block = format!("  <component name=\"MavenImportPreferences\">\n{}\n  </component>", option_block);
  text = upsert_maven_general_settings_block(&text, &settings_block, &option_block, &component_block);
  fs::write(&workspace_path, text).map_err(|error| format!("写入 IDEA workspace 失败：{error}"))?;
  Ok((path_to_display_string(&workspace_path), maven_home.map(|_| "CUSTOM".to_string())))
}

fn build_maven_general_settings_block(maven_home: Option<&str>, local_repository: Option<&str>, settings_path: Option<&str>) -> String {
  let mut lines = vec![
    "      <MavenGeneralSettings>".to_string(),
  ];
  if let Some(value) = maven_home {
    lines.push(format!("        <option name=\"customMavenHome\" value=\"{}\" />", xml_escape_attr(value)));
    lines.push("        <option name=\"mavenHomeTypeForPersistence\" value=\"CUSTOM\" />".to_string());
  }
  if let Some(value) = local_repository {
    lines.push(format!("        <option name=\"localRepository\" value=\"{}\" />", xml_escape_attr(value)));
  }
  if let Some(value) = settings_path {
    lines.push(format!("        <option name=\"userSettingsFile\" value=\"{}\" />", xml_escape_attr(value)));
  }
  lines.extend([
    "      </MavenGeneralSettings>".to_string(),
  ]);
  lines.join("\n")
}

fn upsert_maven_general_settings_block(text: &str, settings_block: &str, option_block: &str, component_block: &str) -> String {
  if let Some((start, end)) = find_named_tag_range(text, "MavenGeneralSettings", None) {
    return format!("{}{}{}", &text[..start], settings_block, &text[end..]);
  }
  if let Some((component_start, component_end)) = find_component_range(text, "MavenImportPreferences") {
    let component = &text[component_start..component_end];
    if let Some((option_start, option_end)) = find_named_tag_range(component, "option", Some(("name", "generalSettings"))) {
      return format!(
        "{}{}{}{}{}",
        &text[..component_start],
        &component[..option_start],
        option_block,
        &component[option_end..],
        &text[component_end..]
      );
    }
    if let Some(insert_at) = component.rfind("</component>") {
      return format!(
        "{}{}\n{}{}",
        &text[..component_start],
        &component[..insert_at],
        option_block,
        &component[insert_at..]
      ) + &text[component_end..];
    }
  }
  if let Some(insert_at) = text.rfind("</project>") {
    return format!("{}{}\n{}", &text[..insert_at], component_block, &text[insert_at..]);
  }
  format!("{}\n{}", text.trim_end(), component_block)
}

fn find_component_range(text: &str, component_name: &str) -> Option<(usize, usize)> {
  let marker = format!("name=\"{component_name}\"");
  let marker_index = text.find(&marker)?;
  let start = text[..marker_index].rfind("<component")?;
  let after_marker = marker_index + marker.len();
  let open_end = text[after_marker..].find('>').map(|index| after_marker + index + 1)?;
  if text[start..open_end].trim_end().ends_with("/>") {
    return Some((start, open_end));
  }
  let close = "</component>";
  let close_start = text[open_end..].find(close).map(|index| open_end + index)?;
  Some((start, close_start + close.len()))
}

fn find_named_tag_range(text: &str, tag: &str, attr: Option<(&str, &str)>) -> Option<(usize, usize)> {
  let tag_start = format!("<{tag}");
  let close = format!("</{tag}>");
  let mut offset = 0;
  while let Some(relative_start) = text[offset..].find(&tag_start) {
    let start = offset + relative_start;
    let open_end = text[start..].find('>').map(|index| start + index + 1)?;
    let open_tag = &text[start..open_end];
    if let Some((name, value)) = attr {
      let marker = format!("{name}=\"{value}\"");
      if !open_tag.contains(&marker) {
        offset = open_end;
        continue;
      }
    }
    if open_tag.trim_end().ends_with("/>") {
      return Some((start, open_end));
    }
    let close_start = text[open_end..].find(&close).map(|index| open_end + index)?;
    return Some((start, close_start + close.len()));
  }
  None
}

fn xml_escape_attr(value: &str) -> String {
  value
    .replace('&', "&amp;")
    .replace('"', "&quot;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
}

fn find_project_settings_path(project_root: &Path) -> Option<PathBuf> {
  [
    project_root.join(".mvn").join("settings.xml"),
    project_root.join("settings.xml"),
    project_root.join(".idea").join("settings.xml"),
  ]
  .into_iter()
  .find(|path| path.is_file())
}

fn project_settings_target(project: &IdeaProjectEntry) -> Result<PathBuf, String> {
  if let Some(path) = project.settings_path.as_deref() {
    return Ok(absolute_path(&expand_tilde(path)));
  }
  let project_root = absolute_path(Path::new(&project.project_path));
  if !project_root.is_dir() {
    return Err("关联 IDEA 项目目录不存在，无法写回项目 settings".to_string());
  }
  Ok(project_root.join(".mvn").join("settings.xml"))
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
