import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

const MANAGER_ROLES = ['Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'];
const MDO_KPI_ID = 3; // MDO (Müşteri Dönüşüm Oranı) — sadece müdürlere gösterilir

router.use(authenticate);

// ─── KPI Tanımları ────────────────────────────────────────────────────────────
router.get('/kpis', async (_req, res) => {
  const kpis = await prisma.kpiDefinition.findMany({ orderBy: { kpiId: 'asc' } });
  return res.json(kpis);
});

// ─── Kişisel Performans ───────────────────────────────────────────────────────
// GET /api/performance/my?month=4&year=2026
//
// ÖNEMLİ: Mağaza bilgisi User tablosundan değil, her PerformanceActual/Goal
// kaydının kendi StoreID'sinden alınır. Böylece personel rotasyonunda her ayın
// mağaza bilgisi tarihsel olarak doğru gösterilir.
router.get('/my', async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const month  = req.query.month ? parseInt(req.query.month as string) : new Date().getMonth() + 1;
  const year   = req.query.year  ? parseInt(req.query.year  as string) : new Date().getFullYear();

  const [goals, allActuals] = await Promise.all([
    prisma.performanceGoal.findMany({
      where: { userId, month, year },
      include: { kpi: true, store: { select: { storeId: true, storeName: true } } },
    }),
    prisma.performanceActual.findMany({
      where: { userId },
      include: { kpi: true, store: { select: { storeId: true, storeName: true } } },
      orderBy: { recordDate: 'asc' },
    }),
  ]);

  // Seçili aya ait gerçekleşenler
  const monthActuals = allActuals.filter(a => {
    const d = new Date(a.recordDate);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });

  // 12 aylık trend: her KPI için ay bazlı toplam (mağaza adıyla birlikte)
  const trendMonths = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, month - 12 + i, 1);
    return { label: d.toLocaleString('tr-TR', { month: 'short' }), month: d.getMonth() + 1, year: d.getFullYear() };
  });

  const kpiIds = [...new Set([...goals.map(g => g.kpiId), ...allActuals.map(a => a.kpiId)])];
  const trends = kpiIds.reduce<Record<number, { month: string; actual: number; storeName: string | null; target?: number }[]>>((acc, kpiId) => {
    acc[kpiId] = trendMonths.map(tm => {
      const matching = allActuals.filter(a =>
        a.kpiId === kpiId &&
        new Date(a.recordDate).getMonth() + 1 === tm.month &&
        new Date(a.recordDate).getFullYear() === tm.year
      );
      const actual = matching.reduce((s, a) => s + Number(a.actualValue), 0);
      // O ay için en sık görülen mağaza adı (rotasyon: ayın sonundaki mağaza)
      const storeName = matching.length > 0
        ? (matching[matching.length - 1].store?.storeName ?? null)
        : null;
      return { month: tm.label, actual, storeName };
    });
    return acc;
  }, {});

  // Seçili ay için o ayda fiilen çalışılan mağaza adı (Performance kaydından)
  const currentStoreName =
    monthActuals.find(a => a.store?.storeName)?.store?.storeName ??
    goals.find(g => g.store?.storeName)?.store?.storeName ??
    null;

  const isManager = MANAGER_ROLES.includes(req.user!.roleName);

  // MDO (kpiId=3) sadece müdür rollerine döndürülür
  const filteredGoals   = isManager ? goals        : goals.filter(g => g.kpiId !== MDO_KPI_ID);
  const filteredActuals = isManager ? monthActuals : monthActuals.filter(a => a.kpiId !== MDO_KPI_ID);
  const filteredTrends  = isManager ? trends       : Object.fromEntries(
    Object.entries(trends).filter(([kpiId]) => Number(kpiId) !== MDO_KPI_ID)
  );

  return res.json({
    goals:    filteredGoals,
    actuals:  filteredActuals,
    trends:   filteredTrends,
    currentStoreName,
  });
});

// ─── 12 Aylık Karşılaştırma (Personel görünümü) ──────────────────────────────
// GET /api/performance/my-yearly
// Kişisel gerçekleşen vs mağaza personel ortalaması (son 12 ay)
router.get('/my-yearly', async (req: AuthRequest, res) => {
  const userId    = req.user!.userId;
  const storeId   = req.user!.storeId;
  const isManager = MANAGER_ROLES.includes(req.user!.roleName);

  const now = new Date();

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return {
      label:     d.toLocaleString('tr-TR', { month: 'short' }),
      monthNum:  d.getMonth() + 1,
      year:      d.getFullYear(),
      startDate: new Date(d.getFullYear(), d.getMonth(), 1),
      endDate:   new Date(d.getFullYear(), d.getMonth() + 1, 1),
    };
  });

  const startOfPeriod = months[0].startDate;
  const endOfPeriod   = months[months.length - 1].endDate;

  const kpis = await prisma.kpiDefinition.findMany({
    where:   isManager ? {} : { NOT: { kpiId: MDO_KPI_ID } },
    orderBy: { kpiId: 'asc' },
  });

  // Sadece personel (müdür hariç) kullanıcı ID'leri — mağaza ortalaması hesabında gizlilik ve doğruluk
  const staffUsers = storeId
    ? await prisma.user.findMany({
        where: { storeId, status: 1, role: { roleName: { notIn: MANAGER_ROLES } } },
        select: { userId: true },
      })
    : [];
  const staffIds        = staffUsers.map(u => u.userId);
  const storeStaffCount = staffIds.length || 1;

  const [personalActuals, storeActuals] = await Promise.all([
    prisma.performanceActual.findMany({
      where: { userId, recordDate: { gte: startOfPeriod, lt: endOfPeriod } },
    }),
    staffIds.length > 0
      ? prisma.performanceActual.findMany({
          where: { userId: { in: staffIds }, recordDate: { gte: startOfPeriod, lt: endOfPeriod } },
        })
      : Promise.resolve([]),
  ]);

  const yearly: Record<number, Array<{
    month: string; monthNum: number; year: number; personal: number; storeAvg: number;
  }>> = {};

  for (const kpi of kpis) {
    yearly[kpi.kpiId] = months.map(m => {
      const inMonth = (d: Date) =>
        d.getMonth() + 1 === m.monthNum && d.getFullYear() === m.year;

      const personal = personalActuals
        .filter(a => a.kpiId === kpi.kpiId && inMonth(new Date(a.recordDate)))
        .reduce((s, a) => s + Number(a.actualValue), 0);

      const storeTotal = storeActuals
        .filter(a => a.kpiId === kpi.kpiId && inMonth(new Date(a.recordDate)))
        .reduce((s, a) => s + Number(a.actualValue), 0);

      return {
        month:    m.label,
        monthNum: m.monthNum,
        year:     m.year,
        personal:  Math.round(personal),
        storeAvg:  storeStaffCount > 0 ? Math.round(storeTotal / storeStaffCount) : 0,
      };
    });
  }

  return res.json({ yearly });
});

// ─── Mağaza Performansı (Müdür görünümü) ─────────────────────────────────────
// GET /api/performance/store?month=4&year=2026
router.get('/store', async (req: AuthRequest, res) => {
  if (!MANAGER_ROLES.includes(req.user!.roleName)) {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }
  const storeId = req.user!.storeId;
  if (!storeId) return res.status(400).json({ message: 'Mağaza bilgisi yok.' });

  const month = req.query.month ? parseInt(req.query.month as string) : new Date().getMonth() + 1;
  const year  = req.query.year  ? parseInt(req.query.year  as string) : new Date().getFullYear();

  const startDate = new Date(year, month - 1, 1);
  const endDate   = new Date(year, month, 1);

  // Mağazadaki tüm kullanıcılar (özet hesabı için) ve sadece personel (liste için)
  const allUsers = await prisma.user.findMany({
    where: { storeId, status: 1 },
    select: { userId: true, fullName: true, role: { select: { roleName: true, roleId: true } } },
    orderBy: [{ role: { roleId: 'asc' } }, { fullName: 'asc' }],
  });

  // Sadece USER rolü (müdür hariç) → tablo ve hedef formu için
  const storeUsers = allUsers.filter(u => !MANAGER_ROLES.includes(u.role.roleName));
  const allUserIds  = allUsers.map(u => u.userId);
  const staffIds    = storeUsers.map(u => u.userId);

  const [allGoals, actuals] = await Promise.all([
    prisma.performanceGoal.findMany({
      where: { userId: { in: allUserIds }, month, year },
      include: { kpi: true, user: { select: { fullName: true, role: { select: { roleName: true } } } } },
    }),
    prisma.performanceActual.findMany({
      where: { storeId, recordDate: { gte: startDate, lt: endDate } },
      include: { kpi: true, user: { select: { fullName: true } } },
      orderBy: { recordDate: 'desc' },
    }),
  ]);

  // Tablo için sadece personel hedefleri
  const goals = allGoals.filter(g => staffIds.includes(g.userId));

  // Mağaza özeti: TÜM kullanıcıların (müdür dahil) toplamı
  const kpis = await prisma.kpiDefinition.findMany({ orderBy: { kpiId: 'asc' } });
  const storeSummary = kpis.map(kpi => {
    const totalTarget = allGoals.filter(g => g.kpiId === kpi.kpiId).reduce((s, g) => s + Number(g.targetValue), 0);
    const relevantActuals = actuals.filter(a => a.kpiId === kpi.kpiId);
    let totalActual: number;
    if (kpi.kpiId === 4) {
      totalActual = relevantActuals.length > 0
        ? relevantActuals.reduce((s, a) => s + Number(a.actualValue), 0) / relevantActuals.length
        : 0;
    } else {
      totalActual = relevantActuals.reduce((s, a) => s + Number(a.actualValue), 0);
    }
    const rate = totalTarget > 0 ? Math.min((totalActual / totalTarget) * 100, 999) : 0;
    return { kpi, totalTarget, totalActual, rate };
  });

  return res.json({ storeUsers, goals, actuals, storeSummary });
});

// ─── Hedef Ekle / Güncelle ────────────────────────────────────────────────────
// POST /api/performance/goals  body: { userId, kpiId, targetValue, month, year }
router.post('/goals', async (req: AuthRequest, res) => {
  if (!MANAGER_ROLES.includes(req.user!.roleName)) {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }
  const { userId, kpiId, targetValue, month, year } = req.body;

  // Aynı userId+kpiId+month+year için upsert
  const existing = await prisma.performanceGoal.findFirst({ where: { userId, kpiId, month, year } });
  const goal = existing
    ? await prisma.performanceGoal.update({ where: { goalId: existing.goalId }, data: { targetValue } })
    : await prisma.performanceGoal.create({ data: { userId, kpiId, targetValue, month, year } });

  return res.status(201).json(goal);
});

// ─── Gerçekleşen Gir ──────────────────────────────────────────────────────────
// POST /api/performance/actuals  body: { kpiId, actualValue, recordDate }
router.post('/actuals', async (req: AuthRequest, res) => {
  const { kpiId, actualValue, recordDate } = req.body;
  const userId = req.user!.userId;
  const date = new Date(recordDate);

  // Aynı userId+kpiId+date için upsert (duplikasyon önleme)
  const existing = await prisma.performanceActual.findFirst({
    where: { userId, kpiId, recordDate: date },
  });

  const actual = existing
    ? await prisma.performanceActual.update({
        where: { actualId: existing.actualId },
        data: { actualValue, storeId: req.user!.storeId },
        include: { kpi: true },
      })
    : await prisma.performanceActual.create({
        data: {
          userId,
          kpiId,
          actualValue,
          recordDate: date,
          storeId: req.user!.storeId,
        },
        include: { kpi: true },
      });

  return res.status(201).json(actual);
});

// ─── Admin: Mağaza Listesi ────────────────────────────────────────────────────
// GET /api/performance/stores-list
router.get('/stores-list', async (req: AuthRequest, res) => {
  if (req.user!.roleName !== 'Admin') {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }
  const stores = await prisma.store.findMany({
    orderBy: { storeName: 'asc' },
    select: { storeId: true, storeName: true, location: true },
  });
  return res.json(stores);
});

// ─── Admin: Performans Verisi ─────────────────────────────────────────────────
// GET /api/performance/admin?storeId=X&month=M&year=Y
// storeId belirtilirse o mağazanın verisi; belirtilmezse zincir geneli özeti
router.get('/admin', async (req: AuthRequest, res) => {
  if (req.user!.roleName !== 'Admin') {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }

  const month   = req.query.month   ? parseInt(req.query.month   as string) : new Date().getMonth() + 1;
  const year    = req.query.year    ? parseInt(req.query.year    as string) : new Date().getFullYear();
  const storeId = req.query.storeId ? parseInt(req.query.storeId as string) : null;

  const startDate = new Date(year, month - 1, 1);
  const endDate   = new Date(year, month, 1);

  const kpis = await prisma.kpiDefinition.findMany({ orderBy: { kpiId: 'asc' } });

  if (storeId) {
    // ── Tek Mağaza Görünümü ──────────────────────────────────────────────────
    const allUsers = await prisma.user.findMany({
      where: { storeId, status: 1 },
      select: { userId: true, fullName: true, role: { select: { roleName: true, roleId: true } } },
      orderBy: [{ role: { roleId: 'asc' } }, { fullName: 'asc' }],
    });

    const storeUsers = allUsers.filter(u => !MANAGER_ROLES.includes(u.role.roleName));
    const allUserIds = allUsers.map(u => u.userId);
    const staffIds   = storeUsers.map(u => u.userId);

    const [allGoals, actuals] = await Promise.all([
      prisma.performanceGoal.findMany({
        where: { userId: { in: allUserIds }, month, year },
        include: { kpi: true, user: { select: { fullName: true, role: { select: { roleName: true } } } } },
      }),
      prisma.performanceActual.findMany({
        where: { storeId, recordDate: { gte: startDate, lt: endDate } },
        include: { kpi: true, user: { select: { fullName: true } } },
        orderBy: { recordDate: 'desc' },
      }),
    ]);

    const goals = allGoals.filter(g => staffIds.includes(g.userId));

    const storeSummary = kpis.map(kpi => {
      const totalTarget = allGoals.filter(g => g.kpiId === kpi.kpiId).reduce((s, g) => s + Number(g.targetValue), 0);
      const relevantActuals = actuals.filter(a => a.kpiId === kpi.kpiId);
      let totalActual: number;
      if (kpi.kpiId === 4) {
        totalActual = relevantActuals.length > 0
          ? relevantActuals.reduce((s, a) => s + Number(a.actualValue), 0) / relevantActuals.length
          : 0;
      } else {
        totalActual = relevantActuals.reduce((s, a) => s + Number(a.actualValue), 0);
      }
      const rate = totalTarget > 0 ? Math.min((totalActual / totalTarget) * 100, 999) : 0;
      return { kpi, totalTarget, totalActual, rate };
    });

    return res.json({ storeUsers, goals, actuals, storeSummary });
  } else {
    // ── Zincir Geneli Özeti ──────────────────────────────────────────────────
    const [allGoals, allActuals, stores] = await Promise.all([
      prisma.performanceGoal.findMany({
        where: { month, year },
        include: { kpi: true },
      }),
      prisma.performanceActual.findMany({
        where: { recordDate: { gte: startDate, lt: endDate } },
        include: { kpi: true },
      }),
      prisma.store.findMany({
        orderBy: { storeName: 'asc' },
        select: {
          storeId: true, storeName: true,
          users: { where: { status: 1 }, select: { userId: true } },
        },
      }),
    ]);

    // Zincir geneli KPI özeti
    const chainSummary = kpis.map(kpi => {
      // Oran/ortalama KPI'ları: % birimli (MDO) ve UPT — mağaza bazında ortalanır
      const isRateKpi = kpi.unit === '%' || kpi.kpiName.toUpperCase().includes('UPT');

      const relevantActuals = allActuals.filter(a => a.kpiId === kpi.kpiId);
      const relevantGoals   = allGoals.filter(g => g.kpiId === kpi.kpiId);

      let totalActual: number;
      let totalTarget: number;

      if (isRateKpi) {
        // Her mağazanın aktüellerini ortalaması → mağaza ortalamalarının ortalaması
        const storeActualMap = new Map<number, number[]>();
        for (const a of relevantActuals) {
          const sid = a.storeId ?? 0;
          if (!storeActualMap.has(sid)) storeActualMap.set(sid, []);
          storeActualMap.get(sid)!.push(Number(a.actualValue));
        }
        const storeMeans = [...storeActualMap.values()].map(
          vals => vals.reduce((s, v) => s + v, 0) / vals.length
        );
        totalActual = storeMeans.length > 0
          ? storeMeans.reduce((s, v) => s + v, 0) / storeMeans.length
          : 0;

        // Hedef de mağaza bazında ortalaması alınır
        const storeGoalMap = new Map<number, number[]>();
        for (const g of relevantGoals) {
          const sid = g.storeId ?? 0;
          if (!storeGoalMap.has(sid)) storeGoalMap.set(sid, []);
          storeGoalMap.get(sid)!.push(Number(g.targetValue));
        }
        const goalMeans = [...storeGoalMap.values()].map(
          vals => vals.reduce((s, v) => s + v, 0) / vals.length
        );
        totalTarget = goalMeans.length > 0
          ? goalMeans.reduce((s, v) => s + v, 0) / goalMeans.length
          : 0;
      } else {
        totalTarget = relevantGoals.reduce((s, g) => s + Number(g.targetValue), 0);
        totalActual = relevantActuals.reduce((s, a) => s + Number(a.actualValue), 0);
      }

      const rate = totalTarget > 0 ? Math.min((totalActual / totalTarget) * 100, 999) : 0;
      return { kpi, totalTarget, totalActual, rate };
    });

    // Mağaza bazlı özet
    const perStore = stores.map(store => {
      const userIds = store.users.map(u => u.userId);
      const storeGoals   = allGoals  .filter(g => userIds.includes(g.userId));
      const storeActuals = allActuals.filter(a => a.storeId === store.storeId);
      const storeSummary = kpis.map(kpi => {
        const totalTarget = storeGoals.filter(g => g.kpiId === kpi.kpiId).reduce((s, g) => s + Number(g.targetValue), 0);
        const relevantActuals = storeActuals.filter(a => a.kpiId === kpi.kpiId);
        let totalActual: number;
        if (kpi.kpiId === 4) {
          totalActual = relevantActuals.length > 0
            ? relevantActuals.reduce((s, a) => s + Number(a.actualValue), 0) / relevantActuals.length
            : 0;
        } else {
          totalActual = relevantActuals.reduce((s, a) => s + Number(a.actualValue), 0);
        }
        const rate = totalTarget > 0 ? Math.min((totalActual / totalTarget) * 100, 999) : 0;
        return { kpi, totalTarget, totalActual, rate };
      });
      const mainKpi = storeSummary[0];
      return {
        storeId:      store.storeId,
        storeName:    store.storeName,
        staffCount:   userIds.length,
        storeSummary,
        overallRate:  mainKpi ? Math.round(mainKpi.rate) : 0,
      };
    });

    return res.json({ chainSummary, perStore });
  }
});

// ─── Bilgi Gücü: Eğitim vs. Satış Performansı ────────────────────────────────
// GET /api/performance/training-vs-sales?month=4&year=2026&storeId=12
//
// Mantık:
//   • Son 6 ay için her ay (m, y) bazında:
//       - avgTraining: O ayın sonuna kadar tamamlanmış eğitim oranı (kümülatif)
//                      = COMPLETED(userprogress where lastAccess <= ay sonu) / toplam atanan kurs
//                        kullanıcı başına ortalama
//       - avgUPT:      O ayda PerformanceActual (kpiId=4 = UPT) ortalaması
//   • Insight: o ayda eğitim oranı %80+ olan personeller ile geneli karşılaştır.
//
// Kapsam:
//   • Admin: storeId verilmezse tüm zincir; verilirse o mağaza
//   • Müdür: kendi mağazası (storeId query'si yok sayılır, kendi storeId'si kullanılır)
router.get('/training-vs-sales', async (req: AuthRequest, res) => {
  const isAdmin = req.user!.roleName === 'Admin';
  const isMgr   = MANAGER_ROLES.includes(req.user!.roleName);
  if (!isAdmin && !isMgr) {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }

  const month = req.query.month ? parseInt(req.query.month as string) : new Date().getMonth() + 1;
  const year  = req.query.year  ? parseInt(req.query.year  as string) : new Date().getFullYear();

  // Müdür: kendi mağazası; Admin: opsiyonel storeId filtresi
  const scopeStoreId = isAdmin
    ? (req.query.storeId ? parseInt(req.query.storeId as string) : null)
    : (req.user!.storeId ?? null);

  // Kapsamdaki kullanıcılar: sadece personel (müdür/admin hariç) — performans/eğitim takibi için
  const users = await prisma.user.findMany({
    where: {
      status: 1,
      role: { roleName: { notIn: [...MANAGER_ROLES, 'Admin'] } },
      ...(scopeStoreId ? { storeId: scopeStoreId } : {}),
    },
    select: { userId: true },
  });
  const userIds = users.map(u => u.userId);

  if (userIds.length === 0) {
    return res.json({ scope: { storeId: scopeStoreId, userCount: 0 }, points: [], insight: null });
  }

  // 6 aylık pencere: seçili ay (month, 1-tabanlı) en sağda olacak şekilde geriye doğru
  // Örn: month=2 (Şubat) → [Eyl, Eki, Kas, Ara, Oca, Şub]
  const months = Array.from({ length: 6 }, (_, i) => {
    // JS Date constructor'da ay 0-tabanlı: month - 1 hedefin index'i.
    const d = new Date(year, (month - 1) - (5 - i), 1);
    return {
      label:    d.toLocaleString('tr-TR', { month: 'short' }),
      month:    d.getMonth() + 1,
      year:     d.getFullYear(),
      // Ay sonu (kümülatif eğitim filtresi için — exclusive üst sınır)
      monthEnd: new Date(d.getFullYear(), d.getMonth() + 1, 1),
      // Ay aralığı başlangıcı (UPT filtresi için)
      monthStart: new Date(d.getFullYear(), d.getMonth(), 1),
    };
  });
  const periodStart = months[0].monthStart;
  const periodEndExclusive = months[months.length - 1].monthEnd;

  // Tüm dönemin verilerini tek seferde çek (N+1 önleme)
  const [assignments, progresses, uptActuals] = await Promise.all([
    // Atanmış kurs sayısı (kullanıcı bazlı)
    prisma.courseAssignment.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, courseId: true, assignedDate: true },
    }),
    // Kullanıcı kurs ilerlemeleri (lastAccess'a göre kümülatif sayım)
    prisma.userProgress.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, courseId: true, status: true, lastAccess: true, completionRate: true },
    }),
    // UPT actuals (KPI 4) — dönemdeki tüm kayıtlar
    prisma.performanceActual.findMany({
      where: {
        userId: { in: userIds },
        kpiId: 4,
        recordDate: { gte: periodStart, lt: periodEndExclusive },
      },
      select: { userId: true, actualValue: true, recordDate: true },
    }),
  ]);

  // Kullanıcı → atanan kurs sayısı
  const assignedCountByUser = new Map<number, number>();
  for (const a of assignments) {
    assignedCountByUser.set(a.userId, (assignedCountByUser.get(a.userId) ?? 0) + 1);
  }

  // Her ay için aggregate
  const points = months.map(m => {
    // Eğitim: ay sonuna kadar tamamlanmış kurslar / atanmış kurs (kullanıcı başına ortalama)
    const userTrainingRates: number[] = [];
    for (const userId of userIds) {
      const assigned = assignedCountByUser.get(userId) ?? 0;
      if (assigned === 0) continue; // bu kullanıcının hesaba katılması için kursu atanmış olmalı
      const completedByEnd = progresses.filter(p =>
        p.userId === userId &&
        p.status === 'completed' &&
        p.lastAccess && new Date(p.lastAccess) < m.monthEnd
      ).length;
      userTrainingRates.push(Math.min((completedByEnd / assigned) * 100, 100));
    }
    const avgTraining = userTrainingRates.length > 0
      ? Math.round((userTrainingRates.reduce((s, v) => s + v, 0) / userTrainingRates.length) * 10) / 10
      : 0;

    // UPT: o ayın kayıtlarının ortalaması
    const monthUpts = uptActuals.filter(a => {
      const d = new Date(a.recordDate);
      return d.getMonth() + 1 === m.month && d.getFullYear() === m.year;
    });
    const avgUpt = monthUpts.length > 0
      ? Math.round(
          (monthUpts.reduce((s, a) => s + Number(a.actualValue), 0) / monthUpts.length) * 100
        ) / 100
      : 0;

    return {
      month:        m.label,
      monthNum:     m.month,
      year:         m.year,
      avgTraining,
      avgUpt,
      sampleSize:   userTrainingRates.length,
    };
  });

  // Insight: seçili (en son) ay için yüksek-eğitimliler vs. genel ortalama UPT karşılaştırması
  const last = months[months.length - 1];
  const lastMonthUpts = uptActuals.filter(a => {
    const d = new Date(a.recordDate);
    return d.getMonth() + 1 === last.month && d.getFullYear() === last.year;
  });

  // Kullanıcı bazlı: o ay sonuna kadar eğitim tamamlama oranı
  const userTrainingByEnd = new Map<number, number>();
  for (const userId of userIds) {
    const assigned = assignedCountByUser.get(userId) ?? 0;
    if (assigned === 0) continue;
    const completed = progresses.filter(p =>
      p.userId === userId &&
      p.status === 'completed' &&
      p.lastAccess && new Date(p.lastAccess) < last.monthEnd
    ).length;
    userTrainingByEnd.set(userId, (completed / assigned) * 100);
  }

  // Yüksek (>=80%) ve diğer kullanıcı UPT ortalamaları
  let highSum = 0, highCount = 0;
  let allSum = 0, allCount = 0;
  for (const a of lastMonthUpts) {
    const trainingRate = userTrainingByEnd.get(a.userId);
    if (trainingRate === undefined) continue;
    const upt = Number(a.actualValue);
    allSum += upt; allCount++;
    if (trainingRate >= 80) {
      highSum += upt; highCount++;
    }
  }

  let insight: { highAvgUpt: number; allAvgUpt: number; deltaPercent: number; sentence: string } | null = null;
  if (allCount > 0 && highCount > 0) {
    const allAvgUpt  = allSum / allCount;
    const highAvgUpt = highSum / highCount;
    const deltaPercent = allAvgUpt > 0
      ? Math.round(((highAvgUpt - allAvgUpt) / allAvgUpt) * 1000) / 10
      : 0;
    const sentence = deltaPercent > 0
      ? `Eğitimini %80 üzerinde tamamlayan personeller, genel ortalamadan %${deltaPercent} daha fazla satış yapmıştır.`
      : deltaPercent < 0
        ? `Bu ay yüksek eğitimli personellerin UPT'si genel ortalamanın %${Math.abs(deltaPercent)} altında — eğitim takibi güçlendirilmeli.`
        : `Yüksek eğitimli personellerin UPT'si genel ortalamayla aynı seviyede.`;
    insight = {
      highAvgUpt: Math.round(highAvgUpt * 100) / 100,
      allAvgUpt:  Math.round(allAvgUpt * 100) / 100,
      deltaPercent,
      sentence,
    };
  }

  return res.json({
    scope:   { storeId: scopeStoreId, userCount: userIds.length },
    points,
    insight,
  });
});

export default router;
