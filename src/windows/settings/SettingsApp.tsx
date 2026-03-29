import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useI18n, type Lang } from "../../i18n";
import { AnimationList } from "./AnimationList";
import { AnimationPreview } from "./AnimationPreview";
import { HookConfig } from "./HookConfig";
import { RenameModal } from "./RenameModal";
import { BatchActionBar } from "./BatchActionBar";
import { OnlineLibrary } from "./OnlineLibrary";
import "../../styles/settings.css";

export type AnimationEntry = {
  name: string;
  path: string;
  anim_type: string;
  file_size: number;
  assigned_hooks: string[];
  bookmark?: string | null;
};

type Tab = "library" | "opencode-hooks" | "cc-hooks" | "online";

// Sidebar navigation icons
const TabIcon = ({ tab }: { tab: Tab }) => {
  switch (tab) {
    case "library":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "opencode-hooks":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      );
    case "cc-hooks":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
        </svg>
      );
    case "online":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
  }
};

// Globe icon for language switch
const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

// Plus icon for import button
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export function SettingsApp() {
  const { t, lang, setLang } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("library");

  const [animations, setAnimations] = useState<AnimationEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [renaming, setRenaming] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<AnimationEntry[]>("list_animations");
      setAnimations(list);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Filter and sort animations
  const filteredAnimations = animations
    .filter((a) => filter === "all" || a.anim_type === filter)
    .sort((a, b) => {
      if (sort === "type") return a.anim_type.localeCompare(b.anim_type);
      if (sort === "size") return b.file_size - a.file_size;
      return a.name.localeCompare(b.name);
    });

  async function handleImport() {
    const selected = await open({
      multiple: true,
      filters: [
        { name: "All Supported", extensions: ["json", "gif", "mp4", "webm", "png", "jpg", "jpeg", "webp", "svg"] },
        { name: "Lottie Animation", extensions: ["json"] },
        { name: "GIF Image", extensions: ["gif"] },
        { name: "Video", extensions: ["mp4", "webm"] },
        { name: "Static Image", extensions: ["png", "jpg", "jpeg", "webp", "svg"] },
      ],
    });

    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];

    for (const p of paths) {
      try {
        await invoke("import_animation", { sourcePath: p });
      } catch (e) {
        console.error("Import failed:", e);
      }
    }
    await refresh();
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (["json", "gif", "mp4", "webm", "png", "jpg", "jpeg", "webp", "svg"].includes(ext || "")) {
          try {
            const path = (file as any).path || file.name;
            await invoke("import_animation", { sourcePath: path });
          } catch (err) {
            console.error("Import failed:", err);
          }
        }
      }
    }
    await refresh();
  }

  async function handleDelete(name: string) {
    try {
      await invoke("delete_animation", { name });
      if (selected === name) setSelected(null);
      setChecked((prev) => prev.filter((n) => n !== name));
      await refresh();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }

  async function handleBatchDelete(names: string[]) {
    try {
      await invoke("batch_delete_animations", { names });
      if (selected && names.includes(selected)) setSelected(null);
      setChecked([]);
      await refresh();
    } catch (e) {
      console.error("Batch delete failed:", e);
    }
  }

  async function handleRename(oldName: string, newName: string) {
    try {
      await invoke("rename_animation", { oldName, newName });
      if (selected === oldName) setSelected(newName);
      setChecked((prev) => prev.map((n) => (n === oldName ? newName : n)));
      setRenaming(null);
      await refresh();
    } catch (e) {
      alert(`${t("rename.failed")}: ${e}`);
    }
  }

  function handleCheck(name: string, isChecked: boolean) {
    setChecked((prev) =>
      isChecked ? [...prev, name] : prev.filter((n) => n !== name)
    );
  }

  async function handleOnlineImport(url: string, name: string) {
    try {
      console.log("Would import:", name, "from", url);
    } catch (e) {
      console.error("Online import failed:", e);
      throw e;
    }
  }

  function toggleLang() {
    setLang(lang === "en" ? "zh" : "en");
  }

  const selectedItem = animations.find((a) => a.name === selected);

  const tabs: { id: Tab; label: string }[] = [
    { id: "library", label: t("tab.library") },
    { id: "opencode-hooks", label: t("tab.opencode_hooks") },
    { id: "cc-hooks", label: t("tab.cc_hooks") },
    { id: "online", label: t("tab.online") },
  ];

  return (
    <div className="settings-root">
      {/* Header */}
      <header className="settings-header">
        <div className="header-left">
          <h1>{t("header.title")}</h1>
          <p>{t("header.subtitle")}</p>
        </div>
        <button className="lang-switch" onClick={toggleLang} title={t("lang.current")}>
          <GlobeIcon />
          <span>{t("lang.switch")}</span>
        </button>
      </header>

      {/* Tab Navigation */}
      <nav className="tab-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error && <div className="settings-error">{error}</div>}

      {/* Main Content */}
      <div className="settings-body">
        {activeTab === "library" && (
          <>
            {/* Sidebar */}
            <aside className="settings-sidebar">
              <div className="sidebar-toolbar">
                <div
                  className="import-zone"
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <button className="import-btn" onClick={handleImport}>
                    <PlusIcon />
                    {t("import.button")}
                  </button>
                  <span className="import-hint">{t("import.hint")}</span>
                </div>

                <div className="filter-bar">
                  <div className="filter-group">
                    <label>{t("filter.label")}</label>
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">{t("filter.all")}</option>
                      <option value="lottie">{t("filter.lottie")}</option>
                      <option value="gif">{t("filter.gif")}</option>
                      <option value="video">{t("filter.video")}</option>
                      <option value="image">{t("filter.image")}</option>
                    </select>
                  </div>
                  <div className="filter-group">
                    <label>{t("sort.label")}</label>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="name">{t("sort.name")}</option>
                      <option value="type">{t("sort.type")}</option>
                      <option value="size">{t("sort.size")}</option>
                    </select>
                  </div>
                </div>
              </div>

              <BatchActionBar
                selected={checked}
                animations={animations}
                onDelete={handleBatchDelete}
                onClear={() => setChecked([])}
              />

              <AnimationList
                items={filteredAnimations}
                selected={selected}
                checked={checked}
                onSelect={setSelected}
                onCheck={handleCheck}
                onDelete={handleDelete}
                onRename={(name) => setRenaming(name)}
              />
            </aside>

            {/* Main Content Area */}
            <main className="settings-content">
              {selectedItem ? (
                <>
                  <div className="preview-panel">
                    <AnimationPreview
                      path={selectedItem.path}
                      animType={selectedItem.anim_type}
                    />
                    <div className="selected-info">
                      <h3>{selectedItem.name}</h3>
                      <p>
                        {selectedItem.anim_type.toUpperCase()} &middot;{" "}
                        {(selectedItem.file_size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    {selectedItem.assigned_hooks.length > 0 && (
                      <div className="assigned-hooks">
                        <label>{t("info.assignedHooks")}</label>
                        <div className="hook-list">
                          {selectedItem.assigned_hooks.map((hook) => (
                            <span key={hook} className="hook-badge">
                              {hook}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <p>{t("empty.selectAnimation")}</p>
                  <p className="empty-hint">{t("empty.importHint")}</p>
                </div>
              )}
            </main>
          </>
        )}

        {activeTab === "opencode-hooks" && (
          <HookConfig client="opencode" animations={animations} onRefresh={refresh} />
        )}

        {activeTab === "cc-hooks" && (
          <HookConfig client="cc" animations={animations} onRefresh={refresh} />
        )}

        {activeTab === "online" && (
          <OnlineLibrary onImport={handleOnlineImport} />
        )}
      </div>

      {/* Rename Modal */}
      {renaming && (
        <RenameModal
          currentName={renaming}
          onConfirm={(newName) => handleRename(renaming, newName)}
          onCancel={() => setRenaming(null)}
        />
      )}
    </div>
  );
}
