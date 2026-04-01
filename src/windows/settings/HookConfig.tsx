import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../../i18n";

type Client = "opencode" | "cc";

type HookInfo = {
  id: string;
  label: string;
  description: string;
  category: string;
  default_text: string;
};

type HookAssignment = {
  animation?: string;
  custom_text?: string;
  movement_direction?: string;
  movement_speed?: number;
};

type AnimationEntry = {
  name: string;
  path: string;
  anim_type: string;
  file_size: number;
  assigned_hooks: string[];
};

type Props = {
  client: Client;
  animations: AnimationEntry[];
  onRefresh: () => void;
};

const CATEGORY_ICONS: Record<string, JSX.Element> = {
  session: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  message: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  tool: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
};

export function HookConfig({ client, animations, onRefresh }: Props) {
  const { t } = useI18n();
  const [hooks, setHooks] = useState<HookInfo[]>([]);
  const [hookConfig, setHookConfig] = useState<Record<string, HookAssignment>>({});
  const [loading, setLoading] = useState(true);
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<string, boolean>>({});

  const loadHookData = async () => {
    try {
      const [hookList, config] = await Promise.all([
        invoke<HookInfo[]>("get_available_hooks", { client }),
        invoke<Record<string, HookAssignment>>("get_hook_config", { client }),
      ]);
      setHooks(hookList);
      setHookConfig(config);
    } catch (e) {
      console.error("Failed to load hook data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadHookData();
  }, [client]);

  const handleAssign = async (hookId: string, animationName: string | null) => {
    try {
      await invoke("assign_hook_animation", { client, hookId, animationName });
      await loadHookData();
      onRefresh();
    } catch (e) {
      console.error("Failed to assign hook:", e);
    }
  };

  const handleTextChange = async (hookId: string, text: string) => {
    try {
      await invoke("set_hook_custom_text", { client, hookId, text: text || null });
      setHookConfig((prev) => ({
        ...prev,
        [hookId]: { ...prev[hookId], custom_text: text },
      }));
    } catch (e) {
      console.error("Failed to set custom text:", e);
    }
  };

  const handleMovementDirectionChange = async (hookId: string, direction: string) => {
    try {
      await invoke("set_hook_movement_direction", { client, hookId, direction: direction || null });
      
      // 联动逻辑：当从 "none" 改为有方向时，自动设置默认速度 4
      if (direction !== "none" && direction !== "") {
        const currentConfig = hookConfig[hookId];
        if (!currentConfig?.movement_speed) {
          await invoke("set_hook_movement_speed", { client, hookId, speed: 4 });
        }
      }
      
      setHookConfig((prev) => ({
        ...prev,
        [hookId]: { 
          ...prev[hookId], 
          movement_direction: direction,
          // 当方向改为 none 时，清除速度显示（但保留配置值）
          movement_speed: direction === "none" || direction === "" ? undefined : prev[hookId]?.movement_speed,
        },
      }));
    } catch (e) {
      console.error("Failed to set movement direction:", e);
    }
  };

  const handleSpeedChange = async (hookId: string, speed: number) => {
    try {
      const validSpeed = speed >= 1 && speed <= 8 ? speed : null;
      await invoke("set_hook_movement_speed", { 
        client, 
        hookId, 
        speed: validSpeed 
      });
      setHookConfig((prev) => ({
        ...prev,
        [hookId]: { ...prev[hookId], movement_speed: validSpeed ?? undefined },
      }));
    } catch (e) {
      console.error("Failed to set movement speed:", e);
    }
  };

  const handleReset = async () => {
    if (!confirm(t("hooks.confirmReset"))) return;
    try {
      await invoke("reset_hook_config", { client });
      await loadHookData();
      onRefresh();
    } catch (e) {
      console.error("Failed to reset config:", e);
    }
  };

  const toggleAdvanced = (hookId: string) => {
    setExpandedAdvanced((prev) => ({
      ...prev,
      [hookId]: !prev[hookId],
    }));
  };

  if (loading) {
    return <div className="hook-config-loading">{t("hooks.loading")}</div>;
  }

  const categories = Array.from(new Set(hooks.map((h) => h.category)));

  const getCategoryLabel = (category: string) => {
    const key = `hooks.category.${category}`;
    const label = t(key);
    return label !== key ? label : category.charAt(0).toUpperCase() + category.slice(1);
  };

  const subtitleKey = client === "cc" ? "hooks.subtitle.cc" : "hooks.subtitle.opencode";

  return (
    <div className="hook-config">
      <div className="hook-config-header">
        <h2>{t("hooks.title")}</h2>
        <p>{t(subtitleKey)}</p>
        <button className="reset-btn" onClick={handleReset}>
          {t("hooks.reset")}
        </button>
      </div>

      <div className="hook-config-body">
        {categories.map((category) => {
          const categoryHooks = hooks.filter((h) => h.category === category);
          return (
            <div key={category} className="hook-category">
              <h3 className="category-title">
                <span className="category-icon">
                  {CATEGORY_ICONS[category] ?? CATEGORY_ICONS.tool}
                </span>
                {getCategoryLabel(category)}
              </h3>

              <div className="hook-items">
                {categoryHooks.map((hook) => {
                  const assignment = hookConfig[hook.id] ?? {};
                  const isAdvancedExpanded = expandedAdvanced[hook.id] ?? false;
                  return (
                    <div key={hook.id} className="hook-item">
                      <div className="hook-item-header">
                        <span className="hook-id">{hook.id}</span>
                        <span className="hook-desc">{hook.description}</span>
                      </div>

                      <div className="hook-item-controls">
                        <div className="hook-control">
                          <label>{t("hooks.animation")}</label>
                          <select
                            value={assignment.animation ?? ""}
                            onChange={(e) =>
                              handleAssign(hook.id, e.target.value || null)
                            }
                          >
                            <option value="">{t("hooks.none")}</option>
                            {animations.map((anim) => (
                              <option key={anim.name} value={anim.name}>
                                {anim.name} ({anim.anim_type})
                              </option>
                            ))}
                          </select>
                          {assignment.animation && (
                            <button
                              className="clear-btn"
                              onClick={() => handleAssign(hook.id, null)}
                              title="Clear"
                            >
                              ×
                            </button>
                          )}
                        </div>

                        <div className="hook-control">
                          <label>{t("hooks.customText")}</label>
                          <input
                            type="text"
                            placeholder={hook.default_text}
                            value={assignment.custom_text ?? ""}
                            onChange={(e) => handleTextChange(hook.id, e.target.value)}
                          />
                        </div>

                        <div className="advanced-toggle" onClick={() => toggleAdvanced(hook.id)}>
                          <span className={`advanced-arrow ${isAdvancedExpanded ? "expanded" : ""}`}>›</span>
                          <span>{t("hooks.advanced")}</span>
                        </div>

                        {isAdvancedExpanded && (
                          <div className="advanced-settings">
                            <div className="hook-control">
                              <label>{t("hooks.movementDirection")}</label>
                              <select
                                value={assignment.movement_direction ?? ""}
                                onChange={(e) =>
                                  handleMovementDirectionChange(hook.id, e.target.value || "")
                                }
                              >
                                <option value="">{t("hooks.movementNone")}</option>
                                <option value="horizontal">{t("hooks.movementHorizontal")}</option>
                                <option value="vertical">{t("hooks.movementVertical")}</option>
                              </select>
                            </div>

                            {(assignment.movement_direction === "horizontal" || assignment.movement_direction === "vertical") && (
                              <div className="hook-control">
                                <label>{t("hooks.movementSpeed")}</label>
                                <div className="speed-slider-wrapper">
                                  <input
                                    type="range"
                                    min="1"
                                    max="8"
                                    step="1"
                                    value={assignment.movement_speed ?? 4}
                                    onChange={(e) => handleSpeedChange(hook.id, parseInt(e.target.value))}
                                    className="speed-slider"
                                    style={{ "--speed-percent": `${(((assignment.movement_speed ?? 4) - 1) / 7) * 100}%` } as React.CSSProperties}
                                  />
                                </div>
                                <div className="speed-value-bar">
                                  <span className="speed-current-value">{assignment.movement_speed ?? 4}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
