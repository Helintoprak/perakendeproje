interface Props {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  trend?: { value: number; label: string };
  accent?: boolean;
}

export default function StatCard({ label, value, sub, icon, trend, accent }: Props) {
  const isUp = (trend?.value ?? 0) >= 0;
  return (
    <div className={`rounded-xl p-6 border transition-all duration-300 hover:shadow-xl hover:-translate-y-1
      ${accent 
        ? 'bg-brand-red text-white border-brand-red shadow-[0_8px_30px_rgb(179,0,0,0.2)]' 
        : 'bg-white text-brand-black border-brand-border shadow-md'}`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${accent ? 'bg-white/20' : 'bg-brand-lightGray'} text-2xl shadow-inner`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-xs font-black px-2.5 py-1 rounded-lg shadow-sm
            ${accent
              ? 'bg-white text-brand-red'
              : isUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-brand-red'}`}>
            {isUp ? '↑' : '↓'} %{Math.abs(trend.value)} {trend.label}
          </span>
        )}
      </div>
      <div className="space-y-1">
        <p className={`text-3xl font-black tabular-nums tracking-tight ${accent ? 'text-white' : 'text-brand-black'}`}>
          {value}
        </p>
        <p className={`text-sm font-bold tracking-wide uppercase ${accent ? 'text-white/80' : 'text-brand-gray'}`}>
          {label}
        </p>
        {sub && (
          <p className={`text-xs mt-2 font-medium px-2 py-1 rounded-md w-fit ${accent ? 'bg-white/10 text-white/70' : 'bg-brand-lightGray text-brand-gray/80'}`}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}
