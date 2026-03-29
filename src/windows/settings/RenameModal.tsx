import { useState, useEffect, useRef } from "react";
import { useI18n } from "../../i18n";

type Props = {
  currentName: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
};

export function RenameModal({ currentName, onConfirm, onCancel }: Props) {
  const { t } = useI18n();
  const [newName, setNewName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (trimmed && trimmed !== currentName) {
      onConfirm(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{t("rename.title")}</h3>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label htmlFor="new-name">{t("rename.newName")}</label>
            <input
              ref={inputRef}
              id="new-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("rename.placeholder")}
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onCancel}>
              {t("rename.cancel")}
            </button>
            <button
              type="submit"
              className="btn-confirm"
              disabled={!newName.trim() || newName.trim() === currentName}
            >
              {t("rename.confirm")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
