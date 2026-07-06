import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  copyCommand,
  createSettings,
  deleteSettings,
  detectMaven,
  duplicateSettings,
  importSettings,
  listBackups,
  listSettings,
  readSettings,
  renameSettings,
  restoreBackup,
  saveSettings,
  setDefaultSettings,
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
} from "./types";

type Section =
  | "environment"
  | "files"
  | "basic"
  | "pluginGroups"
  | "mirrors"
  | "proxies"
  | "servers"
  | "profiles"
  | "xml";

const sections: Array<{ id: Section; title: string }> = [
  { id: "environment", title: "环境" },
  { id: "files", title: "配置文件" },
  { id: "basic", title: "基础设置" },
  { id: "pluginGroups", title: "插件组" },
  { id: "mirrors", title: "镜像源" },
  { id: "proxies", title: "代理" },
  { id: "servers", title: "认证服务" },
  { id: "profiles", title: "Profiles" },
  { id: "xml", title: "XML" },
];

export default function App() {
  const [section, setSection] = useState<Section>("environment");
  const [mavenInfo, setMavenInfo] = useState<MavenInfo | null>(null);
  const [mavenPathInput, setMavenPathInput] = useState("");
  const [settingsIndex, setSettingsIndex] = useState<SettingsIndex | null>(null);
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

  useEffect(() => {
    void bootstrap();
  }, []);

  const currentEntry = currentDoc?.entry || null;
  const saveDisabled = !currentEntry || Boolean(xmlError) || busy || !dirty;
  const status = useMemo(() => {
    if (notice) return notice;
    if (currentEntry) return `${currentEntry.name}${dirty ? " 有未保存修改" : " 已保存"}`;
    return "请选择或新建 settings 配置";
  }, [currentEntry, dirty, notice]);
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

  async function bootstrap() {
    setBusy(true);
    try {
      try {
        await refreshMaven();
      } catch (error) {
        showError(error);
      }
      const index = await refreshSettings();
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

  async function refreshMaven() {
    const info = await detectMaven();
    setMavenInfo(info);
    setMavenPathInput(info.mvnPath || info.mavenHome || "");
    return info;
  }

  async function refreshSettings() {
    const index = await listSettings();
    setSettingsIndex(index);
    return index;
  }

  async function refreshBackups() {
    const nextBackups = await listBackups();
    setBackups(nextBackups);
    return nextBackups;
  }

  async function applyMavenPath() {
    if (!mavenPathInput.trim()) {
      setNotice("请输入 Maven home 或 mvn 可执行文件路径");
      return;
    }
    await withBusy(async () => {
      const info = await setMavenPath(mavenPathInput.trim());
      setMavenInfo(info);
      setNotice("Maven 路径已更新");
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
    if (switchSection) setSection("basic");
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
      setSection("xml");
    }
    setDirty(false);
    setNotice("");
  }

  async function handleCreate(mode: "empty" | "default") {
    await withBusy(async () => {
      const doc = await createSettings(newName.trim() || "新配置", mode);
      await refreshSettings();
      loadDocument(doc);
      setSection("basic");
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
      setSection("basic");
      setNotice("已导入外部 settings 文件");
    });
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

  async function handleDelete(entry: SettingsEntry) {
    const ok = window.confirm(`删除配置 "${entry.name}"？外部导入文件只会从列表移除。`);
    if (!ok) return;
    await withBusy(async () => {
      await deleteSettings(entry.id);
      const index = await refreshSettings();
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
      setSection("basic");
      setNotice("已复制配置");
    });
  }

  async function handleSave() {
    if (!currentEntry || xmlError) return;
    await withBusy(async () => {
      const doc = await saveSettings(currentEntry.id, xmlText);
      await refreshSettings();
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
      setSection("environment");
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Maven 本地配置管理</h1>
          <p className="status-text">{status}</p>
        </div>
        <div className="toolbar" aria-label="全局操作">
          <button className="button secondary" type="button" onClick={() => void bootstrap()} disabled={busy}>
            刷新
          </button>
          <button className="button secondary" type="button" onClick={() => void handleCopyCommand()} disabled={!currentEntry || busy}>
            复制命令
          </button>
          <button className="button secondary" type="button" onClick={() => void handleSetDefault()} disabled={!currentEntry || busy}>
            设为默认
          </button>
          <button className="button secondary" type="button" onClick={() => void handleTestSettings()} disabled={!currentEntry || busy}>
            试运行
          </button>
          <button className="button primary" type="button" onClick={() => void handleSave()} disabled={saveDisabled}>
            保存
          </button>
        </div>
      </header>

      <main className="workspace">
        <nav className="sidebar" aria-label="配置分组">
          {sections.map((item) => (
            <button
              className={`nav-item ${section === item.id ? "active" : ""}`}
              type="button"
              key={item.id}
              onClick={() => setSection(item.id)}
            >
              {item.title}
            </button>
          ))}
        </nav>

        <section className="content">{renderSection()}</section>
      </main>
    </div>
  );

  function renderSection() {
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
              <TextField label="手动 Maven 路径" value={mavenPathInput} onChange={setMavenPathInput} full />
            </div>
            <div className="inline-actions">
              <button className="button secondary" type="button" onClick={() => void withBusy(async () => { await refreshMaven(); })} disabled={busy}>
                自动检测
              </button>
              <button className="button secondary" type="button" onClick={() => void chooseMavenPath("directory")} disabled={busy}>
                选择 Home
              </button>
              <button className="button secondary" type="button" onClick={() => void chooseMavenPath("file")} disabled={busy}>
                选择 mvn
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
          <div className="split-layout">
            <div className="tool-box">
              <h3>新建配置</h3>
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
              <h3>导入外部文件</h3>
              <TextField label="settings.xml 路径" value={importPath} onChange={setImportPath} />
              <TextField label="显示名称" value={importName} onChange={setImportName} />
              <div className="inline-actions">
                <button className="button secondary" type="button" onClick={() => void chooseImportFile()} disabled={busy}>
                  选择文件
                </button>
                <button className="button primary" type="button" onClick={() => void handleImport()} disabled={busy || !importPath.trim()}>
                  导入
                </button>
              </div>
            </div>
          </div>
          <div className="filter-bar">
            <TextField label="筛选配置" value={settingsFilter} onChange={setSettingsFilter} placeholder="按名称、路径、来源或默认状态筛选" full />
            <span className="filter-count">{filteredEntries.length} / {settingsIndex?.entries.length || 0}</span>
          </div>

          <div className="item-list">
            {filteredEntries.length ? (
              filteredEntries.map((entry) => (
                <article className={`item ${currentEntry?.id === entry.id ? "selected" : ""}`} key={entry.id}>
                  <div className="item-header">
                    <div className="item-title">
                      {entry.name}
                      {entry.isDefault ? <span className="badge">默认</span> : null}
                    </div>
                    <div className="item-actions">
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
                  </div>
                  <div className="item-body compact">
                    <Info label="路径" value={entry.filePath} />
                    <Info label="来源" value={entry.sourceType === "external" ? "外部文件" : "应用内"} />
                  </div>
                </article>
              ))
            ) : (
              <EmptyState text={settingsFilter ? "没有匹配的配置" : "暂无配置文件"} />
            )}
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
            <TextField
              label="本地仓库路径"
              value={model.localRepository}
              onChange={(value) => updateModel((draft) => ({ ...draft, localRepository: value }))}
              placeholder="/Users/name/.m2/repository"
              full
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
      {label}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="button danger" type="button" onClick={onClick}>
      删除
    </button>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}>{text}</div>;
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
