type Props = {
  name: string;
  type: string;
  size: number;
  hooks: string[];
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onCheck: (checked: boolean) => void;
  onDelete: () => void;
  onRename: () => void;
};

const TYPE_LABELS: Record<string, { icon: string; color: string }> = {
  lottie: {
    icon: "◆",
    color: "#bf5af2",
  },
  gif: {
    icon: "◉",
    color: "#ff9f0a",
  },
  video: {
    icon: "▶",
    color: "#30d158",
  },
  image: {
    icon: "▣",
    color: "#64d2ff",
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AnimationCard({
  name,
  type,
  size,
  hooks,
  selected,
  checked,
  onSelect,
  onCheck,
  onDelete,
  onRename,
}: Props) {
  const typeInfo = TYPE_LABELS[type] || { icon: "?", color: "#636366" };

  return (
    <div
      className={`animation-card ${selected ? "selected" : ""} ${checked ? "checked" : ""}`}
      onClick={onSelect}
    >
      <div className="card-checkbox">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            e.stopPropagation();
            onCheck(e.target.checked);
          }}
        />
      </div>

      <div className="card-preview">
        <span className="type-icon" style={{ color: typeInfo.color }}>
          {typeInfo.icon}
        </span>
      </div>

      <div className="card-info">
        <span className="card-name">{name}</span>
        <div className="card-meta">
          <span className="card-type" style={{ color: typeInfo.color }}>
            {type.toUpperCase()}
          </span>
          <span className="card-size">{formatSize(size)}</span>
        </div>
        {hooks.length > 0 && (
          <div className="card-hooks">
            {hooks.slice(0, 2).map((hook) => (
              <span key={hook} className="hook-badge">
                {hook.split(".").pop()}
              </span>
            ))}
            {hooks.length > 2 && (
              <span className="hook-badge more">+{hooks.length - 2}</span>
            )}
          </div>
        )}
      </div>

      <div className="card-actions">
        <button
          className="action-btn rename"
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
          title="Rename"
          aria-label="Rename animation"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          className="action-btn delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          aria-label="Delete animation"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
