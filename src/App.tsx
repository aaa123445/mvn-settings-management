import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCode2,
  FilePlus2,
  FolderKanban,
  Palette,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  addMavenVersion,
  copyCommand,
  createSettings,
  deleteMavenVersion,
  deleteSettings,
  detectMaven,
  detectAndAddMavenVersion,
  duplicateSettings,
  importIdeaProject,
  importSettings,
  listIdeaProjects,
  listBackups,
  listMavenVersions,
  listSettings,
  readSettings,
  renameMavenVersion,
  renameSettings,
  restoreBackup,
  saveIdeaProjectConfig,
  saveSettings,
  setDefaultSettings,
  setDefaultMavenVersion,
  setMavenPath,
  testSettings,
} from "./tauriApi";
import {
  buildSettingsXml,
  createEmptySettings,
  parseSettingsXml,
  validateSettingsModel,
  validateSettingsXml,
} from "./settingsXml";
import type {
  MavenInfo,
  BackupInfo,
  IdeaProjectEntry,
  MavenVersionEntry,
  MavenVersionIndex,
  MirrorConfig,
  ProfileConfig,
  ProfileProperty,
  ProfileRepository,
  ProxyConfig,
  ServerConfig,
  SettingsDocument,
  SettingsEntry,
  SettingsIndex,
  SettingsModel,
  MavenTestResult,
  SourceType,
} from "./types";

type Section =
  | "projectConfig"
  | "globalConfig"
  | "appSettings"
  | "overview"
  | "environment"
  | "files"
  | "basic"
  | "pluginGroups"
  | "mirrors"
  | "proxies"
  | "servers"
  | "profiles"
  | "xml";

type SettingsEditorTab =
  | "basic"
  | "pluginGroups"
  | "mirrors"
  | "proxies"
  | "servers"
  | "profiles"
  | "xml";

const sections: Array<{ id: Section; title: string; icon: LucideIcon }> = [
  { id: "projectConfig", title: "项目配置", icon: FolderKanban },
  { id: "globalConfig", title: "全局配置", icon: Boxes },
  { id: "appSettings", title: "应用设置", icon: Palette },
];

const settingsEditorTabs: Array<{ id: SettingsEditorTab; title: string; icon: LucideIcon }> = [
  { id: "basic", title: "基础设置", icon: SlidersHorizontal },
  { id: "pluginGroups", title: "插件组", icon: Boxes },
  { id: "mirrors", title: "镜像源", icon: RefreshCw },
  { id: "proxies", title: "代理", icon: Settings2 },
  { id: "servers", title: "认证服务", icon: CheckCircle2 },
  { id: "profiles", title: "Profiles", icon: FolderKanban },
  { id: "xml", title: "XML", icon: FileCode2 },
];

const chartTooltipStyle: CSSProperties = {
  border: "1px solid rgba(118, 149, 175, 0.22)",
  borderRadius: 12,
  background: "rgba(255, 255, 255, 0.92)",
  color: "rgba(14, 24, 36, 0.9)",
  boxShadow: "0 8px 18px rgba(92, 121, 148, 0.12)",
};

type ThemeKey = "mist" | "teal" | "sage" | "rose" | "graphite";

interface ThemeOption {
  key: ThemeKey;
  name: string;
  description: string;
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  primaryBorder: string;
  primaryText: string;
  secondary: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
  infoText: string;
}

interface AppPreferences {
  theme: ThemeKey;
  glassIntensity: number;
}

interface IdeaProjectDraft {
  mavenVersionId: string;
  localRepository: string;
  settingsId: string;
  mavenConfig: string;
  jvmConfig: string;
}

const PREFERENCES_STORAGE_KEY = "maven-settings-management.preferences";
const DEFAULT_APP_PREFERENCES: AppPreferences = { theme: "mist", glassIntensity: 58 };

const THEME_OPTIONS: ThemeOption[] = [
  {
    key: "mist",
    name: "冷雾蓝",
    description: "克制、清爽，适合长时间配置工作",
    primary: "#6d97b8",
    primaryStrong: "#4f7897",
    primarySoft: "rgba(117, 159, 193, 0.18)",
    primaryBorder: "rgba(117, 159, 193, 0.44)",
    primaryText: "rgba(23, 48, 68, 0.92)",
    secondary: "#9eb8c9",
    bgStart: "#f7fbff",
    bgMid: "#eef5fb",
    bgEnd: "#f8f9fc",
    infoText: "#4e7690",
  },
  {
    key: "teal",
    name: "浅海青",
    description: "更明确的操作感，仍保持低饱和",
    primary: "#5faaa0",
    primaryStrong: "#3f837a",
    primarySoft: "rgba(95, 170, 160, 0.18)",
    primaryBorder: "rgba(95, 170, 160, 0.44)",
    primaryText: "rgba(25, 67, 63, 0.94)",
    secondary: "#9dc6c0",
    bgStart: "#f6fbfb",
    bgMid: "#edf7f6",
    bgEnd: "#f8faf9",
    infoText: "#3e7f78",
  },
  {
    key: "sage",
    name: "鼠尾草",
    description: "更安静的工具气质，适合高频使用",
    primary: "#7f9f78",
    primaryStrong: "#607e59",
    primarySoft: "rgba(127, 159, 120, 0.18)",
    primaryBorder: "rgba(127, 159, 120, 0.42)",
    primaryText: "rgba(48, 75, 42, 0.94)",
    secondary: "#b5c7ad",
    bgStart: "#f8fbf6",
    bgMid: "#eef6ec",
    bgEnd: "#f8faf7",
    infoText: "#607d58",
  },
  {
    key: "rose",
    name: "石英玫瑰",
    description: "轻微暖色强调，用于更柔和的视觉反馈",
    primary: "#b98291",
    primaryStrong: "#966171",
    primarySoft: "rgba(185, 130, 145, 0.18)",
    primaryBorder: "rgba(185, 130, 145, 0.42)",
    primaryText: "rgba(86, 42, 56, 0.94)",
    secondary: "#d1adb7",
    bgStart: "#fff9fb",
    bgMid: "#f7eef2",
    bgEnd: "#fbf8fa",
    infoText: "#8a5a67",
  },
  {
    key: "graphite",
    name: "石墨灰",
    description: "弱化色彩，突出配置内容本身",
    primary: "#788797",
    primaryStrong: "#596878",
    primarySoft: "rgba(120, 135, 151, 0.18)",
    primaryBorder: "rgba(120, 135, 151, 0.42)",
    primaryText: "rgba(37, 48, 61, 0.94)",
    secondary: "#aab4bf",
    bgStart: "#f9fbfc",
    bgMid: "#eff3f6",
    bgEnd: "#f8f9fa",
    infoText: "#5b6a78",
  },
];

export default function App() {
  const [section, setSection] = useState<Section>("projectConfig");
  const [settingsEditorTab, setSettingsEditorTab] = useState<SettingsEditorTab>("basic");
  const [mavenVersionsIndex, setMavenVersionsIndex] = useState<MavenVersionIndex | null>(null);
  const [mavenInfo, setMavenInfo] = useState<MavenInfo | null>(null);
  const [mavenPathInput, setMavenPathInput] = useState("");
  const [mavenNameInput, setMavenNameInput] = useState("");
  const [selectedMavenVersionId, setSelectedMavenVersionId] = useState("");
  const [settingsIndex, setSettingsIndex] = useState<SettingsIndex | null>(null);
  const [ideaProjects, setIdeaProjects] = useState<IdeaProjectEntry[]>([]);
  const [selectedIdeaProjectId, setSelectedIdeaProjectId] = useState("");
  const [ideaProjectDrafts, setIdeaProjectDrafts] = useState<Record<string, IdeaProjectDraft>>({});
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [currentDoc, setCurrentDoc] = useState<SettingsDocument | null>(null);
  const [model, setModel] = useState<SettingsModel>(createEmptySettings());
  const [xmlText, setXmlText] = useState(buildSettingsXml(createEmptySettings()));
  const [xmlError, setXmlError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("新配置");
  const [importPath, setImportPath] = useState("");
  const [importName, setImportName] = useState("");
  const [settingsFilter, setSettingsFilter] = useState("");
  const [mavenTestResult, setMavenTestResult] = useState<MavenTestResult | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadPreferences());

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    applyPreferences(preferences);
    savePreferences(preferences);
  }, [preferences]);

  const currentEntry = currentDoc?.entry || null;
  const activeTheme = THEME_OPTIONS.find((theme) => theme.key === preferences.theme) || THEME_OPTIONS[0];
  const saveDisabled = !currentEntry || Boolean(xmlError) || busy || !dirty;
  const mavenVersions = mavenVersionsIndex?.entries || [];
  const defaultMavenVersion = useMemo(() => {
    return mavenVersions.find((entry) => entry.isDefault) || mavenVersions[0] || null;
  }, [mavenVersions]);
  const selectedMavenVersion = useMemo(() => {
    return mavenVersions.find((entry) => entry.id === selectedMavenVersionId) || defaultMavenVersion;
  }, [defaultMavenVersion, mavenVersions, selectedMavenVersionId]);
  const status = useMemo(() => {
    if (notice) return notice;
    if (section === "projectConfig") return `${ideaProjects.length} 个项目配置 · 默认 Maven：${defaultMavenVersion?.name || "未设置"}`;
    if (section === "globalConfig") {
      if (currentEntry) return `${currentEntry.name}${dirty ? " 有未保存修改" : " 已保存"}`;
      return "请选择或新建 settings 配置";
    }
    return "应用外观设置";
  }, [currentEntry, defaultMavenVersion?.name, dirty, ideaProjects.length, notice, section]);
  const preservedFragmentCount = useMemo(() => {
    return model.extraXml.length + model.profiles.reduce((count, profile) => count + profile.extraXml.length, 0);
  }, [model]);
  const filteredEntries = useMemo(() => {
    const entries = settingsIndex?.entries || [];
    const query = settingsFilter.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => {
      return [entry.name, entry.filePath, entry.sourceType, entry.isDefault ? "default 默认" : ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [settingsIndex, settingsFilter]);
  const globalSettingsEntries = useMemo(() => filteredEntries.filter((entry) => entry.sourceType !== "ideaProject"), [filteredEntries]);
  const projectSettingsEntries = useMemo(() => filteredEntries.filter((entry) => entry.sourceType === "ideaProject"), [filteredEntries]);
  const selectedIdeaProject = useMemo(() => {
    return ideaProjects.find((project) => project.id === selectedIdeaProjectId) || ideaProjects[0] || null;
  }, [ideaProjects, selectedIdeaProjectId]);

  async function bootstrap() {
    setBusy(true);
    try {
      await refreshMavenVersions();
      const index = await refreshSettings();
      await refreshIdeaProjects();
      await refreshBackups();
      const defaultEntry = index.entries.find((entry) => entry.isDefault) || index.entries[0];
      if (defaultEntry) {
        await openSettings(defaultEntry.id, false);
      }
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function refreshMavenVersions() {
    const index = await listMavenVersions();
    setMavenVersionsIndex(index);
    const entry = index.entries.find((item) => item.isDefault) || index.entries[0] || null;
    setMavenInfo(entry ? mavenInfoFromVersion(entry) : null);
    setSelectedMavenVersionId((current) => {
      if (current && index.entries.some((item) => item.id === current)) return current;
      return entry?.id || "";
    });
    return index;
  }

  async function refreshMaven() {
    try {
      const info = await detectMaven();
      setMavenInfo(info);
      setMavenPathInput(info.mvnPath || info.mavenHome || "");
      await refreshMavenVersions();
      return info;
    } catch (error) {
      await refreshMavenVersions();
      throw error;
    }
  }

  async function refreshSettings() {
    const index = await listSettings();
    setSettingsIndex(index);
    return index;
  }

  async function refreshIdeaProjects() {
    const projects = await listIdeaProjects();
    setIdeaProjects(projects);
    setSelectedIdeaProjectId((current) => {
      if (current && projects.some((project) => project.id === current)) return current;
      return projects[0]?.id || "";
    });
    setIdeaProjectDrafts((current) => {
      const next: Record<string, IdeaProjectDraft> = {};
      for (const project of projects) {
        next[project.id] = current[project.id] ?? ideaProjectDraftFromEntry(project);
      }
      return next;
    });
    return projects;
  }

  async function refreshBackups() {
    const nextBackups = await listBackups();
    setBackups(nextBackups);
    return nextBackups;
  }

  async function handleAddMavenVersion() {
    if (!mavenPathInput.trim()) {
      setNotice("请输入 Maven home 或 mvn 可执行文件路径");
      return;
    }
    await withBusy(async () => {
      const entry = await addMavenVersion(mavenPathInput.trim(), mavenNameInput.trim());
      await refreshMavenVersions();
      await refreshIdeaProjects();
      setSelectedMavenVersionId(entry.id);
      setMavenPathInput("");
      setMavenNameInput("");
      setNotice(`已添加 Maven 版本：${entry.name}`);
    });
  }

  async function applyMavenPath() {
    if (!mavenPathInput.trim()) {
      setNotice("请输入 Maven home 或 mvn 可执行文件路径");
      return;
    }
    await withBusy(async () => {
      const info = await setMavenPath(mavenPathInput.trim());
      const index = await refreshMavenVersions();
      const entry = index.entries.find((item) => item.mvnPath === info.mvnPath);
      if (entry) setSelectedMavenVersionId(entry.id);
      setMavenInfo(info);
      setMavenPathInput("");
      setNotice("Maven 路径已添加为全局版本");
    });
  }

  async function handleDetectAndAddMavenVersion() {
    await withBusy(async () => {
      const entry = await detectAndAddMavenVersion();
      await refreshMavenVersions();
      await refreshIdeaProjects();
      setSelectedMavenVersionId(entry.id);
      setNotice(`已检测并添加 Maven 版本：${entry.name}`);
    });
  }

  async function handlePickAndAddMavenVersion(kind: "directory" | "file" = "directory") {
    const selected = await open({
      directory: kind === "directory",
      multiple: false,
      title: kind === "directory" ? "选择 Maven Home" : "选择 mvn 可执行文件",
    });
    if (typeof selected !== "string") return;
    await withBusy(async () => {
      const entry = await addMavenVersion(selected, "");
      await refreshMavenVersions();
      await refreshIdeaProjects();
      setSelectedMavenVersionId(entry.id);
      setNotice(`已添加 Maven 版本：${entry.name}`);
    });
  }

  async function handleRenameMavenVersion(entry: MavenVersionEntry) {
    const name = window.prompt("新的 Maven 版本名称", entry.name);
    if (name === null) return;
    await withBusy(async () => {
      const renamed = await renameMavenVersion(entry.id, name);
      await refreshMavenVersions();
      setSelectedMavenVersionId(renamed.id);
      setNotice("Maven 版本已重命名");
    });
  }

  async function handleSetDefaultMavenVersion(entry: MavenVersionEntry) {
    await withBusy(async () => {
      await setDefaultMavenVersion(entry.id);
      await refreshMavenVersions();
      setSelectedMavenVersionId(entry.id);
      setNotice(`已设为默认 Maven：${entry.name}`);
    });
  }

  async function handleDeleteMavenVersion(entry: MavenVersionEntry) {
    const ok = window.confirm(`删除 Maven 版本 "${entry.name}"？关联项目会变为未绑定。`);
    if (!ok) return;
    await withBusy(async () => {
      await deleteMavenVersion(entry.id);
      const index = await refreshMavenVersions();
      const nextEntry = index.entries.find((item) => item.isDefault) || index.entries[0];
      setSelectedMavenVersionId(nextEntry?.id || "");
      await refreshIdeaProjects();
      setNotice("Maven 版本已删除");
    });
  }

  async function chooseMavenPath(kind: "directory" | "file") {
    const selected = await open({
      directory: kind === "directory",
      multiple: false,
      title: kind === "directory" ? "选择 Maven Home" : "选择 mvn 可执行文件",
    });
    if (typeof selected === "string") {
      setMavenPathInput(selected);
    }
  }

  async function openSettings(id: string, switchSection = true) {
    const doc = await readSettings(id);
    loadDocument(doc);
    if (switchSection) {
      setSection("globalConfig");
      setSettingsEditorTab("basic");
    }
  }

  function loadDocument(doc: SettingsDocument) {
    setCurrentDoc(doc);
    setXmlText(doc.xml);
    try {
      const next = parseSettingsXml(doc.xml);
      setModel(next);
      const validation = validateSettingsModel(next);
      setWarnings([...doc.validation.warnings, ...validation.warnings]);
      setXmlError("");
    } catch (error) {
      setModel(createEmptySettings());
      setWarnings(doc.validation.warnings);
      setXmlError(error instanceof Error ? error.message : "XML 解析失败");
      setSection("globalConfig");
      setSettingsEditorTab("xml");
    }
    setDirty(false);
    setNotice("");
  }

  async function handleCreate(mode: "empty" | "default") {
    await withBusy(async () => {
      const doc = await createSettings(newName.trim() || "新配置", mode);
      await refreshSettings();
      loadDocument(doc);
      setSection("globalConfig");
      setSettingsEditorTab("basic");
      setNotice(mode === "default" ? "已从默认 settings 创建配置" : "已创建空配置");
    });
  }

  async function handleImport() {
    await withBusy(async () => {
      const doc = await importSettings(importPath.trim(), importName.trim());
      await refreshSettings();
      loadDocument(doc);
      setImportPath("");
      setImportName("");
      setSection("globalConfig");
      setSettingsEditorTab("basic");
      setNotice("已导入 settings 文件");
    });
  }

  async function handleAddIdeaProject() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "添加 IDEA 项目",
    });
    if (typeof selected === "string") {
      await importIdeaProjectByPath(selected);
    }
  }

  async function importIdeaProjectByPath(projectPath: string) {
    await withBusy(async () => {
      const result = await importIdeaProject(projectPath);
      await refreshSettings();
      await refreshIdeaProjects();
      setIdeaProjectDrafts((current) => ({
        ...current,
        [result.project.id]: ideaProjectDraftFromEntry(result.project),
      }));
      setSelectedIdeaProjectId(result.project.id);
      if (result.settings) {
        loadDocument(result.settings);
        setSection("projectConfig");
        setNotice("已导入 IDEA 项目，并复制项目 settings 到全局配置");
      } else {
        setNotice("已导入 IDEA 项目 Maven 配置，未发现项目 settings.xml");
      }
    });
  }

  async function handleSaveIdeaProjectConfig(project: IdeaProjectEntry) {
    const draft = ideaProjectDrafts[project.id] ?? ideaProjectDraftFromEntry(project);
    await withBusy(async () => {
      const savedProject = await saveIdeaProjectConfig(project.id, draft.mavenVersionId, draft.localRepository, draft.settingsId, draft.mavenConfig, draft.jvmConfig);
      await refreshSettings();
      setIdeaProjects((current) => current.map((item) => (item.id === savedProject.id ? savedProject : item)));
      setIdeaProjectDrafts((current) => ({
        ...current,
        [savedProject.id]: ideaProjectDraftFromEntry(savedProject),
      }));
      setNotice("IDEA 项目级 Maven 配置已写回 .idea/workspace.xml 和 .mvn 目录");
    });
  }

  function updateIdeaProjectDraft(id: string, patch: Partial<IdeaProjectDraft>) {
    setIdeaProjectDrafts((current) => ({
      ...current,
      [id]: {
        mavenVersionId: current[id]?.mavenVersionId ?? "",
        localRepository: current[id]?.localRepository ?? "",
        settingsId: current[id]?.settingsId ?? "",
        mavenConfig: current[id]?.mavenConfig ?? "",
        jvmConfig: current[id]?.jvmConfig ?? "",
        ...patch,
      },
    }));
  }

  function isIdeaProjectDraftDirty(project: IdeaProjectEntry) {
    const draft = ideaProjectDrafts[project.id] ?? ideaProjectDraftFromEntry(project);
    return (
      draft.mavenVersionId !== (project.mavenVersionId ?? "") ||
      draft.localRepository !== (project.localRepository ?? "") ||
      draft.settingsId !== (project.settingsId ?? "") ||
      draft.mavenConfig !== (project.mavenConfig ?? "") ||
      draft.jvmConfig !== (project.jvmConfig ?? "")
    );
  }

  async function chooseImportFile() {
    const selected = await open({
      directory: false,
      multiple: false,
      title: "选择 settings.xml",
      filters: [{ name: "Maven settings", extensions: ["xml"] }],
    });
    if (typeof selected === "string") {
      setImportPath(selected);
      if (!importName.trim()) {
        const fileName = selected.split(/[\\/]/).pop()?.replace(/\.xml$/i, "") || "";
        setImportName(fileName);
      }
    }
  }

  async function chooseIdeaDraftPath(id: string, field: "localRepository", kind: "directory") {
    const selected = await open({
      directory: kind === "directory",
      multiple: false,
      title: "选择项目本地仓库",
    });
    if (typeof selected === "string") {
      updateIdeaProjectDraft(id, { [field]: selected });
    }
  }

  async function chooseLocalRepository() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择本地仓库目录",
    });
    if (typeof selected === "string") {
      updateModel((draft) => ({ ...draft, localRepository: selected }));
    }
  }

  async function handleDelete(entry: SettingsEntry) {
    const ok = window.confirm(`删除配置 "${entry.name}"？关联项目会变为未绑定。`);
    if (!ok) return;
    await withBusy(async () => {
      await deleteSettings(entry.id);
      const index = await refreshSettings();
      if (entry.sourceType === "ideaProject") {
        await refreshIdeaProjects();
      }
      if (currentEntry?.id === entry.id) {
        const next = index.entries.find((item) => item.isDefault) || index.entries[0];
        if (next) {
          await openSettings(next.id, false);
        } else {
          setCurrentDoc(null);
          setModel(createEmptySettings());
          setXmlText(buildSettingsXml(createEmptySettings()));
          setDirty(false);
        }
      }
      setNotice("配置已删除");
    });
  }

  async function handleRename(entry: SettingsEntry) {
    const name = window.prompt("新的配置名称", entry.name);
    if (name === null) return;
    await withBusy(async () => {
      const renamed = await renameSettings(entry.id, name);
      await refreshSettings();
      if (currentEntry?.id === entry.id) {
        setCurrentDoc((doc) => (doc ? { ...doc, entry: renamed } : doc));
      }
      setNotice("配置已重命名");
    });
  }

  async function handleDuplicate(entry: SettingsEntry) {
    const name = window.prompt("副本配置名称", `${entry.name} 副本`);
    if (name === null) return;
    await withBusy(async () => {
      const doc = await duplicateSettings(entry.id, name);
      await refreshSettings();
      loadDocument(doc);
      setSection("globalConfig");
      setSettingsEditorTab("basic");
      setNotice("已复制配置");
    });
  }

  async function handleSave() {
    if (!currentEntry || xmlError) return;
    await withBusy(async () => {
      const doc = await saveSettings(currentEntry.id, xmlText);
      await refreshSettings();
      if (currentEntry.sourceType === "ideaProject") {
        await refreshIdeaProjects();
      }
      loadDocument(doc);
      setNotice("配置已保存");
    });
  }

  async function handleSetDefault(entryId = currentEntry?.id) {
    if (!entryId) return;
    await withBusy(async () => {
      const result = await setDefaultSettings(entryId);
      await refreshSettings();
      await refreshBackups();
      if (currentEntry) {
        await openSettings(currentEntry.id, false);
      }
      setNotice(result.backupPath ? `已设置默认配置，备份：${result.backupPath}` : "已设置默认配置");
    });
  }

  async function handleCopyCommand(entryId = currentEntry?.id) {
    if (!entryId) return;
    await withBusy(async () => {
      const command = await copyCommand(entryId);
      await navigator.clipboard.writeText(command);
      setNotice(`已复制：${command}`);
    });
  }

  async function handleTestSettings(entryId = currentEntry?.id) {
    if (!entryId) return;
    await withBusy(async () => {
      const result = await testSettings(entryId);
      setMavenTestResult(result);
      setNotice(result.success ? "Maven 试运行通过" : "Maven 试运行失败，查看输出");
      setSection("globalConfig");
    });
  }

  async function handleRestoreBackup(backup: BackupInfo) {
    const ok = window.confirm(`恢复备份 "${backup.fileName}" 到默认 settings？当前默认 settings 会先自动备份。`);
    if (!ok) return;
    await withBusy(async () => {
      const result = await restoreBackup(backup.filePath);
      await refreshBackups();
      setNotice(result.backupPath ? `已恢复备份，恢复前文件已备份：${result.backupPath}` : "已恢复备份");
    });
  }

  function updateModel(updater: (draft: SettingsModel) => SettingsModel) {
    const next = updater(cloneModel(model));
    const nextXml = buildSettingsXml(next);
    const validation = validateSettingsModel(next);
    setModel(next);
    setXmlText(nextXml);
    setWarnings(validation.warnings);
    setXmlError("");
    setDirty(true);
  }

  function handleXmlChange(value: string) {
    setXmlText(value);
    const validation = validateSettingsXml(value);
    setWarnings(validation.warnings);
    setDirty(true);
    if (!validation.valid) {
      setXmlError(validation.errors.join("；"));
      return;
    }
    try {
      setModel(parseSettingsXml(value));
      setXmlError("");
    } catch (error) {
      setXmlError(error instanceof Error ? error.message : "XML 解析失败");
    }
  }

  async function withBusy(work: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await work();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  function showError(error: unknown) {
    setNotice(error instanceof Error ? error.message : String(error));
  }

  function updatePreferences(patch: Partial<AppPreferences>) {
    setPreferences((current) => ({
      ...current,
      ...patch,
      glassIntensity: clampGlassIntensity(patch.glassIntensity ?? current.glassIntensity),
    }));
  }

  function resetPreferences() {
    setPreferences(DEFAULT_APP_PREFERENCES);
    setNotice("应用外观已恢复默认");
  }

  return (
    <div className="app-shell">
      <div className="nav-shell">
        <div className="app-identity">
          <h1>Maven 本地配置管理</h1>
          <p className="status-text">{status}</p>
        </div>
        <nav className="top-nav" aria-label="配置分组">
          {sections.map((item) => (
            <button
              className={`nav-item ${section === item.id ? "active" : ""}`}
              type="button"
            key={item.id}
            onClick={() => setSection(item.id)}
          >
            <ButtonIcon icon={item.icon} />
            {item.title}
          </button>
        ))}
      </nav>
      <button className="button secondary refresh-button" type="button" onClick={() => void bootstrap()} disabled={busy}>
        <ButtonIcon icon={RefreshCw} />
        刷新
      </button>
      </div>

      <main className="workspace">
        <section className="content">{renderSection()}</section>
      </main>
    </div>
  );

  function renderSection() {
    if (section === "projectConfig") {
      return renderProjectConfig();
    }

    if (section === "globalConfig") {
      return renderGlobalConfig();
    }

    if (section === "overview") {
      return renderOverview();
    }

    if (section === "environment") {
      return (
        <Panel title="Maven 环境">
          <div className="summary-grid">
            <Info label="检测来源" value={mavenInfo?.source || "未检测"} />
            <Info label="Maven 版本" value={mavenInfo?.version || "未识别"} />
            <Info label="Maven Home" value={mavenInfo?.mavenHome || "未识别"} />
            <Info label="mvn 路径" value={mavenInfo?.mvnPath || "未识别"} />
            <Info label="Java 版本" value={mavenInfo?.javaVersion || "未识别"} />
          </div>
          <div className="subsection">
            <div className="form-grid">
              <PathField
                label="Maven 路径"
                value={mavenPathInput}
                placeholder="请选择 Maven Home 或 mvn 可执行文件"
                full
                actions={[
                  { label: "Home", onClick: () => void chooseMavenPath("directory"), disabled: busy },
                  { label: "mvn", onClick: () => void chooseMavenPath("file"), disabled: busy },
                ]}
              />
            </div>
            <div className="inline-actions path-actions">
              <button className="button secondary" type="button" onClick={() => void withBusy(async () => { await refreshMaven(); })} disabled={busy}>
                自动检测
              </button>
              <button className="button primary" type="button" onClick={() => void applyMavenPath()} disabled={busy}>
                使用此路径
              </button>
            </div>
          </div>
          {mavenInfo?.rawOutput ? <pre className="terminal-output">{mavenInfo.rawOutput}</pre> : null}
          {mavenTestResult ? (
            <div className="subsection">
              <div className="subsection-title">
                <h3>Settings 试运行</h3>
                <span className={mavenTestResult.success ? "run-state ok" : "run-state fail"}>{mavenTestResult.success ? "通过" : "失败"}</span>
              </div>
              <Info label="命令" value={mavenTestResult.command} />
              <pre className="terminal-output">{mavenTestResult.output || "无输出"}</pre>
            </div>
          ) : null}
        </Panel>
      );
    }

    if (section === "files") {
      return (
        <Panel title="配置文件">
          <div className="file-action-grid">
            <div className="tool-box">
              <h3>新建全局配置</h3>
              <TextField label="配置名称" value={newName} onChange={setNewName} />
              <div className="inline-actions">
                <button className="button secondary" type="button" onClick={() => void handleCreate("empty")} disabled={busy}>
                  空模板
                </button>
                <button className="button secondary" type="button" onClick={() => void handleCreate("default")} disabled={busy}>
                  从默认 settings
                </button>
              </div>
            </div>
            <div className="tool-box">
              <h3>导入全局 settings</h3>
              <PathField
                label="settings.xml 路径"
                value={importPath}
                placeholder="请选择 settings.xml 文件"
                actions={[{ label: "选择", onClick: () => void chooseImportFile(), disabled: busy }]}
              />
              <TextField label="显示名称" value={importName} onChange={setImportName} />
              <div className="inline-actions">
                <button className="button primary" type="button" onClick={() => void handleImport()} disabled={busy || !importPath.trim()}>
                  导入
                </button>
              </div>
            </div>
          </div>
          <div className="filter-bar">
            <TextField label="筛选配置" value={settingsFilter} onChange={setSettingsFilter} placeholder="按名称、路径、来源或默认状态筛选" full />
            <span className="filter-count">全局 {globalSettingsEntries.length} / 项目 {projectSettingsEntries.length}</span>
          </div>

          <div className="file-workspace">
            <section className="settings-column" aria-label="全局 Settings 配置">
              <div className="subsection-title">
                <h3>全局 Settings</h3>
              </div>
              <div className="item-list compact-list">
                {globalSettingsEntries.length ? (
                  globalSettingsEntries.map((entry) => (
                    <article className={`item ${currentEntry?.id === entry.id ? "selected" : ""}`} key={entry.id}>
                      <div className="item-header">
                        <div className="item-title">
                          {entry.name}
                          {entry.isDefault ? <span className="badge">默认</span> : null}
                        </div>
                      </div>
                      <div className="item-body compact settings-entry-body">
                        <Info label="路径" value={entry.filePath} />
                        <Info label="来源" value={sourceTypeLabel(entry.sourceType)} />
                      </div>
                      <div className="item-actions inline-row">
                        <button className="button ghost" type="button" onClick={() => void openSettings(entry.id)} disabled={busy}>
                          打开
                        </button>
                        <button className="button ghost" type="button" onClick={() => void handleCopyCommand(entry.id)} disabled={busy}>
                          命令
                        </button>
                        <button className="button ghost" type="button" onClick={() => void handleRename(entry)} disabled={busy}>
                          重命名
                        </button>
                        <button className="button ghost" type="button" onClick={() => void handleDuplicate(entry)} disabled={busy}>
                          复制
                        </button>
                        <button className="button ghost" type="button" onClick={() => void handleSetDefault(entry.id)} disabled={busy}>
                          默认
                        </button>
                        <button className="button ghost" type="button" onClick={() => void handleTestSettings(entry.id)} disabled={busy}>
                          试运行
                        </button>
                        <button className="button danger" type="button" onClick={() => void handleDelete(entry)} disabled={busy}>
                          删除
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <EmptyState text={settingsFilter ? "没有匹配的全局配置" : "暂无全局配置文件"} />
                )}
              </div>
            </section>

            <section className="project-column" aria-label="项目级 Maven 配置">
              <div className="subsection-title">
                <h3>项目 Maven</h3>
                <div className="subsection-actions">
                  <button className="button primary" type="button" onClick={() => void handleAddIdeaProject()} disabled={busy}>
                    添加项目
                  </button>
                  <button className="button secondary" type="button" onClick={() => void withBusy(async () => { await refreshIdeaProjects(); })} disabled={busy}>
                    刷新项目
                  </button>
                </div>
              </div>
              {ideaProjects.length && selectedIdeaProject ? (
              <div className="project-workbench">
                <aside className="project-list-panel" aria-label="IDEA 项目列表">
                  {ideaProjects.map((project) => {
                    const projectDirty = isIdeaProjectDraftDirty(project);
                    return (
                      <button
                        className={`project-list-item ${selectedIdeaProject.id === project.id ? "active" : ""}`}
                        type="button"
                        key={project.id}
                        onClick={() => setSelectedIdeaProjectId(project.id)}
                      >
                        <span>
                          <strong>{project.name}</strong>
                          <small>{project.projectPath}</small>
                        </span>
                        {projectDirty ? <i>未保存</i> : null}
                      </button>
                    );
                  })}
                </aside>
                {(() => {
                  const project = selectedIdeaProject;
                  const linkedEntry = project.settingsId ? settingsIndex?.entries.find((entry) => entry.id === project.settingsId) : null;
                  const draft = ideaProjectDrafts[project.id] ?? ideaProjectDraftFromEntry(project);
                  const projectDirty = isIdeaProjectDraftDirty(project);
                  return (
                    <article className="item project-editor-pane">
                      <div className="item-header">
                        <div className="item-title">
                          {project.name}
                          {projectDirty ? <span className="badge">未保存</span> : null}
                          {linkedEntry ? <span className="badge">已关联 settings</span> : null}
                        </div>
                        <div className="item-actions">
                          <button className="button ghost" type="button" onClick={() => void handleSaveIdeaProjectConfig(project)} disabled={busy || !projectDirty}>
                            保存项目配置
                          </button>
                          <button className="button ghost" type="button" onClick={() => project.settingsId && void openSettings(project.settingsId)} disabled={busy || !linkedEntry}>
                            打开 settings
                          </button>
                        </div>
                      </div>
                      <div className="item-body">
                        <div className="project-meta">
                          <Info label="项目路径" value={project.projectPath} />
                          <Info label="关联配置" value={linkedEntry?.name || "未发现项目 settings.xml"} />
                          <Info label="Maven POM" value={project.pomFiles.length ? `${project.pomFiles.length} 个` : project.pomPath || "未发现"} />
                          <Info label="IDEA workspace" value={project.workspacePath || "未发现"} />
                        </div>
                        <div className="project-path-grid">
                          <SelectField
                            label="Maven 版本"
                            value={draft.mavenVersionId}
                            onChange={(value) => updateIdeaProjectDraft(project.id, { mavenVersionId: value })}
                            options={[
                              { value: "", label: "不绑定 Maven 版本" },
                              ...mavenVersions.map((entry) => ({ value: entry.id, label: entry.name })),
                            ]}
                          />
                          <SelectField
                            label="使用全局 Maven 配置"
                            value={draft.settingsId}
                            onChange={(value) => updateIdeaProjectDraft(project.id, { settingsId: value })}
                            options={[
                              { value: "", label: "不绑定全局配置" },
                              ...globalSettingsEntries.map((entry) => ({ value: entry.id, label: entry.name })),
                            ]}
                          />
                          <PathField
                            label="Local repository"
                            value={draft.localRepository}
                            placeholder="读取 IDEA localRepository，可选择本地仓库"
                            actions={[{ label: "选择", onClick: () => void chooseIdeaDraftPath(project.id, "localRepository", "directory"), disabled: busy }]}
                          />
                        </div>
                        <div className="project-config-grid">
                          <CodeField
                            label=".mvn/maven.config"
                            value={draft.mavenConfig}
                            placeholder={"-DskipTests\n-Pdev"}
                            onChange={(value) => updateIdeaProjectDraft(project.id, { mavenConfig: value })}
                          />
                          <CodeField
                            label=".mvn/jvm.config"
                            value={draft.jvmConfig}
                            placeholder={"-Xmx2g\n-Dfile.encoding=UTF-8"}
                            onChange={(value) => updateIdeaProjectDraft(project.id, { jvmConfig: value })}
                          />
                        </div>
                        <p className="hint">保存会把所选全局配置写入项目 .mvn/settings.xml，并让 IDEA userSettingsFile 指向它；其它项目参数也会写回 workspace 和 .mvn。</p>
                        {project.pomFiles.length ? (
                          <details className="pom-details">
                            <summary>查看 Maven POM 列表</summary>
                            <pre>{project.pomFiles.join("\n")}</pre>
                          </details>
                        ) : null}
                      </div>
                    </article>
                  );
                })()}
              </div>
              ) : (
                <EmptyState text="暂无 IDEA 项目配置" compact />
              )}
            </section>
          </div>
          <div className="subsection">
            <div className="subsection-title">
              <h3>默认配置备份</h3>
              <button className="button secondary" type="button" onClick={() => void withBusy(async () => { await refreshBackups(); })} disabled={busy}>
                刷新备份
              </button>
            </div>
            {backups.length ? (
              <div className="item-list">
                {backups.map((backup) => (
                  <article className="item" key={backup.filePath}>
                    <div className="item-header">
                      <div className="item-title">{backup.fileName}</div>
                      <div className="item-actions">
                        <button className="button ghost" type="button" onClick={() => void handleRestoreBackup(backup)} disabled={busy}>
                          恢复
                        </button>
                      </div>
                    </div>
                    <div className="item-body compact">
                      <Info label="路径" value={backup.filePath} />
                      <Info label="大小" value={formatBytes(backup.size)} />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState text="暂无备份" compact />
            )}
          </div>
          {settingsIndex?.userSettingsPath ? <p className="hint">默认 settings 路径：{settingsIndex.userSettingsPath}</p> : null}
        </Panel>
      );
    }

    if (section === "appSettings") {
      return renderAppSettings();
    }

    if (!currentEntry) {
      return (
        <Panel title="未选择配置">
          <EmptyState text="请先在配置文件页新建或导入一个 settings.xml" />
        </Panel>
      );
    }

    if (section === "basic") {
      return (
      <EditorPanel title="基础设置">
          {preservedFragmentCount ? (
            <div className="message info">
              已保留 {preservedFragmentCount} 段未在表单中展示的高级 XML 配置，可在 XML 页查看和编辑。
            </div>
          ) : null}
          <div className="form-grid">
            <PathField
              label="本地仓库路径"
              value={model.localRepository}
              placeholder="/Users/name/.m2/repository"
              full
              actions={[{ label: "选择", onClick: () => void chooseLocalRepository(), disabled: busy }]}
            />
            <CheckboxField
              label="交互模式"
              checked={model.interactiveMode}
              onChange={(checked) => updateModel((draft) => ({ ...draft, interactiveMode: checked }))}
            />
            <CheckboxField label="离线模式" checked={model.offline} onChange={(checked) => updateModel((draft) => ({ ...draft, offline: checked }))} />
          </div>
        </EditorPanel>
      );
    }

    if (section === "pluginGroups") {
      return (
        <EditorPanel title="插件组" action={<AddButton label="新增插件组" onClick={() => updateModel((draft) => ({ ...draft, pluginGroups: [...draft.pluginGroups, ""] }))} />}>
          {model.pluginGroups.length ? (
            <div className="item-list">
              {model.pluginGroups.map((groupId, index) => (
                <article className="item" key={index}>
                  <div className="item-body row-grid">
                    <TextField
                      label="Group ID"
                      value={groupId}
                      onChange={(value) =>
                        updateModel((draft) => {
                          draft.pluginGroups[index] = value;
                          return draft;
                        })
                      }
                    />
                    <RemoveButton onClick={() => updateModel((draft) => ({ ...draft, pluginGroups: draft.pluginGroups.filter((_, itemIndex) => itemIndex !== index) }))} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState text="暂无插件组" />
          )}
        </EditorPanel>
      );
    }

    if (section === "mirrors") {
      return (
        <EditorPanel
          title="镜像源"
          action={<AddButton label="新增镜像" onClick={() => updateModel((draft) => ({ ...draft, mirrors: [...draft.mirrors, emptyMirror()] }))} />}
        >
          {renderMirrors()}
        </EditorPanel>
      );
    }

    if (section === "proxies") {
      return (
        <EditorPanel
          title="代理"
          action={<AddButton label="新增代理" onClick={() => updateModel((draft) => ({ ...draft, proxies: [...draft.proxies, emptyProxy()] }))} />}
        >
          {renderProxies()}
        </EditorPanel>
      );
    }

    if (section === "servers") {
      return (
        <EditorPanel
          title="认证服务"
          action={<AddButton label="新增服务" onClick={() => updateModel((draft) => ({ ...draft, servers: [...draft.servers, emptyServer()] }))} />}
        >
          {renderServers()}
        </EditorPanel>
      );
    }

    if (section === "profiles") {
      return (
        <EditorPanel
          title="Profiles"
          action={<AddButton label="新增 Profile" onClick={() => updateModel((draft) => ({ ...draft, profiles: [...draft.profiles, emptyProfile()] }))} />}
        >
          {renderProfiles()}
        </EditorPanel>
      );
    }

    return (
      <EditorPanel title="XML 源码">
        <textarea className={`textarea ${xmlError ? "invalid" : ""}`} value={xmlText} spellCheck={false} onChange={(event) => handleXmlChange(event.target.value)} />
        {xmlError ? <div className="message error">{xmlError}</div> : <div className="message ok">XML 可解析，已同步到表单</div>}
      </EditorPanel>
    );
  }

  function renderProjectConfig() {
    return (
      <Panel
        title="项目配置"
        action={
          <div className="panel-actions">
            <button className="button primary" type="button" onClick={() => void handleAddIdeaProject()} disabled={busy}>
              <ButtonIcon icon={Plus} />
              添加项目
            </button>
            <button className="button secondary" type="button" onClick={() => void withBusy(async () => { await refreshIdeaProjects(); })} disabled={busy}>
              <ButtonIcon icon={RefreshCw} />
              刷新项目
            </button>
          </div>
        }
      >
        {ideaProjects.length && selectedIdeaProject ? (
          <div className="project-workbench page-workbench">
            <aside className="project-list-panel" aria-label="IDEA 项目列表">
              {ideaProjects.map((project) => {
                const projectDirty = isIdeaProjectDraftDirty(project);
                return (
                  <button
                    className={`project-list-item ${selectedIdeaProject.id === project.id ? "active" : ""}`}
                    type="button"
                    key={project.id}
                    onClick={() => setSelectedIdeaProjectId(project.id)}
                  >
                    <span className="list-item-icon">
                      <ButtonIcon icon={FolderKanban} />
                    </span>
                    <span>
                      <strong>{project.name}</strong>
                      <small>{project.projectPath}</small>
                    </span>
                    {projectDirty ? <i>未保存</i> : null}
                  </button>
                );
              })}
            </aside>
            {renderProjectEditor(selectedIdeaProject)}
          </div>
        ) : (
          <EmptyState text="暂无项目配置，请添加 IDEA/Maven 项目目录" />
        )}
      </Panel>
    );
  }

  function renderProjectEditor(project: IdeaProjectEntry) {
    const linkedSettings = project.settingsId ? settingsIndex?.entries.find((entry) => entry.id === project.settingsId) : null;
    const linkedMaven = project.mavenVersionId ? mavenVersions.find((entry) => entry.id === project.mavenVersionId) : null;
    const draft = ideaProjectDrafts[project.id] ?? ideaProjectDraftFromEntry(project);
    const projectDirty = isIdeaProjectDraftDirty(project);

    return (
      <article className="item project-editor-pane">
        <div className="item-header">
          <div className="item-title">
            {project.name}
            {projectDirty ? <span className="badge">未保存</span> : null}
            {linkedMaven ? <span className="badge">已选 Maven</span> : null}
            {linkedSettings ? <span className="badge">已选 settings</span> : null}
          </div>
          <div className="item-actions">
            <button className="button primary" type="button" onClick={() => void handleSaveIdeaProjectConfig(project)} disabled={busy || !projectDirty}>
              <ButtonIcon icon={Save} />
              保存项目配置
            </button>
            <button className="button ghost" type="button" onClick={() => project.settingsId && void openSettings(project.settingsId)} disabled={busy || !linkedSettings}>
              <ButtonIcon icon={ExternalLink} />
              打开 settings
            </button>
          </div>
        </div>
        <div className="item-body">
          <div className="project-meta">
            <Info label="项目路径" value={project.projectPath} />
            <Info label="检测到的 Maven Home" value={project.mavenHome || "未读取到项目 Maven"} />
            <Info label="Maven POM" value={project.pomFiles.length ? `${project.pomFiles.length} 个` : project.pomPath || "未发现"} />
            <Info label="IDEA workspace" value={project.workspacePath || "未发现"} />
          </div>
          <div className="project-path-grid">
            <SelectField
              label="Maven 版本"
              value={draft.mavenVersionId}
              onChange={(value) => updateIdeaProjectDraft(project.id, { mavenVersionId: value })}
              options={[
                { value: "", label: mavenVersions.length ? "请选择全局 Maven 版本" : "请先在全局配置添加 Maven" },
                ...mavenVersions.map((entry) => ({ value: entry.id, label: `${entry.name}${entry.isDefault ? "（默认）" : ""}` })),
              ]}
            />
            <SelectField
              label="Settings 文件"
              value={draft.settingsId}
              onChange={(value) => updateIdeaProjectDraft(project.id, { settingsId: value })}
              options={[
                { value: "", label: globalSettingsEntries.length ? "请选择全局 settings" : "请先在全局配置添加 settings" },
                ...globalSettingsEntries.map((entry) => ({ value: entry.id, label: `${entry.name}${entry.isDefault ? "（默认）" : ""}` })),
              ]}
            />
            <PathField
              label="Local repository"
              value={draft.localRepository}
              placeholder="读取 IDEA localRepository，可选择本地仓库"
              actions={[{ label: "选择", onClick: () => void chooseIdeaDraftPath(project.id, "localRepository", "directory"), disabled: busy }]}
            />
          </div>
          <div className="project-config-grid">
            <CodeField
              label=".mvn/maven.config"
              value={draft.mavenConfig}
              placeholder={"-DskipTests\n-Pdev"}
              onChange={(value) => updateIdeaProjectDraft(project.id, { mavenConfig: value })}
            />
            <CodeField
              label=".mvn/jvm.config"
              value={draft.jvmConfig}
              placeholder={"-Xmx2g\n-Dfile.encoding=UTF-8"}
              onChange={(value) => updateIdeaProjectDraft(project.id, { jvmConfig: value })}
            />
          </div>
          <p className="hint">保存会把所选全局 Maven 版本写入 IDEA Maven 配置，并把所选全局 settings 复制到项目 .mvn/settings.xml。</p>
          {project.pomFiles.length ? (
            <details className="pom-details">
              <summary>查看 Maven POM 列表</summary>
              <pre>{project.pomFiles.join("\n")}</pre>
            </details>
          ) : null}
        </div>
      </article>
    );
  }

  function renderGlobalConfig() {
    return (
      <Panel
        title="全局配置"
        action={
          <div className="panel-actions">
            <button className="button primary" type="button" onClick={() => void handlePickAndAddMavenVersion("directory")} disabled={busy}>
              <ButtonIcon icon={Plus} />
              添加版本
            </button>
            <button className="button secondary" type="button" onClick={() => void handleDetectAndAddMavenVersion()} disabled={busy}>
              <ButtonIcon icon={Search} />
              自动检测
            </button>
            <button className="button secondary" type="button" onClick={() => void withBusy(async () => { await refreshMavenVersions(); })} disabled={busy}>
              <ButtonIcon icon={RefreshCw} />
              刷新
            </button>
          </div>
        }
      >
        <div className="project-workbench page-workbench">
          <aside className="project-list-panel" aria-label="Maven 版本列表">
            {mavenVersions.length ? (
              mavenVersions.map((entry) => (
                <button
                  className={`project-list-item ${selectedMavenVersion?.id === entry.id ? "active" : ""}`}
                  type="button"
                  key={entry.id}
                  onClick={() => setSelectedMavenVersionId(entry.id)}
                >
                  <span className="list-item-icon">
                    <ButtonIcon icon={Boxes} />
                  </span>
                  <span>
                    <strong>{entry.name}</strong>
                    <small>{entry.version || entry.mavenHome || entry.mvnPath}</small>
                  </span>
                  {entry.isDefault ? <i>默认</i> : null}
                </button>
              ))
            ) : (
              <EmptyState text="暂无 Maven 版本" compact />
            )}
          </aside>
          <div className="global-config-stack">
            {selectedMavenVersion ? (
              renderMavenVersionEditor(selectedMavenVersion)
            ) : (
              <div className="empty-workbench">
                <EmptyState text="暂无 Maven 版本，请点击添加版本或自动检测" compact />
                <div className="inline-actions centered-actions">
                  <button className="button primary" type="button" onClick={() => void handlePickAndAddMavenVersion("directory")} disabled={busy}>
                    <ButtonIcon icon={Plus} />
                    添加版本
                  </button>
                  <button className="button secondary" type="button" onClick={() => void handleDetectAndAddMavenVersion()} disabled={busy}>
                    <ButtonIcon icon={Search} />
                    自动检测
                  </button>
                </div>
              </div>
            )}
            {renderGlobalSettingsManager()}
            {renderSettingsEditorPanel()}
          </div>
        </div>
      </Panel>
    );
  }

  function renderMavenVersionEditor(entry: MavenVersionEntry) {
    return (
      <article className="item project-editor-pane">
        <div className="item-header">
          <div className="item-title">
            {entry.name}
            {entry.isDefault ? <span className="badge">默认</span> : null}
            {entry.version ? <span className="badge">Maven {entry.version}</span> : null}
          </div>
          <div className="item-actions">
            <button className="button ghost" type="button" onClick={() => void handleSetDefaultMavenVersion(entry)} disabled={busy || entry.isDefault}>
              <ButtonIcon icon={Star} />
              设为默认
            </button>
            <button className="button ghost" type="button" onClick={() => void handleRenameMavenVersion(entry)} disabled={busy}>
              <ButtonIcon icon={Pencil} />
              重命名
            </button>
            <button className="button danger" type="button" onClick={() => void handleDeleteMavenVersion(entry)} disabled={busy}>
              <ButtonIcon icon={Trash2} />
              删除
            </button>
          </div>
        </div>
        <div className="item-body">
          <div className="project-meta">
            <Info label="Maven 版本" value={entry.version || "未识别"} />
            <Info label="Maven Home" value={entry.mavenHome || "未识别"} />
            <Info label="mvn 路径" value={entry.mvnPath} />
            <Info label="Java 版本" value={entry.javaVersion || "未识别"} />
          </div>
          <details className="pom-details maven-output-details">
            <summary>查看 mvn -v 输出</summary>
            <pre>{entry.rawOutput || "无输出"}</pre>
          </details>
          <div className="subsection">
            <div className="subsection-title">
              <h3>手动添加 Maven</h3>
            </div>
            <div className="form-grid">
              <TextField label="显示名称" value={mavenNameInput} onChange={setMavenNameInput} placeholder="例如 Maven 3.9.9" />
              <PathField
                label="Maven 路径"
                value={mavenPathInput}
                placeholder="请选择 Maven Home 或 mvn 可执行文件"
                actions={[
                  { label: "Home", onClick: () => void chooseMavenPath("directory"), disabled: busy },
                  { label: "mvn", onClick: () => void chooseMavenPath("file"), disabled: busy },
                ]}
              />
            </div>
            <div className="inline-actions">
              <button className="button primary" type="button" onClick={() => void handleAddMavenVersion()} disabled={busy || !mavenPathInput.trim()}>
                <ButtonIcon icon={Plus} />
                添加版本
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  function renderGlobalSettingsManager() {
    return (
      <article className="item settings-manager-pane">
        <div className="item-header">
          <div className="item-title">
            全局 Settings 文件
            <span className="badge">{globalSettingsEntries.length} 套</span>
          </div>
        </div>
        <div className="item-body">
          <div className="file-action-grid compact-actions">
            <div className="tool-box">
              <h3>新建 settings</h3>
              <TextField label="配置名称" value={newName} onChange={setNewName} />
              <div className="inline-actions">
                <button className="button secondary" type="button" onClick={() => void handleCreate("empty")} disabled={busy}>
                  <ButtonIcon icon={FilePlus2} />
                  空模板
                </button>
                <button className="button secondary" type="button" onClick={() => void handleCreate("default")} disabled={busy}>
                  <ButtonIcon icon={Copy} />
                  从默认 settings
                </button>
              </div>
            </div>
            <div className="tool-box">
              <h3>导入 XML</h3>
              <PathField
                label="settings.xml 路径"
                value={importPath}
                placeholder="请选择 settings.xml 文件"
                actions={[{ label: "选择", onClick: () => void chooseImportFile(), disabled: busy }]}
              />
              <TextField label="显示名称" value={importName} onChange={setImportName} />
              <div className="inline-actions">
                <button className="button primary" type="button" onClick={() => void handleImport()} disabled={busy || !importPath.trim()}>
                  <ButtonIcon icon={Upload} />
                  导入
                </button>
              </div>
            </div>
          </div>
          <div className="filter-bar">
            <TextField label="筛选配置" value={settingsFilter} onChange={setSettingsFilter} placeholder="按名称、路径、来源或默认状态筛选" full />
            <span className="filter-count">{globalSettingsEntries.length}</span>
          </div>
          <div className="item-list compact-list">
            {globalSettingsEntries.length ? (
              globalSettingsEntries.map((entry) => renderSettingsEntry(entry))
            ) : (
              <EmptyState text={settingsFilter ? "没有匹配的全局配置" : "暂无全局 settings 文件"} compact />
            )}
          </div>
          <div className="subsection">
            <div className="subsection-title">
              <h3>默认配置备份</h3>
              <button className="button secondary" type="button" onClick={() => void withBusy(async () => { await refreshBackups(); })} disabled={busy}>
                <ButtonIcon icon={RefreshCw} />
                刷新备份
              </button>
            </div>
            {backups.length ? (
              <div className="item-list">
                {backups.map((backup) => (
                  <article className="item" key={backup.filePath}>
                    <div className="item-header">
                      <div className="item-title">{backup.fileName}</div>
                      <div className="item-actions">
                        <button className="button ghost" type="button" onClick={() => void handleRestoreBackup(backup)} disabled={busy}>
                          <ButtonIcon icon={RefreshCw} />
                          恢复
                        </button>
                      </div>
                    </div>
                    <div className="item-body compact">
                      <Info label="路径" value={backup.filePath} />
                      <Info label="大小" value={formatBytes(backup.size)} />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState text="暂无备份" compact />
            )}
          </div>
          {settingsIndex?.userSettingsPath ? <p className="hint">默认 settings 路径：{settingsIndex.userSettingsPath}</p> : null}
        </div>
      </article>
    );
  }

  function renderSettingsEntry(entry: SettingsEntry) {
    return (
      <article className={`item ${currentEntry?.id === entry.id ? "selected" : ""}`} key={entry.id}>
        <div className="item-header">
          <div className="item-title">
            {entry.name}
            {entry.isDefault ? <span className="badge">默认</span> : null}
          </div>
        </div>
        <div className="item-body compact settings-entry-body">
          <Info label="路径" value={entry.filePath} />
          <Info label="来源" value={sourceTypeLabel(entry.sourceType)} />
        </div>
        <div className="item-actions inline-row">
          <button className="button ghost" type="button" onClick={() => void openSettings(entry.id)} disabled={busy}>
            <ButtonIcon icon={ExternalLink} />
            打开
          </button>
          <button className="button ghost" type="button" onClick={() => void handleCopyCommand(entry.id)} disabled={busy}>
            <ButtonIcon icon={Copy} />
            命令
          </button>
          <button className="button ghost" type="button" onClick={() => void handleRename(entry)} disabled={busy}>
            <ButtonIcon icon={Pencil} />
            重命名
          </button>
          <button className="button ghost" type="button" onClick={() => void handleDuplicate(entry)} disabled={busy}>
            <ButtonIcon icon={Copy} />
            复制
          </button>
          <button className="button ghost" type="button" onClick={() => void handleSetDefault(entry.id)} disabled={busy}>
            <ButtonIcon icon={Star} />
            默认
          </button>
          <button className="button ghost" type="button" onClick={() => void handleTestSettings(entry.id)} disabled={busy}>
            <ButtonIcon icon={Play} />
            试运行
          </button>
          <button className="button danger" type="button" onClick={() => void handleDelete(entry)} disabled={busy}>
            <ButtonIcon icon={Trash2} />
            删除
          </button>
        </div>
      </article>
    );
  }

  function renderSettingsEditorPanel() {
    if (!currentEntry) {
      return (
        <Panel title="Settings 编辑器">
          <EmptyState text="请选择或新建一套全局 settings 配置" />
        </Panel>
      );
    }

    return (
      <Panel
        title={`编辑：${currentEntry.name}`}
        action={
          <div className="panel-actions">
            {warnings.length ? <span className="warning-count">{warnings.length} 个提醒</span> : null}
            <button className="button secondary" type="button" onClick={() => void handleCopyCommand()} disabled={busy}>
              <ButtonIcon icon={Copy} />
              复制命令
            </button>
            <button className="button secondary" type="button" onClick={() => void handleSetDefault()} disabled={busy}>
              <ButtonIcon icon={Star} />
              设为默认
            </button>
            <button className="button secondary" type="button" onClick={() => void handleTestSettings()} disabled={busy}>
              <ButtonIcon icon={Play} />
              试运行
            </button>
            <button className="button primary" type="button" onClick={() => void handleSave()} disabled={saveDisabled}>
              <ButtonIcon icon={Save} />
              保存
            </button>
          </div>
        }
      >
        {warnings.length ? (
          <div className="message warning">
            {warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
        <div className="editor-tabs" role="tablist" aria-label="Settings 编辑类型">
          {settingsEditorTabs.map((tab) => (
            <button className={`editor-tab ${settingsEditorTab === tab.id ? "active" : ""}`} type="button" key={tab.id} onClick={() => setSettingsEditorTab(tab.id)}>
              <ButtonIcon icon={tab.icon} />
              {tab.title}
            </button>
          ))}
        </div>
        <div className="settings-editor-body">{renderSettingsEditorBody()}</div>
        {mavenTestResult ? (
          <div className="subsection">
            <div className="subsection-title">
              <h3>Settings 试运行</h3>
              <span className={mavenTestResult.success ? "run-state ok" : "run-state fail"}>{mavenTestResult.success ? "通过" : "失败"}</span>
            </div>
            <Info label="命令" value={mavenTestResult.command} />
            <pre className="terminal-output">{mavenTestResult.output || "无输出"}</pre>
          </div>
        ) : null}
      </Panel>
    );
  }

  function renderSettingsEditorBody() {
    if (settingsEditorTab === "basic") {
      return (
        <>
          {preservedFragmentCount ? (
            <div className="message info">
              已保留 {preservedFragmentCount} 段未在表单中展示的高级 XML 配置，可在 XML 页查看和编辑。
            </div>
          ) : null}
          <div className="form-grid">
            <PathField
              label="本地仓库路径"
              value={model.localRepository}
              placeholder="/Users/name/.m2/repository"
              full
              actions={[{ label: "选择", onClick: () => void chooseLocalRepository(), disabled: busy }]}
            />
            <CheckboxField
              label="交互模式"
              checked={model.interactiveMode}
              onChange={(checked) => updateModel((draft) => ({ ...draft, interactiveMode: checked }))}
            />
            <CheckboxField label="离线模式" checked={model.offline} onChange={(checked) => updateModel((draft) => ({ ...draft, offline: checked }))} />
          </div>
        </>
      );
    }

    if (settingsEditorTab === "pluginGroups") {
      return (
        <>
          <div className="subsection-title">
            <h3>插件组</h3>
            <AddButton label="新增插件组" onClick={() => updateModel((draft) => ({ ...draft, pluginGroups: [...draft.pluginGroups, ""] }))} />
          </div>
          {model.pluginGroups.length ? (
            <div className="item-list">
              {model.pluginGroups.map((groupId, index) => (
                <article className="item" key={index}>
                  <div className="item-body row-grid">
                    <TextField
                      label="Group ID"
                      value={groupId}
                      onChange={(value) =>
                        updateModel((draft) => {
                          draft.pluginGroups[index] = value;
                          return draft;
                        })
                      }
                    />
                    <RemoveButton onClick={() => updateModel((draft) => ({ ...draft, pluginGroups: draft.pluginGroups.filter((_, itemIndex) => itemIndex !== index) }))} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState text="暂无插件组" />
          )}
        </>
      );
    }

    if (settingsEditorTab === "mirrors") {
      return (
        <>
          <div className="subsection-title">
            <h3>镜像源</h3>
            <AddButton label="新增镜像" onClick={() => updateModel((draft) => ({ ...draft, mirrors: [...draft.mirrors, emptyMirror()] }))} />
          </div>
          {renderMirrors()}
        </>
      );
    }

    if (settingsEditorTab === "proxies") {
      return (
        <>
          <div className="subsection-title">
            <h3>代理</h3>
            <AddButton label="新增代理" onClick={() => updateModel((draft) => ({ ...draft, proxies: [...draft.proxies, emptyProxy()] }))} />
          </div>
          {renderProxies()}
        </>
      );
    }

    if (settingsEditorTab === "servers") {
      return (
        <>
          <div className="subsection-title">
            <h3>认证服务</h3>
            <AddButton label="新增服务" onClick={() => updateModel((draft) => ({ ...draft, servers: [...draft.servers, emptyServer()] }))} />
          </div>
          {renderServers()}
        </>
      );
    }

    if (settingsEditorTab === "profiles") {
      return (
        <>
          <div className="subsection-title">
            <h3>Profiles</h3>
            <AddButton label="新增 Profile" onClick={() => updateModel((draft) => ({ ...draft, profiles: [...draft.profiles, emptyProfile()] }))} />
          </div>
          {renderProfiles()}
        </>
      );
    }

    return (
      <>
        <textarea className={`textarea ${xmlError ? "invalid" : ""}`} value={xmlText} spellCheck={false} onChange={(event) => handleXmlChange(event.target.value)} />
        {xmlError ? <div className="message error">{xmlError}</div> : <div className="message ok">XML 可解析，已同步到表单</div>}
      </>
    );
  }

  function renderOverview() {
    const entries = settingsIndex?.entries || [];
    const appEntries = entries.filter((entry) => entry.sourceType !== "external").length;
    const externalEntries = entries.length - appEntries;
    const defaultEntry = entries.find((entry) => entry.isDefault);
    const activeProfiles = model.profiles.filter((profile) => profile.active).length;
    const repositoryCount = model.profiles.reduce((count, profile) => count + profile.repositories.length, 0);
    const backupSize = backups.reduce((size, backup) => size + backup.size, 0);
    const componentData = [
      { name: "镜像", value: model.mirrors.length },
      { name: "Profiles", value: model.profiles.length },
      { name: "仓库", value: repositoryCount },
      { name: "服务", value: model.servers.length },
      { name: "代理", value: model.proxies.length },
      { name: "插件组", value: model.pluginGroups.length },
    ];
    const sourceData = [
      { name: "应用内", value: appEntries, color: activeTheme.primary },
      { name: "外部", value: externalEntries, color: activeTheme.secondary },
    ].filter((item) => item.value > 0);
    const componentTotal = componentData.reduce((total, item) => total + item.value, 0);
    const healthScore = clampScore(
      100 -
        warnings.length * 8 -
        (xmlError ? 22 : 0) -
        (!mavenInfo?.version ? 14 : 0) -
        (!currentEntry ? 12 : 0) -
        (!entries.length ? 12 : 0) -
        (mavenTestResult && !mavenTestResult.success ? 10 : 0),
    );
    const latestBackup = backups[0]?.fileName || "暂无备份";
    const mavenState = mavenInfo?.version ? "已识别" : "待检测";
    const testState = mavenTestResult ? (mavenTestResult.success ? "通过" : "失败") : "未执行";

    return (
      <Panel
        title="配置总览"
        action={<span className={`overview-status ${healthScore >= 80 ? "good" : healthScore >= 60 ? "warn" : "bad"}`}>健康度 {healthScore}</span>}
      >
        <div className="overview-hero">
          <div className="overview-copy">
            <h3>{currentEntry ? currentEntry.name : "请选择一套 settings 配置"}</h3>
            <p>
              总览页把 Maven 环境、默认配置、配置构成和备份状态集中在一个工作台里，方便先判断风险，再进入具体编辑页。
            </p>
            <div className="overview-actions">
              <button className="button secondary" type="button" onClick={() => setSection("files")}>
                管理配置
              </button>
              <button className="button primary" type="button" onClick={() => setSection(currentEntry ? "basic" : "environment")}>
                {currentEntry ? "编辑当前配置" : "检测 Maven"}
              </button>
            </div>
          </div>
          <div className="health-meter" aria-label={`配置健康度 ${healthScore}`}>
            <div className="health-ring" style={{ "--score": `${healthScore}%` } as CSSProperties}>
              <span>{healthScore}</span>
            </div>
            <div>
              <strong>{healthScore >= 80 ? "状态稳定" : healthScore >= 60 ? "需要关注" : "建议先修复"}</strong>
              <span>{warnings.length ? `${warnings.length} 个配置提醒` : "暂无配置提醒"}</span>
            </div>
          </div>
        </div>

        <div className="metric-grid">
          <MetricCard label="Maven" value={mavenState} detail={mavenInfo?.version || "未识别版本"} />
          <MetricCard label="配置文件" value={`${entries.length}`} detail={defaultEntry?.name ? `默认：${defaultEntry.name}` : "未设置默认配置"} />
          <MetricCard label="当前构成" value={`${componentTotal}`} detail={`${activeProfiles} 个启用 Profile`} />
          <MetricCard label="默认备份" value={`${backups.length}`} detail={`${latestBackup} · ${formatBytes(backupSize)}`} />
        </div>

        <div className="dashboard-grid">
          <figure className="chart-card wide">
            <figcaption>
              <span>当前 settings 构成</span>
              <strong>{componentTotal} 项</strong>
            </figcaption>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={componentData} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "rgba(61, 78, 96, 0.72)", fontSize: 12 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "rgba(61, 78, 96, 0.58)", fontSize: 12 }} />
                  <Tooltip cursor={{ fill: activeTheme.primarySoft }} contentStyle={chartTooltipStyle} />
                  <Bar dataKey="value" fill={activeTheme.primary} radius={[9, 9, 4, 4]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>

          <figure className="chart-card">
            <figcaption>
              <span>配置来源</span>
              <strong>{entries.length} 套</strong>
            </figcaption>
            {sourceData.length ? (
              <div className="chart-frame pie-frame">
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={4}>
                      {sourceData.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="chart-legend">
                  {sourceData.map((item) => (
                    <span key={item.name}>
                      <i style={{ background: item.color }} />
                      {item.name} {item.value}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState text="暂无配置来源数据" compact />
            )}
          </figure>

          <div className="chart-card">
            <div className="state-stack">
              <StateRow label="默认配置" value={defaultEntry?.name || "未设置"} tone={defaultEntry ? "good" : "warn"} />
              <StateRow label="XML 状态" value={xmlError ? "解析失败" : "可解析"} tone={xmlError ? "bad" : "good"} />
              <StateRow label="Maven 试运行" value={testState} tone={mavenTestResult?.success ? "good" : mavenTestResult ? "bad" : "neutral"} />
              <StateRow label="高级片段" value={`${preservedFragmentCount} 段保留`} tone={preservedFragmentCount ? "neutral" : "good"} />
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  function renderAppSettings() {
    return (
      <Panel
        title="应用设置"
        action={
          <button className="button secondary" type="button" onClick={resetPreferences}>
            <ButtonIcon icon={RefreshCw} />
            恢复默认
          </button>
        }
      >
        <div className="preference-grid">
          <div className="setting-group">
            <div className="setting-heading">
              <h3>主题色</h3>
              <p>用于主操作、选中状态、图表和重点反馈。</p>
            </div>
            <div className="theme-grid" role="list" aria-label="主题色">
              {THEME_OPTIONS.map((theme) => (
                <button
                  className={`theme-swatch ${preferences.theme === theme.key ? "active" : ""}`}
                  type="button"
                  key={theme.key}
                  onClick={() => updatePreferences({ theme: theme.key })}
                  style={{ "--swatch-color": theme.primary, "--swatch-soft": theme.primarySoft } as CSSProperties}
                >
                  <span className="swatch-dot" />
                  <span>
                    <strong>{theme.name}</strong>
                    <small>{theme.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="setting-group">
            <div className="setting-heading">
              <h3>液态玻璃强度</h3>
              <p>同时调节玻璃透明度、描边亮度和背景模糊半径。</p>
            </div>
            <div className="range-panel">
              <div className="range-header">
                <span>强度</span>
                <strong>{preferences.glassIntensity}%</strong>
              </div>
              <input
                className="range-input"
                type="range"
                min="30"
                max="82"
                step="1"
                value={preferences.glassIntensity}
                onChange={(event) => updatePreferences({ glassIntensity: Number(event.target.value) })}
              />
              <div className="range-scale" aria-hidden="true">
                <span>清透</span>
                <span>均衡</span>
                <span>浓厚</span>
              </div>
            </div>
            <div className="preference-note">
              外观设置会自动保存到本机，不会写入 Maven settings 文件，也不会影响配置内容。
            </div>
          </div>

          <div className="setting-group preview-group">
            <div className="setting-heading">
              <h3>效果预览</h3>
              <p>预览当前主题色与玻璃强度在工具界面中的组合。</p>
            </div>
            <div className="appearance-preview">
              <div className="preview-toolbar">
                <span />
                <span />
                <span />
              </div>
              <div className="preview-card">
                <span className="preview-label">Maven</span>
                <strong>{mavenInfo?.version || "3.9.x"}</strong>
                <p>{currentEntry?.name || "settings.xml"}</p>
                <div className="preview-bars">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <button className="button primary" type="button" onClick={() => setSection("globalConfig")}>
                返回全局配置
              </button>
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  function renderMirrors() {
    if (!model.mirrors.length) return <EmptyState text="暂无镜像源" />;
    return (
      <div className="item-list">
        {model.mirrors.map((mirror, index) => (
          <article className="item" key={index}>
            <ItemHeader title={mirror.id || `镜像 ${index + 1}`} onRemove={() => updateModel((draft) => ({ ...draft, mirrors: draft.mirrors.filter((_, itemIndex) => itemIndex !== index) }))} />
            <div className="item-body form-grid">
              <TextField label="ID" value={mirror.id} onChange={(value) => updateMirror(index, { id: value })} />
              <TextField label="Mirror Of" value={mirror.mirrorOf} onChange={(value) => updateMirror(index, { mirrorOf: value })} />
              <TextField label="名称" value={mirror.name} onChange={(value) => updateMirror(index, { name: value })} />
              <TextField label="URL" value={mirror.url} onChange={(value) => updateMirror(index, { url: value })} />
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderProxies() {
    if (!model.proxies.length) return <EmptyState text="暂无代理" />;
    return (
      <div className="item-list">
        {model.proxies.map((proxy, index) => (
          <article className="item" key={index}>
            <ItemHeader
              title={proxy.id || `代理 ${index + 1}`}
              extra={<CheckboxField label="启用" checked={proxy.active} onChange={(checked) => updateProxy(index, { active: checked })} />}
              onRemove={() => updateModel((draft) => ({ ...draft, proxies: draft.proxies.filter((_, itemIndex) => itemIndex !== index) }))}
            />
            <div className="item-body form-grid">
              <TextField label="ID" value={proxy.id} onChange={(value) => updateProxy(index, { id: value })} />
              <TextField label="协议" value={proxy.protocol} onChange={(value) => updateProxy(index, { protocol: value })} />
              <TextField label="Host" value={proxy.host} onChange={(value) => updateProxy(index, { host: value })} />
              <TextField label="端口" value={proxy.port} onChange={(value) => updateProxy(index, { port: value })} />
              <TextField label="用户名" value={proxy.username} onChange={(value) => updateProxy(index, { username: value })} />
              <TextField label="密码" type="password" value={proxy.password} onChange={(value) => updateProxy(index, { password: value })} />
              <TextField label="Non Proxy Hosts" value={proxy.nonProxyHosts} onChange={(value) => updateProxy(index, { nonProxyHosts: value })} full />
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderServers() {
    if (!model.servers.length) return <EmptyState text="暂无认证服务" />;
    return (
      <div className="item-list">
        {model.servers.map((server, index) => (
          <article className="item" key={index}>
            <ItemHeader title={server.id || `服务 ${index + 1}`} onRemove={() => updateModel((draft) => ({ ...draft, servers: draft.servers.filter((_, itemIndex) => itemIndex !== index) }))} />
            <div className="item-body form-grid">
              <TextField label="ID" value={server.id} onChange={(value) => updateServer(index, { id: value })} />
              <TextField label="用户名" value={server.username} onChange={(value) => updateServer(index, { username: value })} />
              <TextField label="密码" type="password" value={server.password} onChange={(value) => updateServer(index, { password: value })} />
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderProfiles() {
    if (!model.profiles.length) return <EmptyState text="暂无 Profile" />;
    return (
      <div className="item-list">
        {model.profiles.map((profile, profileIndex) => (
          <article className="item" key={profileIndex}>
            <ItemHeader
              title={profile.id || `Profile ${profileIndex + 1}`}
              extra={<CheckboxField label="启用" checked={profile.active} onChange={(checked) => updateProfile(profileIndex, { active: checked })} />}
              onRemove={() => updateModel((draft) => ({ ...draft, profiles: draft.profiles.filter((_, index) => index !== profileIndex) }))}
            />
            <div className="item-body">
              <div className="form-grid">
                <TextField label="ID" value={profile.id} onChange={(value) => updateProfile(profileIndex, { id: value })} />
              </div>
              {renderProfileProperties(profile, profileIndex)}
              {renderProfileRepositories(profile, profileIndex)}
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderProfileProperties(profile: ProfileConfig, profileIndex: number) {
    return (
      <div className="subsection">
        <div className="subsection-title">
          <h3>属性</h3>
          <AddButton
            label="新增属性"
            onClick={() =>
              updateModel((draft) => {
                draft.profiles[profileIndex].properties.push({ key: "", value: "" });
                return draft;
              })
            }
          />
        </div>
        {profile.properties.length ? (
          profile.properties.map((item, index) => (
            <div className="row-grid" key={index}>
              <TextField label="属性名" value={item.key} onChange={(value) => updateProfileProperty(profileIndex, index, { key: value })} />
              <TextField label="属性值" value={item.value} onChange={(value) => updateProfileProperty(profileIndex, index, { value })} />
              <RemoveButton
                onClick={() =>
                  updateModel((draft) => {
                    draft.profiles[profileIndex].properties.splice(index, 1);
                    return draft;
                  })
                }
              />
            </div>
          ))
        ) : (
          <EmptyState text="暂无属性" compact />
        )}
      </div>
    );
  }

  function renderProfileRepositories(profile: ProfileConfig, profileIndex: number) {
    return (
      <div className="subsection">
        <div className="subsection-title">
          <h3>仓库</h3>
          <AddButton
            label="新增仓库"
            onClick={() =>
              updateModel((draft) => {
                draft.profiles[profileIndex].repositories.push({ id: "", url: "", releases: true, snapshots: false });
                return draft;
              })
            }
          />
        </div>
        {profile.repositories.length ? (
          profile.repositories.map((item, index) => (
            <div className="repo-grid" key={index}>
              <TextField label="ID" value={item.id} onChange={(value) => updateProfileRepository(profileIndex, index, { id: value })} />
              <TextField label="URL" value={item.url} onChange={(value) => updateProfileRepository(profileIndex, index, { url: value })} />
              <CheckboxField label="Releases" checked={item.releases} onChange={(checked) => updateProfileRepository(profileIndex, index, { releases: checked })} />
              <CheckboxField label="Snapshots" checked={item.snapshots} onChange={(checked) => updateProfileRepository(profileIndex, index, { snapshots: checked })} />
              <RemoveButton
                onClick={() =>
                  updateModel((draft) => {
                    draft.profiles[profileIndex].repositories.splice(index, 1);
                    return draft;
                  })
                }
              />
            </div>
          ))
        ) : (
          <EmptyState text="暂无仓库" compact />
        )}
      </div>
    );
  }

  function updateMirror(index: number, patch: Partial<MirrorConfig>) {
    updateModel((draft) => {
      draft.mirrors[index] = { ...draft.mirrors[index], ...patch };
      return draft;
    });
  }

  function updateProxy(index: number, patch: Partial<ProxyConfig>) {
    updateModel((draft) => {
      draft.proxies[index] = { ...draft.proxies[index], ...patch };
      return draft;
    });
  }

  function updateServer(index: number, patch: Partial<ServerConfig>) {
    updateModel((draft) => {
      draft.servers[index] = { ...draft.servers[index], ...patch };
      return draft;
    });
  }

  function updateProfile(index: number, patch: Partial<ProfileConfig>) {
    updateModel((draft) => {
      draft.profiles[index] = { ...draft.profiles[index], ...patch };
      return draft;
    });
  }

  function updateProfileProperty(profileIndex: number, index: number, patch: Partial<ProfileProperty>) {
    updateModel((draft) => {
      draft.profiles[profileIndex].properties[index] = { ...draft.profiles[profileIndex].properties[index], ...patch };
      return draft;
    });
  }

  function updateProfileRepository(profileIndex: number, index: number, patch: Partial<ProfileRepository>) {
    updateModel((draft) => {
      draft.profiles[profileIndex].repositories[index] = { ...draft.profiles[profileIndex].repositories[index], ...patch };
      return draft;
    });
  }

  function EditorPanel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
      <Panel
        title={title}
        action={
          <div className="panel-actions">
            {warnings.length ? <span className="warning-count">{warnings.length} 个提醒</span> : null}
            {action}
          </div>
        }
      >
        {warnings.length ? (
          <div className="message warning">
            {warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
        {children}
      </Panel>
    );
  }
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">{title}</h2>
        {action}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function StateRow({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <div className="state-row">
      <span>{label}</span>
      <strong className={`state-pill ${tone}`}>{value}</strong>
    </div>
  );
}

function CodeField({
  label,
  value,
  onChange,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field code-field">
      <span>{label}</span>
      <textarea className="textarea code-textarea" value={value} placeholder={placeholder} spellCheck={false} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  full = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  full?: boolean;
}) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>{label}</span>
      <input className="text-input" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="text-input select-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PathField({
  label,
  value,
  actions,
  placeholder = "",
  full = false,
}: {
  label: string;
  value: string;
  actions: Array<{ label: string; onClick: () => void; disabled?: boolean }>;
  placeholder?: string;
  full?: boolean;
}) {
  const primaryAction = actions.find((action) => !action.disabled) ?? actions[0];
  const actionSpace = actions.length > 1 ? "132px" : actions.length === 1 ? "82px" : "12px";
  const pathControlStyle = { "--path-action-space": actionSpace } as CSSProperties;

  const triggerPrimaryAction = () => {
    if (!primaryAction || primaryAction.disabled) return;
    primaryAction.onClick();
  };

  return (
    <div className={`field path-field ${full ? "full" : ""}`}>
      <span className="field-label">{label}</span>
      <div className="path-control" style={pathControlStyle}>
        <input
          className="text-input path-input"
          type="text"
          value={value}
          placeholder={placeholder}
          readOnly
          aria-readonly="true"
          aria-label={label}
          aria-disabled={primaryAction?.disabled ? "true" : undefined}
          onClick={triggerPrimaryAction}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            triggerPrimaryAction();
          }}
        />
        <div className="path-control-actions">
          {actions.map((action) => (
            <button className="button secondary path-picker-button" type="button" key={action.label} onClick={action.onClick} disabled={action.disabled}>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="switch-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ItemHeader({ title, extra, onRemove }: { title: string; extra?: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="item-header">
      <div className="item-title">{title}</div>
      <div className="item-actions">
        {extra}
        <RemoveButton onClick={onRemove} />
      </div>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="button secondary" type="button" onClick={onClick}>
      <ButtonIcon icon={Plus} />
      {label}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="button danger" type="button" onClick={onClick}>
      <ButtonIcon icon={Trash2} />
      删除
    </button>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}>{text}</div>;
}

function ButtonIcon({ icon: IconComponent }: { icon: LucideIcon }) {
  return <IconComponent className="button-icon" aria-hidden="true" strokeWidth={1.8} />;
}

function sourceTypeLabel(sourceType: SourceType): string {
  if (sourceType === "external") return "外部文件";
  if (sourceType === "ideaProject") return "IDEA 项目";
  return "应用内";
}

function ideaProjectDraftFromEntry(project: IdeaProjectEntry): IdeaProjectDraft {
  return {
    mavenVersionId: project.mavenVersionId ?? "",
    localRepository: project.localRepository ?? "",
    settingsId: project.settingsId ?? "",
    mavenConfig: project.mavenConfig ?? "",
    jvmConfig: project.jvmConfig ?? "",
  };
}

function mavenInfoFromVersion(entry: MavenVersionEntry): MavenInfo {
  return {
    mvnPath: entry.mvnPath,
    mavenHome: entry.mavenHome,
    version: entry.version,
    javaVersion: entry.javaVersion,
    rawOutput: entry.rawOutput,
    source: entry.source,
  };
}

function cloneModel(model: SettingsModel): SettingsModel {
  return JSON.parse(JSON.stringify(model)) as SettingsModel;
}

function emptyMirror(): MirrorConfig {
  return { id: "", name: "", url: "", mirrorOf: "*" };
}

function emptyProxy(): ProxyConfig {
  return { id: "", active: true, protocol: "http", host: "", port: "", username: "", password: "", nonProxyHosts: "" };
}

function emptyServer(): ServerConfig {
  return { id: "", username: "", password: "" };
}

function emptyProfile(): ProfileConfig {
  return { id: "", active: false, extraXml: [], properties: [], repositories: [] };
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampGlassIntensity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_APP_PREFERENCES.glassIntensity;
  return Math.max(30, Math.min(82, Math.round(value)));
}

function loadPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    const storedTheme = typeof parsed.theme === "string" ? parsed.theme : "";
    const theme = THEME_OPTIONS.some((item) => item.key === storedTheme) ? (storedTheme as ThemeKey) : DEFAULT_APP_PREFERENCES.theme;
    return {
      theme,
      glassIntensity: clampGlassIntensity(parsed.glassIntensity ?? DEFAULT_APP_PREFERENCES.glassIntensity),
    };
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

function savePreferences(preferences: AppPreferences) {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Appearance preferences are non-critical; ignore storage failures.
  }
}

function applyPreferences(preferences: AppPreferences) {
  const theme = THEME_OPTIONS.find((item) => item.key === preferences.theme) || THEME_OPTIONS[0];
  const intensity = clampGlassIntensity(preferences.glassIntensity) / 100;
  const root = document.documentElement;
  root.style.setProperty("--bg-start", theme.bgStart);
  root.style.setProperty("--bg-mid", theme.bgMid);
  root.style.setProperty("--bg-end", theme.bgEnd);
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-strong", theme.primaryStrong);
  root.style.setProperty("--primary-soft", theme.primarySoft);
  root.style.setProperty("--primary-border", theme.primaryBorder);
  root.style.setProperty("--primary-text", theme.primaryText);
  root.style.setProperty("--info-text", theme.infoText);
  root.style.setProperty("--glass-strong", `rgba(255, 255, 255, ${formatAlpha(0.34 + intensity * 0.5)})`);
  root.style.setProperty("--glass", `rgba(255, 255, 255, ${formatAlpha(0.2 + intensity * 0.5)})`);
  root.style.setProperty("--glass-soft", `rgba(255, 255, 255, ${formatAlpha(0.12 + intensity * 0.42)})`);
  root.style.setProperty("--glass-thin", `rgba(255, 255, 255, ${formatAlpha(0.08 + intensity * 0.34)})`);
  root.style.setProperty("--stroke", `rgba(255, 255, 255, ${formatAlpha(0.42 + intensity * 0.48)})`);
  root.style.setProperty("--hairline", `rgba(255, 255, 255, ${formatAlpha(0.24 + intensity * 0.46)})`);
  root.style.setProperty("--blur-md", `${Math.round(8 + intensity * 12)}px`);
  root.style.setProperty("--blur-lg", `${Math.round(14 + intensity * 18)}px`);
}

function formatAlpha(value: number): string {
  return Math.max(0, Math.min(0.92, value)).toFixed(2);
}
