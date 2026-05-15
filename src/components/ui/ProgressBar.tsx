interface Props {
  value: number;   // 0-100
  label?: string;
  color?: string;
  height?: string;
  showPercent?: boolean;
}

export default function ProgressBar({
  value,
  label,
  color = 'bg-brand-red',
  height = 'h-2',
  showPercent = true,
}: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      {(label || showPercent) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && <span className="text-xs font-medium text-brand-gray">{label}</span>}
          {showPercent && (
            <span className="text-xs font-semibold text-brand-black ml-auto">%{Math.round(clamped)}</span>
          )}
        </div>
      )}
      <div className={`w-full bg-brand-border rounded-full overflow-hidden ${height}`}>
        <div
          className={`${color} ${height} rounded-full transition-all duration-500`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
