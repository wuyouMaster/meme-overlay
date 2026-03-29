import { useState } from "react";
import { useI18n } from "../../i18n";

type LottieFile = {
  id: number;
  name: string;
  lottie_url: string;
  preview_url: string;
  created_at: string;
};

type Props = {
  onImport: (url: string, name: string) => Promise<void>;
};

export function OnlineLibrary({ onImport }: Props) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<LottieFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://api.lottiefiles.com/v2/search?q=${encodeURIComponent(searchQuery)}&page=1`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch from LottieFiles");
      }

      const data = await response.json();
      setResults(data.data || []);
      setSelected(new Set());
    } catch (e) {
      setError(String(e));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleImportSelected = async () => {
    if (selected.size === 0) return;

    setImporting(true);
    let successCount = 0;

    for (const file of results) {
      if (selected.has(file.id)) {
        try {
          await onImport(file.lottie_url, file.name);
          successCount++;
        } catch (e) {
          console.error("Import failed:", file.name, e);
        }
      }
    }

    setImporting(false);
    alert(`${t("online.imported")} ${successCount} ${t("online.animations")}`);
    setSelected(new Set());
  };

  return (
    <div className="online-library">
      <div className="online-header">
        <h3>{t("online.title")}</h3>
        <p>{t("online.subtitle")}</p>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder={t("online.search")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button onClick={handleSearch} disabled={loading}>
          {loading ? t("online.searching") : t("online.searchBtn")}
        </button>
      </div>

      {error && <div className="online-error">{error}</div>}

      {results.length > 0 && (
        <>
          <div className="online-actions">
            <button
              className="import-selected-btn"
              onClick={handleImportSelected}
              disabled={selected.size === 0 || importing}
            >
              {importing
                ? t("online.importing")
                : `${t("online.importSelected")} (${selected.size})`}
            </button>
          </div>

          <div className="online-grid">
            {results.map((file) => (
              <div
                key={file.id}
                className={`online-item ${selected.has(file.id) ? "selected" : ""}`}
                onClick={() => toggleSelect(file.id)}
              >
                <div className="item-preview">
                  {file.preview_url ? (
                    <img
                      src={file.preview_url}
                      alt={file.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="no-preview">No Preview</div>
                  )}
                </div>
                <div className="item-info">
                  <span className="item-name">{file.name}</span>
                </div>
                <div className="item-checkbox">
                  <input
                    type="checkbox"
                    checked={selected.has(file.id)}
                    onChange={() => toggleSelect(file.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && results.length === 0 && searchQuery && (
        <div className="online-empty">
          {t("online.noResults")}
        </div>
      )}

      {!searchQuery && results.length === 0 && (
        <div className="online-empty">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <p>{t("online.searchPrompt")}</p>
          <p className="empty-hint">{t("online.searchHint")}</p>
        </div>
      )}
    </div>
  );
}
