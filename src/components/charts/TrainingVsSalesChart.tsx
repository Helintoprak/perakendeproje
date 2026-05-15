import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useApi } from '../../hooks/useApi';

/**
 * Bilgi Gücü — Eğitim vs. Satış Performansı
 *
 * İki eksenli (Composed) grafik:
 *   • Sol eksen (Çubuk, Gri):  Ortalama Eğitim Tamamlama %
 *   • Sağ eksen (Çizgi, Kırmızı): Ortalama UPT (Satış Etkinliği)
 *
 * Yan tarafta küçük bir Insight kutusu — kuvvetli ilişkinin somut özeti.
 *
 * Dinamik filtreleme:
 *   • month/year/storeId props'ları değişince useApi otomatik refetch eder.
 */

interface TrainingVsSalesPoint {
  month:       string;
  monthNum:    number;
  year:        number;
  avgTraining: number;
  avgUpt:      number;
  sampleSize:  number;
}

interface TrainingVsSalesInsight {
  highAvgUpt:   number;
  allAvgUpt:    number;
  deltaPercent: number;
  sentence:     string;
}

interface TrainingVsSalesData {
  scope:   { storeId: number | null; userCount: number };
  points:  TrainingVsSalesPoint[];
  insight: TrainingVsSalesInsight | null;
}

interface Props {
  month:    number;
  year:     number;
  storeId?: number | null;
}

export default function TrainingVsSalesChart({ month, year, storeId }: Props) {
  const params = { month, year, ...(storeId ? { storeId } : {}) };
  const { data, loading } = useApi<TrainingVsSalesData>(
    '/performance/training-vs-sales',
    params
  );

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-md p-6">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🧠</span>
            <h3 className="text-base lg:text-lg font-black text-brand-black tracking-tight">
              Bilgi Gücü
            </h3>
          </div>
          <p className="text-xs text-brand-gray font-medium mt-1">
            Eğitim tamamlama oranı ile satış etkinliğinin (UPT) son 6 aylık seyri
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-brand-gray">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-brand-gray/60" /> Eğitim %
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-brand-red rounded" /> UPT
          </span>
        </div>
      </div>

      {loading ? (
        <div className="h-[260px] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data || data.points.length === 0 || data.scope.userCount === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Grafik */}
          <div className="lg:col-span-2">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={data.points}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `%${v}`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    tickFormatter={(v) => v.toFixed(1)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E5E7EB',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'Eğitim %') return [`%${value}`, name];
                      if (name === 'UPT')       return [value.toFixed(2), name];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar
                    yAxisId="left"
                    dataKey="avgTraining"
                    name="Eğitim %"
                    fill="#9CA3AF"
                    radius={[6, 6, 0, 0]}
                    barSize={28}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgUpt"
                    name="UPT"
                    stroke="#D42B2B"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#D42B2B' }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Insight kartı */}
          <InsightCard insight={data.insight} userCount={data.scope.userCount} />
        </div>
      )}
    </div>
  );
}

// ─── Insight (Zeka) Kartı ────────────────────────────────────────────────────

function InsightCard({
  insight,
  userCount,
}: {
  insight: TrainingVsSalesInsight | null;
  userCount: number;
}) {
  if (!insight) {
    return (
      <div className="bg-brand-lightGray border border-brand-border rounded-xl p-4 flex flex-col justify-center">
        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-gray mb-2">
          💡 Insight
        </p>
        <p className="text-xs text-brand-gray leading-relaxed">
          Henüz seçili ay için yeterli eğitim/satış verisi yok. Personel kurslarını
          tamamladıkça karşılaştırma burada görünecek.
        </p>
        <p className="text-[10px] text-brand-gray/70 mt-3">
          Kapsam: {userCount} personel
        </p>
      </div>
    );
  }

  const positive = insight.deltaPercent > 0;
  return (
    <div
      className={`rounded-xl p-4 flex flex-col justify-center border ${
        positive
          ? 'bg-brand-red/5 border-brand-red/20'
          : 'bg-amber-50 border-amber-200'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-brand-gray mb-2">
        💡 Insight
      </p>
      <p
        className={`text-xs leading-relaxed font-medium ${
          positive ? 'text-brand-black' : 'text-amber-900'
        }`}
      >
        {insight.sentence}
      </p>
      <div className="grid grid-cols-2 gap-2 mt-3 text-center">
        <div className="bg-white/70 rounded-lg p-2 border border-white">
          <p className="text-[9px] font-bold uppercase tracking-wider text-brand-gray">
            Yüksek Eğitim
          </p>
          <p className="text-base font-black text-brand-red mt-0.5">
            {insight.highAvgUpt.toFixed(2)}
          </p>
          <p className="text-[9px] text-brand-gray">UPT ort.</p>
        </div>
        <div className="bg-white/70 rounded-lg p-2 border border-white">
          <p className="text-[9px] font-bold uppercase tracking-wider text-brand-gray">
            Genel
          </p>
          <p className="text-base font-black text-brand-black mt-0.5">
            {insight.allAvgUpt.toFixed(2)}
          </p>
          <p className="text-[9px] text-brand-gray">UPT ort.</p>
        </div>
      </div>
      <p className="text-[10px] text-brand-gray/80 mt-3">
        Kapsam: {userCount} personel
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-[260px] flex flex-col items-center justify-center text-brand-gray">
      <p className="text-3xl mb-2">📊</p>
      <p className="text-sm font-bold text-brand-black">Henüz veri yok</p>
      <p className="text-xs mt-1">Bu kapsam için eğitim/satış verisi henüz oluşmadı.</p>
    </div>
  );
}
