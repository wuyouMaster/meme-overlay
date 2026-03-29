import { useI18n } from "../../i18n";

type AnimationEntry = {
  name: string;
};

type Props = {
  selected: string[];
  animations: AnimationEntry[];
  onDelete: (names: string[]) => void;
  onClear: () => void;
};

export function BatchActionBar({ selected, animations, onDelete, onClear }: Props) {
  const { t } = useI18n();

  if (selected.length === 0) return null;

  const handleDelete = () => {
    if (confirm(t("delete.batchConfirm", { count: selected.length }))) {
      onDelete(selected);
    }
  };

  return (
    <div className="batch-bar">
      <span className="batch-count">
        {selected.length} {t("batch.selected")}
      </span>
      <div className="batch-actions">
        <button className="batch-btn delete" onClick={handleDelete}>
          {t("batch.delete")}
        </button>
        <button className="batch-btn clear" onClick={onClear}>
          {t("batch.clear")}
        </button>
      </div>
    </div>
  );
}
