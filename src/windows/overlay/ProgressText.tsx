type Props = { text: string };

export function ProgressText({ text }: Props) {
  if (!text) return null;

  return (
    <div className="progress-text">
      <span>{text}</span>
    </div>
  );
}
