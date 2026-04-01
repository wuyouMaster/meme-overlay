import { useState, useEffect, createContext, useContext, ReactNode } from "react";

type Lang = "en" | "zh";

type Translations = Record<string, Record<Lang, string>>;

const translations: Translations = {
  // Header
  "header.title": {
    en: "Animation Settings",
    zh: "动画设置",
  },
  "header.subtitle": {
    en: "Manage animations for meme-overlay",
    zh: "管理 meme-overlay 动画",
  },

  // Tabs
  "tab.library": { en: "Library", zh: "动画库" },
  "tab.opencode_hooks": { en: "OpenCode Hooks", zh: "OpenCode 钩子" },
  "tab.cc_hooks": { en: "Claude Code Hooks", zh: "Claude Code 钩子" },
  "tab.online": { en: "Online", zh: "在线资源" },

  // Import
  "import.button": { en: "Import Animation", zh: "导入动画" },
  "import.hint": { en: "Drag .json, .gif, .mp4, .webm, .png, .jpg", zh: "拖拽 .json, .gif, .mp4, .webm, .png, .jpg 文件" },
  "import.select": { en: "Select file", zh: "选择文件" },

  // Filter & Sort
  "filter.label": { en: "Filter", zh: "筛选" },
  "sort.label": { en: "Sort", zh: "排序" },
  "filter.all": { en: "All", zh: "全部" },
  "filter.lottie": { en: "Lottie", zh: "Lottie" },
  "filter.gif": { en: "GIF", zh: "GIF" },
  "filter.video": { en: "Video", zh: "视频" },
  "filter.image": { en: "Image", zh: "图片" },
  "sort.name": { en: "Name", zh: "名称" },
  "sort.type": { en: "Type", zh: "类型" },
  "sort.size": { en: "Size", zh: "大小" },

  // Batch
  "batch.selected": { en: "selected", zh: "已选择" },
  "batch.delete": { en: "Delete Selected", zh: "删除选中" },
  "batch.clear": { en: "Clear Selection", zh: "清除选择" },

  // Empty States
  "empty.noAnimations": { en: "No animations imported yet", zh: "暂无已导入的动画" },
  "empty.selectAnimation": { en: "Select an animation to preview", zh: "选择一个动画进行预览" },
  "empty.importHint": { en: 'Click "Import Animation" to add files', zh: '点击"导入动画"添加文件' },

  // Animation Info
  "info.assignedHooks": { en: "Assigned Hooks", zh: "已分配的钩子" },

  // Hooks
  "hooks.title": { en: "Hook Configuration", zh: "钩子配置" },
  "hooks.subtitle.opencode": {
    en: "Assign animations to OpenCode lifecycle hooks",
    zh: "为 OpenCode 生命周期钩子分配动画",
  },
  "hooks.subtitle.cc": {
    en: "Assign animations to Claude Code lifecycle hooks",
    zh: "为 Claude Code 生命周期钩子分配动画",
  },
  "hooks.reset": { en: "Reset to Defaults", zh: "重置为默认" },
  "hooks.animation": { en: "Animation", zh: "动画" },
  "hooks.customText": { en: "Custom Text", zh: "自定义文本" },
  "hooks.none": { en: "None (use default)", zh: "无（使用默认）" },
  "hooks.loading": { en: "Loading hooks...", zh: "加载钩子中..." },
  "hooks.confirmReset": {
    en: "Reset all hook assignments to defaults?",
    zh: "将所有钩子分配重置为默认值？",
  },
  "hooks.movementDirection": { en: "Movement Direction", zh: "运动方向" },
  "hooks.movementNone": { en: "None (Fixed)", zh: "无（固定）" },
  "hooks.movementHorizontal": { en: "Horizontal", zh: "水平" },
  "hooks.movementVertical": { en: "Vertical", zh: "垂直" },
  "hooks.movementSpeed": { en: "Movement Speed", zh: "运动速度" },
  "hooks.speedSlow": { en: "Slow", zh: "慢" },
  "hooks.speedFast": { en: "Fast", zh: "快" },

  // Hook Categories
  "hooks.category.session": { en: "Session Hooks", zh: "会话钩子" },
  "hooks.category.message": { en: "Message Hooks", zh: "消息钩子" },
  "hooks.category.tool": { en: "Tool Hooks", zh: "工具钩子" },


  // Online Library
  "online.title": { en: "LottieFiles Online Library", zh: "LottieFiles 在线资源库" },
  "online.subtitle": {
    en: "Search and import animations directly from LottieFiles",
    zh: "搜索并从 LottieFiles 直接导入动画",
  },
  "online.search": { en: "Search animations...", zh: "搜索动画..." },
  "online.searching": { en: "Searching...", zh: "搜索中..." },
  "online.searchBtn": { en: "Search", zh: "搜索" },
  "online.importSelected": { en: "Import Selected", zh: "导入选中" },
  "online.importing": { en: "Importing...", zh: "导入中..." },
  "online.noResults": {
    en: "No animations found. Try a different search term.",
    zh: "未找到动画，请尝试其他关键词。",
  },
  "online.searchPrompt": {
    en: "Search LottieFiles for animations",
    zh: "在 LottieFiles 中搜索动画",
  },
  "online.searchHint": {
    en: 'Try "loading", "spinner", or "success"',
    zh: '尝试搜索 "loading"、"spinner" 或 "success"',
  },
  "online.imported": { en: "Imported", zh: "已导入" },
  "online.animations": { en: "animation(s)", zh: "个动画" },

  // Rename Modal
  "rename.title": { en: "Rename Animation", zh: "重命名动画" },
  "rename.newName": { en: "New name:", zh: "新名称：" },
  "rename.placeholder": { en: "Enter new name", zh: "输入新名称" },
  "rename.cancel": { en: "Cancel", zh: "取消" },
  "rename.confirm": { en: "Rename", zh: "重命名" },
  "rename.failed": { en: "Rename failed", zh: "重命名失败" },

  // Delete
  "delete.title": { en: "Delete Animation", zh: "删除动画" },
  "delete.confirm": {
    en: "Are you sure you want to delete this animation?",
    zh: "确定要删除这个动画吗？",
  },
  "delete.batchConfirm": {
    en: "Delete {count} animation(s)?",
    zh: "删除 {count} 个动画？",
  },

  // Actions
  "action.rename": { en: "Rename", zh: "重命名" },
  "action.delete": { en: "Delete", zh: "删除" },

  // Language
  "lang.switch": { en: "中文", zh: "English" },
  "lang.current": { en: "Language", zh: "语言" },
};

type I18nContextType = {
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
};

const I18nContext = createContext<I18nContextType>({
  lang: "en",
  t: (key) => key,
  setLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("opencode-lang");
    if (saved === "zh" || saved === "en") return saved;

    // Detect system language
    const systemLang = navigator.language.toLowerCase();
    return systemLang.startsWith("zh") ? "zh" : "en";
  });

  useEffect(() => {
    localStorage.setItem("opencode-lang", lang);
  }, [lang]);

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    let text = translations[key]?.[lang] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

  return (
    <I18nContext.Provider value={{ lang, t, setLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export type { Lang };
