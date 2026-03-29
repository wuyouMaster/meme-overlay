import { useI18n } from "../../i18n";
import { AnimationCard } from "./AnimationCard";

type AnimationEntry = {
  name: string;
  path: string;
  anim_type: string;
  file_size: number;
  assigned_hooks: string[];
};

type Props = {
  items: AnimationEntry[];
  selected: string | null;
  checked: string[];
  onSelect: (name: string) => void;
  onCheck: (name: string, checked: boolean) => void;
  onDelete: (name: string) => void;
  onRename: (name: string) => void;
};

export function AnimationList({
  items,
  selected,
  checked,
  onSelect,
  onCheck,
  onDelete,
  onRename,
}: Props) {
  const { t } = useI18n();

  if (items.length === 0) {
    return <div className="list-empty">{t("empty.noAnimations")}</div>;
  }

  return (
    <div className="animation-list">
      {items.map((item) => (
        <AnimationCard
          key={item.name}
          name={item.name}
          type={item.anim_type}
          size={item.file_size}
          hooks={item.assigned_hooks}
          selected={selected === item.name}
          checked={checked.includes(item.name)}
          onSelect={() => onSelect(item.name)}
          onCheck={(isChecked) => onCheck(item.name, isChecked)}
          onDelete={() => onDelete(item.name)}
          onRename={() => onRename(item.name)}
        />
      ))}
    </div>
  );
}
