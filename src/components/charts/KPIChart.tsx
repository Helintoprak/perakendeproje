import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface DataPoint {
  month: string;
  actual: number;
  target?: number;
}

interface Props {
  data: DataPoint[];
  type?: 'area' | 'bar' | 'line';
  unit?: string;
  color?: string;
  showTarget?: boolean;
  height?: number;
}

const COLORS = {
  red:    '#D42B2B',
  gray:   '#9CA3AF',
  green:  '#22C55E',
  amber:  '#F59E0B',
};

function CustomTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-brand-border rounded-xl shadow-cardHover p-3 text-xs">
      <p className="font-bold text-brand-black mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-brand-gray">{p.name === 'actual' ? 'Gerçekleşen' : 'Hedef'}:</span>
          <span className="font-semibold text-brand-black">{p.value?.toLocaleString('tr-TR')} {unit}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Yıllık Karşılaştırma Grafiği (Personel vs Mağaza Ortalaması) ─────────────

export interface YearlyPoint {
  month: string;
  personal: number;
  storeAvg: number;
}

function ComparisonTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-brand-border rounded-xl shadow-cardHover p-3 text-xs">
      <p className="font-bold text-brand-black mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-brand-gray">{p.dataKey === 'personal' ? 'Benim Verim' : 'Mağaza Ortalaması'}:</span>
          <span className="font-semibold text-brand-black">{p.value?.toLocaleString('tr-TR')} {unit}</span>
        </div>
      ))}
    </div>
  );
}

export function ComparisonChart({ data, unit, height = 240 }: { data: YearlyPoint[]; unit?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="month" tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip content={<ComparisonTooltip unit={unit} />} />
        <Legend
          formatter={(v) => v === 'personal' ? 'Benim Verim' : 'Mağaza Ortalaması'}
          wrapperStyle={{ fontSize: 11 }}
        />
        <Line
          type="monotone"
          dataKey="personal"
          stroke={COLORS.red}
          strokeWidth={2.5}
          dot={{ r: 4, fill: COLORS.red, strokeWidth: 0 }}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="storeAvg"
          stroke={COLORS.gray}
          strokeWidth={1.5}
          strokeDasharray="6 3"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function KPIChart({ data, type = 'area', unit, color = COLORS.red, showTarget = true, height = 240 }: Props) {
  const commonProps = {
    data,
    margin: { top: 5, right: 10, left: 0, bottom: 0 },
  };
  const axisProps = {
    tick: { fill: '#9CA3AF', fontSize: 11 },
    tickLine: false,
    axisLine: false,
  };

  const renderContent = () => {
    if (type === 'bar') {
      return (
        <BarChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis dataKey="month" {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip content={<CustomTooltip unit={unit} />} />
          <Legend formatter={(v) => v === 'actual' ? 'Gerçekleşen' : 'Hedef'} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="actual" fill={color} radius={[4, 4, 0, 0]} maxBarSize={40} />
          {showTarget && <Bar dataKey="target" fill={COLORS.gray} radius={[4, 4, 0, 0]} maxBarSize={40} opacity={0.4} />}
        </BarChart>
      );
    }

    if (type === 'line') {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis dataKey="month" {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip content={<CustomTooltip unit={unit} />} />
          <Legend formatter={(v) => v === 'actual' ? 'Gerçekleşen' : 'Hedef'} wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="actual" stroke={color} strokeWidth={2.5} dot={{ r: 4, fill: color }} activeDot={{ r: 6 }} />
          {showTarget && <Line type="monotone" dataKey="target" stroke={COLORS.gray} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />}
        </LineChart>
      );
    }

    // area (default)
    return (
      <AreaChart {...commonProps}>
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.15} />
            <stop offset="95%" stopColor={color} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="month" {...axisProps} />
        <YAxis {...axisProps} />
        <Tooltip content={<CustomTooltip unit={unit} />} />
        <Legend formatter={(v) => v === 'actual' ? 'Gerçekleşen' : 'Hedef'} wrapperStyle={{ fontSize: 11 }} />
        <Area
          type="monotone"
          dataKey="actual"
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#grad-${color.replace('#', '')})`}
          dot={{ r: 4, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 6 }}
        />
        {showTarget && (
          <Line type="monotone" dataKey="target" stroke={COLORS.gray} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        )}
      </AreaChart>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      {renderContent()}
    </ResponsiveContainer>
  );
}
