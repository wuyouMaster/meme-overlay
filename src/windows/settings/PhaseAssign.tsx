type Props = {
  name: string;
  currentPhase: string | null;
  onAssign: (name: string, phase: string) => void;
  onUnassign: (phase: string) => void;
};

const PHASES = [
  {
    id: "coding",
    label: "Coding",
    desc: "Shown when agent executes tools",
    icon: "play",
  },
  {
    id: "thinking",
    label: "Thinking",
    desc: "Shown when agent is reasoning",
    icon: "dots",
  },
  {
    id: "success",
    label: "Success",
    desc: "Shown when task completes",
    icon: "check",
  },
];

export function PhaseAssign({
  name,
  currentPhase,
  onAssign,
  onUnassign,
}: Props) {
  return (
    <div className="phase-assign">
      <h3>Assign &quot;{name}&quot; to Phase</h3>
      <div className="phase-options">
        {PHASES.map((phase) => {
          const isActive = currentPhase === phase.id;
          return (
            <button
              key={phase.id}
              className={`phase-btn ${isActive ? "active" : ""}`}
              onClick={() => onAssign(name, phase.id)}
            >
              <span className="phase-label">{phase.label}</span>
              <span className="phase-desc">{phase.desc}</span>
            </button>
          );
        })}
      </div>
      {currentPhase && (
        <button
          className="phase-unassign"
          onClick={() => onUnassign(currentPhase)}
        >
          Remove assignment
        </button>
      )}
    </div>
  );
}
