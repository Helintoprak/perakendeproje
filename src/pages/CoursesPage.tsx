import { useState, useMemo, FormEvent } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import ProgressBar from '../components/ui/ProgressBar';
import Badge from '../components/ui/Badge';
import StatCard from '../components/ui/StatCard';
import api from '../lib/api';
import CoursePartViewer, { CoursePart } from '../components/CoursePartViewer';
import QuizModal from '../components/QuizModal';

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface CourseAssignment {
  assignmentId: number;
  courseId:     number;
  isMandatory:  boolean;
  deadline:     string | null;
  course: {
    title:      string;
    duration:   number | null;
    contentUrl: string | null;
    totalParts: number;
    parts:      CoursePart[];
    category:   { categoryName: string } | null;
  };
  completedParts: number[];
  progress: { completionRate: number; status: string } | null;
}

interface CourseCategory {
  categoryId: number;
  categoryName: string;
}

interface StoreUser {
  userId: number;
  fullName: string;
  role: { roleName: string };
  store?: { storeId: number; storeName: string } | null; // Admin için
}

interface EducationItem {
  id: number;
  title: string;
  fileUrl: string;
  createdAt: string;
  uploader: { fullName: string };
  isMandatory: boolean;
  assignmentId: number;
  viewedAt: string | null;
}

interface AdminCourse {
  courseId:    number;
  title:       string;
  description: string | null;
  contentUrl:  string | null;
  duration:    number | null;
  totalParts:  number;
  category:    { categoryName: string } | null;
  _count:      { courseAssignments: number };
}

type FilterTab = 'all' | 'in_progress' | 'completed' | 'not_started';

const TAB_LABELS: Record<FilterTab, string> = {
  all:         'Tümü',
  in_progress: 'Devam Eden',
  completed:   'Tamamlandı',
  not_started: 'Başlanmadı',
};

const STATUS_BADGE: Record<string, { label: string; variant: 'green' | 'yellow' | 'gray' | 'red' }> = {
  completed:   { label: 'Tamamlandı',   variant: 'green'  },
  in_progress: { label: 'Devam Ediyor', variant: 'yellow' },
  not_started: { label: 'Başlanmadı',   variant: 'gray'   },
};

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function CoursesPage() {
  const { isManager, isRegionalManager, isAdmin: isSysAdmin } = useAuth();
  const isManagerOrDeputy = isManager || isRegionalManager;

  const { data, loading, refetch }  = useApi<CourseAssignment[]>(isSysAdmin ? '' : '/courses');
  const { data: categories }        = useApi<CourseCategory[]>('/courses/categories');
  // Admin: tüm sistemdeki kurslar; diğerleri: kullanılmaz
  const { data: allCourses, refetch: adminRefetch } = useApi<AdminCourse[]>(isSysAdmin ? '/courses/all' : '');
  // Eğitim materyalleri sadece normal kullanıcılara gösterilir
  const { data: eduData } = useApi<EducationItem[]>(
    (isSysAdmin || isManagerOrDeputy) ? '' : '/educations'
  );

  const [filter, setFilter]           = useState<FilterTab>('all');
  const [showForm, setShowForm]       = useState(false);
  const [starting, setStarting]       = useState<number | null>(null);
  const [completing, setCompleting]   = useState<number | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<number | null>(null);
  const [viewerCourse, setViewerCourse] = useState<CourseAssignment | null>(null);
  const [quizCourse,   setQuizCourse]   = useState<{ courseId: number; title: string } | null>(null);
  const [viewedEduIds, setViewedEduIds] = useState<Set<number>>(new Set());

  const courses    = data ?? [];
  const educations = (isSysAdmin || isManagerOrDeputy) ? [] : (eduData ?? []);

  useMemo(() => {
    if (!isSysAdmin && !isManagerOrDeputy && eduData) {
      setViewedEduIds(new Set((eduData as EducationItem[]).filter(e => e.viewedAt).map(e => e.id)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eduData]);

  const viewedEduCount = educations.filter(e => viewedEduIds.has(e.id) || !!e.viewedAt).length;

  const stats = {
    total:      courses.length + educations.length,
    completed:  courses.filter(c => c.progress?.status === 'completed').length + viewedEduCount,
    inProgress: courses.filter(c => c.progress?.status === 'in_progress').length,
    avgRate:    courses.length
      ? Math.round(courses.reduce((s, c) => s + Number(c.progress?.completionRate ?? 0), 0) / courses.length)
      : 0,
  };

  const filteredCourses = filter === 'all'
    ? courses
    : courses.filter(c => (c.progress?.status ?? 'not_started') === filter);

  const filteredEdus = filter === 'all'
    ? educations
    : filter === 'completed'
      ? educations.filter(e => viewedEduIds.has(e.id) || !!e.viewedAt)
      : filter === 'not_started'
        ? educations.filter(e => !viewedEduIds.has(e.id) && !e.viewedAt)
        : [];

  async function handleStart(courseId: number) {
    setStarting(courseId);
    try { await api.post(`/courses/${courseId}/start`); refetch(); }
    finally { setStarting(null); }
  }

  async function handleViewCourse(item: CourseAssignment) {
    setViewerCourse(item);
    if (!item.progress) {
      try { await api.post(`/courses/${item.courseId}/start`); } catch { /* ok */ }
    }
  }

  async function handleCompleteCourse(courseId: number) {
    setCompleting(courseId);
    try {
      await api.put(`/courses/${courseId}/progress`, { completionRate: 100 });
      refetch();
    } catch { /* sessiz */ }
    finally { setCompleting(null); }
  }

  async function handleDeleteCourse(courseId: number, title: string) {
    if (!confirm(`"${title}" kursunu sistemden tamamen silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz.`)) return;
    setDeletingCourse(courseId);
    try {
      await api.delete(`/courses/${courseId}`);
      adminRefetch();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Silme işlemi başarısız oldu.');
    } finally {
      setDeletingCourse(null);
    }
  }

  async function handleViewEdu(eduId: number, fileUrl: string) {
    window.open(fileUrl, '_blank', 'noreferrer');
    if (viewedEduIds.has(eduId)) return;
    try {
      await api.patch(`/educations/${eduId}/view`);
      setViewedEduIds(prev => new Set(prev).add(eduId));
    } catch { /* sessiz */ }
  }

  // ─── Admin: Sadece Yönetim Görünümü ──────────────────────────────────────────
  if (isSysAdmin) {
    return (
      <>
        <div className="space-y-6">

          {/* Başlık */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-black text-brand-black tracking-tight">
                Eğitim Yönetimi
              </h1>
              <p className="text-sm lg:text-base text-brand-gray font-medium mt-1">
                Tüm mağazalara ve kullanıcılara (Müdürler dahil) kurs atayın
              </p>
            </div>
            <button
              onClick={() => setShowForm(s => !s)}
              className="bg-brand-red hover:bg-brand-redDark text-white text-sm font-bold
                px-6 py-3 rounded-2xl transition-all shadow-lg hover:shadow-xl active:scale-95 flex items-center justify-center gap-2"
            >
              {showForm ? '✕ İptal' : <><span className="text-xl">+</span> Eğitim Ekle / Ata</>}
            </button>
          </div>

          {/* Eğitim Ekleme Formu */}
          {showForm && (
            <AssignForm
              categories={categories ?? []}
              isSysAdmin
              onSuccess={() => { setShowForm(false); adminRefetch(); }}
            />
          )}

          {/* Sistem Geneli İstatistikler */}
          {!showForm && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard
                label="Toplam Kurs"
                value={allCourses?.length ?? 0}
                icon="📚"
                accent
              />
              <StatCard
                label="Toplam Atama"
                value={allCourses?.reduce((s, c) => s + c._count.courseAssignments, 0) ?? 0}
                icon="📋"
              />
              <StatCard
                label="Kategoriler"
                value={categories?.length ?? 0}
                icon="🏷️"
              />
            </div>
          )}

          {/* Tüm Kurslar Tablosu */}
          {!showForm && (
            <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-brand-black">Sistemdeki Tüm Kurslar</h2>
                  <p className="text-xs text-brand-gray mt-0.5">{allCourses?.length ?? 0} kurs</p>
                </div>
              </div>

              {(allCourses ?? []).length === 0 ? (
                <div className="text-center py-16">
                  <span className="text-5xl block mb-3">📚</span>
                  <p className="font-bold text-brand-black">Henüz kurs eklenmemiş</p>
                  <p className="text-sm text-brand-gray mt-1">
                    "+ Eğitim Ekle / Ata" butonuyla kurs yükleyip kullanıcılara atayabilirsiniz.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-brand-lightGray border-b border-brand-border text-xs font-black uppercase tracking-wider text-brand-gray">
                        <th className="text-left px-5 py-3">Kurs</th>
                        <th className="text-left px-4 py-3">Kategori</th>
                        <th className="text-center px-4 py-3">Bölüm</th>
                        <th className="text-center px-4 py-3">Süre</th>
                        <th className="text-center px-4 py-3">Atama</th>
                        <th className="text-center px-4 py-3">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(allCourses ?? []).map((course, i) => {
                        const ext = course.contentUrl
                          ? (course.contentUrl.split('.').pop() ?? '').toUpperCase()
                          : '';
                        const isDeleting = deletingCourse === course.courseId;
                        return (
                          <tr key={course.courseId}
                            className={`border-b border-brand-border/50 ${i % 2 === 0 ? '' : 'bg-brand-lightGray/40'}`}>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                {ext === 'PDF' && <span className="text-lg">📄</span>}
                                {(ext === 'PPTX' || ext === 'PPT') && <span className="text-lg">📊</span>}
                                {!ext && <span className="text-lg">📚</span>}
                                <div>
                                  <p className="font-bold text-brand-black truncate max-w-[240px]">{course.title}</p>
                                  {course.description && (
                                    <p className="text-xs text-brand-gray truncate max-w-[240px]">{course.description}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-brand-gray">
                              {course.category?.categoryName ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-center text-brand-gray">
                              {course.totalParts}
                            </td>
                            <td className="px-4 py-3 text-center text-brand-gray">
                              {course.duration ? `${course.duration} dk` : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black ${
                                course._count.courseAssignments > 0
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-brand-border text-brand-gray'
                              }`}>
                                {course._count.courseAssignments} kişi
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleDeleteCourse(course.courseId, course.title)}
                                disabled={isDeleting}
                                className="inline-flex items-center gap-1 text-xs font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isDeleting ? (
                                  <span className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                ) : '🗑'} Sil
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {viewerCourse && (
          <CoursePartViewer
            courseId={viewerCourse.courseId}
            title={viewerCourse.course.title}
            contentUrl={viewerCourse.course.contentUrl}
            totalParts={viewerCourse.course.totalParts}
            parts={viewerCourse.course.parts}
            completedParts={viewerCourse.completedParts}
            onClose={() => setViewerCourse(null)}
            onUpdate={() => {}}
          />
        )}
      </>
    );
  }

  // ─── Manager / Deputy ve Normal Kullanıcı Görünümü ──────────────────────────
  return (
    <>
    <div className="space-y-6">

      {/* Üst başlık + "Eğitim Ekle" butonu (sadece müdür) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-brand-black tracking-tight">Eğitimlerim</h1>
          <p className="text-sm lg:text-base text-brand-gray font-medium mt-1">Atanmış ve devam eden kurslar</p>
        </div>
        {isManagerOrDeputy && (
          <button
            onClick={() => setShowForm(s => !s)}
            className="bg-brand-red hover:bg-brand-redDark text-white text-sm font-bold
              px-6 py-3 rounded-2xl transition-all shadow-lg hover:shadow-xl active:scale-95 flex items-center justify-center gap-2"
          >
            {showForm ? '✕ İptal' : <><span className="text-xl">+</span> Eğitim Ekle</>}
          </button>
        )}
      </div>

      {/* Manager — Eğitim Ekleme Formu */}
      {isManagerOrDeputy && showForm && (
        <AssignForm
          categories={categories ?? []}
          isSysAdmin={false}
          onSuccess={() => { setShowForm(false); refetch(); }}
        />
      )}

      {/* İstatistik kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
        <StatCard label="Toplam Kurs"  value={stats.total}      icon="📚" accent />
        <StatCard label="Tamamlandı"   value={stats.completed}  icon="✅"
          trend={{ value: stats.total > 0 ? Math.round(stats.completed / stats.total * 100) : 0, label: '%' }} />
        <StatCard label="Devam Eden"   value={stats.inProgress} icon="▶️" />
      </div>

      {/* Genel ilerleme bandı */}
      {courses.length > 0 && (
        <div className="bg-white rounded-xl border border-brand-border shadow-md p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-black text-brand-black tracking-tight">Genel İlerleme</h3>
              <p className="text-sm text-brand-gray font-medium mt-1">
                {stats.completed} / {stats.total} kurs başarıyla tamamlandı
              </p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-brand-red">%{stats.avgRate}</span>
              <span className="text-sm font-bold text-brand-gray uppercase tracking-widest">Başarı</span>
            </div>
          </div>
          <ProgressBar value={stats.avgRate} showPercent={false} height="h-4" />
        </div>
      )}

      {/* Filtre sekmeleri */}
      <div className="flex flex-wrap gap-2 bg-brand-lightGray rounded-2xl p-1.5 w-fit border border-brand-border shadow-inner">
        {(Object.keys(TAB_LABELS) as FilterTab[]).map((tab) => (
          <button key={tab} onClick={() => setFilter(tab)}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              filter === tab
                ? 'bg-white text-brand-red shadow-md scale-[1.02]'
                : 'text-brand-gray hover:text-brand-black hover:bg-white/50'
            }`}>
            {TAB_LABELS[tab]}
            {tab !== 'all' && (
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-lg ${filter === tab ? 'bg-brand-red/10 text-brand-red' : 'bg-brand-border/50 text-brand-gray'}`}>
                {tab === 'in_progress'
                  ? stats.inProgress
                  : tab === 'completed'
                    ? stats.completed
                    : courses.filter(c => (c.progress?.status ?? 'not_started') === 'not_started').length
                      + educations.filter(e => !viewedEduIds.has(e.id) && !e.viewedAt).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Kurs + Eğitim Materyali listesi */}
      {loading ? (
        <LoadingGrid />
      ) : filteredCourses.length === 0 && filteredEdus.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCourses.map((item) => (
            <CourseCard
              key={`c-${item.assignmentId}`}
              item={item}
              onStart={handleStart}
              onView={handleViewCourse}
              onComplete={handleCompleteCourse}
              onQuiz={() => setQuizCourse({ courseId: item.courseId, title: item.course.title })}
              starting={starting === item.courseId}
              completing={completing === item.courseId}
            />
          ))}
          {filteredEdus.map((edu) => (
            <EducationCard
              key={`e-${edu.id}`}
              edu={edu}
              isViewed={viewedEduIds.has(edu.id) || !!edu.viewedAt}
              onView={handleViewEdu}
            />
          ))}
        </div>
      )}
    </div>

    {viewerCourse && (
      <CoursePartViewer
        courseId={viewerCourse.courseId}
        title={viewerCourse.course.title}
        contentUrl={viewerCourse.course.contentUrl}
        totalParts={viewerCourse.course.totalParts}
        parts={viewerCourse.course.parts}
        completedParts={viewerCourse.completedParts}
        onClose={() => setViewerCourse(null)}
        onUpdate={() => refetch()}
      />
    )}

    {quizCourse && (
      <QuizModal
        courseId={quizCourse.courseId}
        courseTitle={quizCourse.title}
        onClose={() => setQuizCourse(null)}
      />
    )}
    </>
  );
}

interface LibraryItem {
  id: number;
  title: string;
  fileUrl: string;
  fileType: string;
  createdAt: string;
  uploader: { fullName: string };
}
interface LibraryResponse {
  items: LibraryItem[];
  total: number;
}

// ─── Eğitim Ekleme Formu (Manager/Deputy + Admin) ────────────────────────────

function AssignForm({ categories, isSysAdmin, onSuccess }: {
  categories: CourseCategory[];
  isSysAdmin: boolean;
  onSuccess: () => void;
}) {
  const { data: storeUsers } = useApi<StoreUser[]>('/courses/store-users');

  const [form, setForm] = useState({
    title:       '',
    description: '',
    duration:    '',
    categoryId:  '',
    deadline:    '',
  });
  const [librarySearch, setLibrarySearch]     = useState('');
  const [selectedLibItem, setSelectedLibItem] = useState<LibraryItem | null>(null);
  const [showLibPicker, setShowLibPicker]     = useState(false);
  const { data: libraryData, loading: libLoading } = useApi<LibraryResponse>(
    showLibPicker ? `/library?limit=50${librarySearch ? `&search=${encodeURIComponent(librarySearch)}` : ''}` : ''
  );
  const [selectedIds, setSelectedIds]     = useState<Set<number>>(new Set());
  const [mandatoryIds, setMandatoryIds]   = useState<Set<number>>(new Set());
  const [search, setSearch]               = useState('');
  const [roleFilter, setRoleFilter]       = useState('');
  const [storeFilter, setStoreFilter]     = useState<number | ''>(''); // Admin için
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState('');
  const [parts, setParts] = useState<{ partNumber: number; title: string; startPage: string; endPage: string }[]>([
    { partNumber: 1, title: 'Bölüm 1', startPage: '', endPage: '' },
  ]);

  const users = storeUsers ?? [];

  // Admin için benzersiz mağaza listesi
  const storeOptions = useMemo(() => {
    if (!isSysAdmin) return [];
    const map = new Map<number, string>();
    users.forEach(u => { if (u.store) map.set(u.store.storeId, u.store.storeName); });
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'tr'))
      .map(([id, name]) => ({ storeId: id, storeName: name }));
  }, [users, isSysAdmin]);

  const roleOptions = useMemo(
    () => [...new Set(users.map(u => u.role.roleName))].sort(),
    [users]
  );

  const filteredUsers = useMemo(() => users.filter(u => {
    const matchStore = !isSysAdmin || !storeFilter || u.store?.storeId === storeFilter;
    const matchName  = u.fullName.toLowerCase().includes(search.toLowerCase());
    const matchRole  = !roleFilter || u.role.roleName === roleFilter;
    return matchStore && matchName && matchRole;
  }), [users, search, roleFilter, storeFilter, isSysAdmin]);

  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every(u => selectedIds.has(u.userId));

  function toggleUser(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    if (selectedIds.has(id)) {
      setMandatoryIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  function toggleAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      filteredUsers.forEach(u => allFilteredSelected ? next.delete(u.userId) : next.add(u.userId));
      return next;
    });
    if (allFilteredSelected) {
      setMandatoryIds(prev => {
        const next = new Set(prev);
        filteredUsers.forEach(u => next.delete(u.userId));
        return next;
      });
    }
  }

  function toggleMandatory(id: number) {
    setMandatoryIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleRole(roleName: string) {
    const roleUsers = filteredUsers.filter(u => u.role.roleName === roleName);
    const allSel = roleUsers.every(u => selectedIds.has(u.userId));
    setSelectedIds(prev => {
      const next = new Set(prev);
      roleUsers.forEach(u => allSel ? next.delete(u.userId) : next.add(u.userId));
      return next;
    });
    if (allSel) {
      setMandatoryIds(prev => {
        const next = new Set(prev);
        roleUsers.forEach(u => next.delete(u.userId));
        return next;
      });
    }
  }

  function setField(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedLibItem) { setError('Lütfen kütüphaneden bir dosya seçin.'); return; }
    if (!form.title.trim()) { setError('Kurs başlığı zorunludur.'); return; }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        title:          form.title.trim(),
        description:    form.description.trim() || undefined,
        duration:       form.duration || undefined,
        categoryId:     form.categoryId || undefined,
        deadline:       form.deadline || undefined,
        libraryId:      selectedLibItem.id,
        userIds:        selectedIds.size > 0 ? [...selectedIds] : [],
        mandatoryUserIds: [...mandatoryIds],
        parts,
        totalParts:     parts.length,
      };

      const { data } = await api.post('/courses/assign', body);
      setSuccess(data.message);
      setForm({ title: '', description: '', duration: '', categoryId: '', deadline: '' });
      setSelectedLibItem(null);
      setLibrarySearch('');
      setShowLibPicker(false);
      setSelectedIds(new Set());
      setMandatoryIds(new Set());
      setSearch('');
      setRoleFilter('');
      setStoreFilter('');
      setParts([{ partNumber: 1, title: 'Bölüm 1', startPage: '', endPage: '' }]);
      setTimeout(() => { setSuccess(''); onSuccess(); }, 1800);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Bir hata oluştu.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card p-6 space-y-5">
      <h3 className="font-bold text-brand-black flex items-center gap-2">
        <span>📚</span> Yeni Eğitim Ekle ve Ata
        {isSysAdmin && (
          <span className="ml-auto text-xs font-medium text-brand-gray bg-brand-lightGray px-2 py-1 rounded-lg">
            Tüm mağazalara atayabilirsiniz
          </span>
        )}
      </h3>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
          ✅ {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-brand-red rounded-xl px-4 py-3 text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Başlık + Kategori */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-brand-black mb-1.5">
              Kurs Başlığı <span className="text-brand-red">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              placeholder="ör. Satış Teknikleri"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-brand-border bg-brand-lightGray
                focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-black mb-1.5">Kategori</label>
            <select
              value={form.categoryId}
              onChange={e => setField('categoryId', e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-brand-border bg-brand-lightGray
                focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
            >
              <option value="">Kategori seçin (isteğe bağlı)</option>
              {categories.map(c => (
                <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Açıklama */}
        <div>
          <label className="block text-xs font-semibold text-brand-black mb-1.5">Açıklama</label>
          <textarea
            value={form.description}
            onChange={e => setField('description', e.target.value)}
            rows={2}
            placeholder="Kurs içeriği hakkında kısa açıklama..."
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-brand-border bg-brand-lightGray
              focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red resize-none"
          />
        </div>

        {/* Kütüphaneden Dosya Seç */}
        <div>
          <label className="block text-xs font-semibold text-brand-black mb-2">
            Kütüphaneden Dosya <span className="text-brand-red">*</span>
          </label>

          {selectedLibItem ? (
            <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-brand-red bg-brand-redLight">
              <span className="text-2xl">
                {selectedLibItem.fileType === 'pdf' ? '📄' : selectedLibItem.fileType === 'video' ? '🎬' : '📊'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-brand-black truncate">{selectedLibItem.title}</p>
                <p className="text-xs text-brand-gray uppercase">{selectedLibItem.fileType}</p>
              </div>
              <button type="button"
                onClick={() => { setSelectedLibItem(null); setShowLibPicker(false); }}
                className="text-brand-gray hover:text-brand-red text-lg shrink-0">✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLibPicker(s => !s)}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed transition-colors text-left ${
                showLibPicker
                  ? 'border-brand-red bg-brand-redLight'
                  : 'border-brand-border bg-brand-lightGray hover:border-brand-red'
              }`}
            >
              <span className="text-2xl">📚</span>
              <span className="text-sm text-brand-gray">
                {showLibPicker ? 'Kütüphane arama paneli açık — aşağıdan seçin' : 'Kütüphaneden seç…'}
              </span>
            </button>
          )}

          {showLibPicker && !selectedLibItem && (
            <div className="mt-2 border border-brand-border rounded-xl overflow-hidden shadow-sm">
              <div className="p-3 border-b border-brand-border bg-brand-lightGray">
                <input
                  type="text"
                  placeholder="Dosya adı ara..."
                  value={librarySearch}
                  onChange={e => setLibrarySearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-brand-border bg-white
                    focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
                />
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-brand-border">
                {libLoading ? (
                  <div className="flex justify-center py-6">
                    <span className="w-5 h-5 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (libraryData?.items ?? []).length === 0 ? (
                  <p className="text-sm text-brand-gray text-center py-6">Dosya bulunamadı</p>
                ) : (
                  (libraryData?.items ?? []).map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setSelectedLibItem(item); setShowLibPicker(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-redLight transition-colors text-left"
                    >
                      <span className="text-lg shrink-0">
                        {item.fileType === 'pdf' ? '📄' : item.fileType === 'video' ? '🎬' : '📊'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-brand-black truncate">{item.title}</p>
                        <p className="text-xs text-brand-gray uppercase">{item.fileType}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Süre + Son Tarih */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-brand-black mb-1.5">Süre (dakika)</label>
            <input
              type="number" min={1} value={form.duration}
              onChange={e => setField('duration', e.target.value)}
              placeholder="ör. 45"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-brand-border bg-brand-lightGray
                focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-black mb-1.5">Son Tarih</label>
            <input
              type="date" value={form.deadline}
              onChange={e => setField('deadline', e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-brand-border bg-brand-lightGray
                focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
            />
          </div>
        </div>

        {/* ─── Kullanıcı Seçici ─── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-brand-black">
              Hedef Kitle {isSysAdmin && <span className="text-brand-gray font-normal">(Tüm mağazalar)</span>}
              {selectedIds.size > 0 && (
                <span className="ml-2 bg-brand-red text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {selectedIds.size} seçildi
                </span>
              )}
              {mandatoryIds.size > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {mandatoryIds.size} zorunlu
                </span>
              )}
            </label>
            <button type="button" onClick={() => { setSelectedIds(new Set()); setMandatoryIds(new Set()); }}
              className="text-xs text-brand-gray hover:text-brand-red transition-colors">
              Seçimi temizle
            </button>
          </div>

          {/* Filtreler: Mağaza (Admin) + Arama + Rol */}
          <div className="flex gap-2 mb-3 flex-wrap">
            {isSysAdmin && (
              <select
                value={storeFilter}
                onChange={e => {
                  setStoreFilter(e.target.value ? parseInt(e.target.value) : '');
                  setSelectedIds(new Set());
                  setMandatoryIds(new Set());
                }}
                className="px-3 py-2 text-sm rounded-xl border border-brand-border bg-brand-lightGray
                  focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
              >
                <option value="">🏢 Tüm Mağazalar</option>
                {storeOptions.map(s => (
                  <option key={s.storeId} value={s.storeId}>{s.storeName}</option>
                ))}
              </select>
            )}
            <input
              type="text"
              placeholder="İsim ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[140px] px-3 py-2 text-sm rounded-xl border border-brand-border bg-brand-lightGray
                focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
            />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-xl border border-brand-border bg-brand-lightGray
                focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
            >
              <option value="">Tüm Roller</option>
              {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Rol bazlı hızlı seçim */}
          {!roleFilter && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {roleOptions.map(roleName => {
                const roleUsers = filteredUsers.filter(u => u.role.roleName === roleName);
                if (roleUsers.length === 0) return null;
                const allSel = roleUsers.every(u => selectedIds.has(u.userId));
                return (
                  <button key={roleName} type="button" onClick={() => toggleRole(roleName)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                      allSel
                        ? 'bg-brand-red text-white border-brand-red'
                        : 'bg-white text-brand-gray border-brand-border hover:border-brand-red hover:text-brand-red'
                    }`}>
                    {roleName} ({roleUsers.length})
                  </button>
                );
              })}
            </div>
          )}

          {/* Kullanıcı listesi */}
          <div className="border border-brand-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2 bg-brand-lightGray border-b border-brand-border">
              <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll}
                className="w-4 h-4 accent-brand-red cursor-pointer" />
              <span className="text-xs font-semibold text-brand-gray">
                {allFilteredSelected ? 'Tümünü kaldır' : 'Tümünü seç'}
                {filteredUsers.length !== users.length && ` (${filteredUsers.length})`}
              </span>
              <span className="text-xs font-semibold text-amber-600">Zorunlu</span>
              <span className="w-4" />
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-brand-border">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-brand-gray text-center py-6">
                  {users.length === 0 ? 'Kullanıcılar yükleniyor...' : 'Kullanıcı bulunamadı'}
                </p>
              ) : (
                filteredUsers.map(u => {
                  const checked     = selectedIds.has(u.userId);
                  const isMandatory = mandatoryIds.has(u.userId);
                  return (
                    <div key={u.userId}
                      className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2.5 transition-colors ${
                        checked ? 'bg-brand-redLight' : 'bg-white hover:bg-brand-lightGray'
                      }`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleUser(u.userId)}
                        className="w-4 h-4 accent-brand-red cursor-pointer shrink-0" />
                      <label onClick={() => toggleUser(u.userId)} className="flex items-center gap-2 cursor-pointer min-w-0">
                        <div className="w-7 h-7 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {u.fullName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-brand-black truncate">{u.fullName}</p>
                          <p className="text-xs text-brand-gray truncate">
                            {u.role.roleName}
                            {isSysAdmin && u.store && (
                              <span className="ml-1 text-brand-gray/60">· {u.store.storeName}</span>
                            )}
                          </p>
                        </div>
                      </label>
                      <button type="button"
                        disabled={!checked}
                        onClick={() => toggleMandatory(u.userId)}
                        title={isMandatory ? 'Zorunlu — tıkla isteğe bağlı yap' : 'İsteğe bağlı — tıkla zorunlu yap'}
                        className={`w-8 h-5 rounded-full transition-all shrink-0 ${
                          !checked ? 'opacity-30 cursor-not-allowed bg-brand-border' :
                          isMandatory ? 'bg-amber-500' : 'bg-brand-border'
                        }`}>
                        <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform mx-0.5 ${isMandatory ? 'translate-x-3' : 'translate-x-0'}`} />
                      </button>
                      {checked && <span className="text-brand-red text-sm shrink-0">✓</span>}
                      {!checked && <span className="w-4" />}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {mandatoryIds.size > 0 && (
            <p className="text-xs text-amber-600 mt-2">
              🔔 {mandatoryIds.size} kişi için zorunlu olarak işaretlendi
            </p>
          )}

          {selectedIds.size === 0 && (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
              <span className="text-base shrink-0">ℹ️</span>
              <span>
                Personel seçimi yapılmadığından eğitim{' '}
                {isSysAdmin
                  ? <strong>tüm aktif kullanıcılara</strong>
                  : <strong>tüm aktif mağaza çalışanlarına</strong>}{' '}
                atanacaktır.
              </span>
            </div>
          )}
        </div>

        {/* ─── Bölüm Listesi ─── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-brand-black">
              Bölümler
              <span className="ml-2 bg-brand-red text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {parts.length}
              </span>
            </label>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => setParts(p => [...p, { partNumber: p.length + 1, title: `Bölüm ${p.length + 1}`, startPage: '', endPage: '' }])}
                className="text-xs font-semibold text-brand-red hover:text-brand-redDark transition-colors">
                + Bölüm Ekle
              </button>
              {parts.length > 1 && (
                <button type="button"
                  onClick={() => setParts(p => p.slice(0, -1))}
                  className="text-xs font-semibold text-brand-gray hover:text-brand-red transition-colors">
                  − Son Bölümü Kaldır
                </button>
              )}
            </div>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {parts.map((part, idx) => (
              <div key={idx} className="bg-brand-lightGray border border-brand-border rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-brand-red text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {part.partNumber}
                  </span>
                  <input
                    type="text"
                    value={part.title}
                    onChange={e => setParts(p => p.map((x, i) => i === idx ? { ...x, title: e.target.value } : x))}
                    placeholder={`Bölüm ${part.partNumber} adı`}
                    className="flex-1 px-3 py-2 text-sm rounded-xl border border-brand-border bg-white
                      focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
                  />
                </div>
                <div className="flex items-center gap-2 pl-9">
                  <label className="text-xs text-brand-gray whitespace-nowrap">Sayfa aralığı:</label>
                  <input
                    type="number" min={1} value={part.startPage}
                    onChange={e => setParts(p => p.map((x, i) => i === idx ? { ...x, startPage: e.target.value } : x))}
                    placeholder="Başlangıç"
                    className="w-24 px-2 py-1.5 text-sm rounded-lg border border-brand-border bg-white
                      focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
                  />
                  <span className="text-xs text-brand-gray">–</span>
                  <input
                    type="number" min={1} value={part.endPage}
                    onChange={e => setParts(p => p.map((x, i) => i === idx ? { ...x, endPage: e.target.value } : x))}
                    placeholder="Bitiş"
                    className="w-24 px-2 py-1.5 text-sm rounded-lg border border-brand-border bg-white
                      focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
                  />
                  {part.startPage && part.endPage && (
                    <span className="text-xs text-green-600 font-medium">s.{part.startPage}–{part.endPage}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-brand-gray mt-1.5">
            Sayfa aralığı girilirse kullanıcı o bölümde yalnızca o sayfaları görür ve son sayfaya ulaşmadan tamamlayamaz.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={saving || !selectedLibItem}
            className="bg-brand-red hover:bg-brand-redDark text-white font-bold px-6 py-2.5 rounded-xl
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Yükleniyor...</>
            ) : `📚 ${selectedIds.size > 0 ? `${selectedIds.size} Kişiye Yükle` : 'Tüm Personele Yükle'}`}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Kurs Kartı ───────────────────────────────────────────────────────────────

const FILE_EXT_META: Record<string, { icon: string; bg: string; txt: string }> = {
  PDF:  { icon: '📄', bg: 'bg-red-50 border-red-200',       txt: 'text-red-600'    },
  PPTX: { icon: '📊', bg: 'bg-orange-50 border-orange-200', txt: 'text-orange-600' },
  PPT:  { icon: '📊', bg: 'bg-orange-50 border-orange-200', txt: 'text-orange-600' },
};

function CourseCard({ item, onStart, onView, onComplete, onQuiz, starting, completing }: {
  item:       CourseAssignment;
  onStart:    (id: number) => void;
  onView:     (item: CourseAssignment) => void;
  onComplete: (id: number) => void;
  onQuiz:     () => void;
  starting:   boolean;
  completing: boolean;
}) {
  const status     = item.progress?.status ?? 'not_started';
  const completion = Number(item.progress?.completionRate ?? 0);
  const badge      = STATUS_BADGE[status] ?? STATUS_BADGE.not_started;
  const isOverdue  = item.deadline && status !== 'completed' && new Date(item.deadline) < new Date();
  const isDone     = status === 'completed';

  const contentUrl  = item.course.contentUrl;
  const cleanUrl    = contentUrl ? contentUrl.split('?')[0].split('#')[0] : '';
  const rawExt      = cleanUrl ? (cleanUrl.split('.').pop() ?? '').toUpperCase() : '';
  // Cloudinary raw upload URL'leri uzantısız gelir — PDF olarak kabul et
  const isCloudinaryRaw = !!contentUrl && contentUrl.includes('/raw/upload/') && !FILE_EXT_META[rawExt];
  const fileMeta    = FILE_EXT_META[rawExt] ?? (isCloudinaryRaw ? FILE_EXT_META['PDF'] : null);
  const isFileBased = !!fileMeta;
  const isUrlBased  = !!contentUrl && !isFileBased;
  const totalParts  = item.course.totalParts ?? 1;
  const completedCount = item.completedParts?.length ?? 0;

  return (
    <div className={`bg-white rounded-xl border transition-all duration-300 hover:shadow-xl p-6 flex flex-col group ${
      item.isMandatory ? 'border-brand-red/30 shadow-[0_4px_20px_rgba(179,0,0,0.05)]' : 'border-brand-border shadow-md'
    }`}>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {item.isMandatory ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-brand-red bg-brand-red/5 border border-brand-red/20 px-2.5 py-1.5 rounded-xl uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse" /> Zorunlu
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-brand-gray bg-brand-lightGray border border-brand-border px-2.5 py-1.5 rounded-xl uppercase tracking-wider">
            ⚪ Gelişim
          </span>
        )}
        <Badge label={badge.label} variant={badge.variant} />
        {fileMeta && (
          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md border ${fileMeta.bg} ${fileMeta.txt}`}>
            {fileMeta.icon} {isCloudinaryRaw ? 'PDF' : rawExt}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0 mb-3">
        <h3 className="font-bold text-brand-black text-sm leading-snug">{item.course.title}</h3>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {item.course.category && <Badge label={item.course.category.categoryName} variant="blue" />}
          {item.course.duration  && <Badge label={`${item.course.duration} dk`} variant="gray" />}
        </div>
      </div>

      <div className="my-2 space-y-1">
        <ProgressBar
          value={completion}
          height="h-2"
          color={isDone ? 'bg-green-500' : status === 'in_progress' ? 'bg-amber-400' : 'bg-brand-border'}
        />
        {totalParts > 1 && (
          <p className="text-xs text-brand-gray">{completedCount}/{totalParts} bölüm tamamlandı</p>
        )}
      </div>

      <div className="mt-auto pt-3 border-t border-brand-border space-y-2">
        {item.deadline && (
          <div className={`text-xs font-medium ${isOverdue ? 'text-brand-red' : 'text-brand-gray'}`}>
            {isOverdue ? '⚠️ ' : '📅 '}Son: {new Date(item.deadline).toLocaleDateString('tr-TR')}
          </div>
        )}

        <div className="flex gap-2">
          {isFileBased && (
            <>
              <button onClick={() => onView(item)}
                className={`flex-1 text-xs font-bold border px-3 py-2 rounded-lg transition-colors text-center ${
                  isDone
                    ? 'text-green-700 border-green-300 bg-green-50 hover:bg-green-100'
                    : 'text-brand-red border-brand-redMid bg-brand-redLight hover:bg-brand-red hover:text-white'
                }`}>
                {isDone ? '👁 Tekrar Görüntüle' : status === 'in_progress' ? `▶ Devam Et (${completedCount}/${totalParts})` : '👁 Görüntüle'}
              </button>
              {isDone && (
                <button onClick={onQuiz} title="AI quiz"
                  className="text-xs font-bold text-purple-700 border border-purple-300 bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-lg transition-colors whitespace-nowrap">
                  🧠 Quiz
                </button>
              )}
            </>
          )}

          {isUrlBased && (
            <>
              <button
                onClick={() => { window.open(contentUrl!, '_blank', 'noreferrer'); if (status === 'not_started') onStart(item.courseId); }}
                disabled={starting}
                className={`flex-1 text-xs font-bold border px-3 py-2 rounded-lg transition-colors text-center ${
                  isDone ? 'text-green-700 border-green-300 bg-green-50 hover:bg-green-100'
                    : 'text-brand-red border-brand-redMid bg-brand-redLight hover:bg-brand-red hover:text-white'
                }`}>
                {isDone ? '↗ Tekrar Aç' : status === 'in_progress' ? '▶ Devam Et' : '▶ Başla'}
              </button>
              {!isDone && (
                <button onClick={() => onComplete(item.courseId)} disabled={completing}
                  className="text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap">
                  {completing ? '...' : '✓ Tamamla'}
                </button>
              )}
            </>
          )}

          {!isFileBased && !isUrlBased && (
            <div className="flex gap-2 flex-1">
              {status === 'not_started' && (
                <button onClick={() => onStart(item.courseId)} disabled={starting}
                  className="text-xs font-bold text-white bg-brand-red hover:bg-brand-redDark px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                  {starting ? '...' : 'Başla'}
                </button>
              )}
              {!isDone && status !== 'not_started' && (
                <button onClick={() => onComplete(item.courseId)} disabled={completing}
                  className="text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                  {completing ? '...' : '✓ Tamamla'}
                </button>
              )}
              {isDone && <span className="text-xs font-bold text-green-600 self-center">✓ Tamamlandı</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Eğitim Materyali Kartı ───────────────────────────────────────────────────

function EducationCard({ edu, isViewed, onView }: {
  edu: EducationItem;
  isViewed: boolean;
  onView: (id: number, fileUrl: string) => void;
}) {
  const ext    = (edu.title.split('.').pop() ?? '').toUpperCase();
  const isPdf  = ext === 'PDF';
  const bgExt  = isPdf ? 'bg-red-50 border-red-200'    : 'bg-orange-50 border-orange-200';
  const txtExt = isPdf ? 'text-red-600'                 : 'text-orange-600';
  const icon   = isPdf ? '📄' : '📊';

  return (
    <div className={`bg-white rounded-xl border transition-all duration-300 hover:shadow-xl p-6 flex flex-col group ${
      edu.isMandatory ? 'border-brand-red/30 shadow-[0_4px_20px_rgba(179,0,0,0.05)]' : 'border-brand-border shadow-md'
    }`}>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-xl uppercase tracking-wider">
          📁 Materyal
        </span>
        {edu.isMandatory && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-brand-red bg-brand-red/5 border border-brand-red/20 px-2.5 py-1.5 rounded-xl uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse" /> Zorunlu
          </span>
        )}
        {isViewed && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-green-700 bg-green-50 border border-green-200 px-2.5 py-1.5 rounded-xl uppercase tracking-wider">
            ✓ Tamamlandı
          </span>
        )}
      </div>

      <div className="flex items-start gap-3 flex-1 min-w-0 mb-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${bgExt}`}>
          <span className="text-xl">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm text-brand-black leading-snug truncate" title={edu.title}>{edu.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${bgExt} ${txtExt}`}>{ext}</span>
          </div>
          <p className="text-xs text-brand-gray mt-1.5">
            {new Date(edu.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}{edu.uploader.fullName}
          </p>
        </div>
      </div>

      <div className="pt-3 border-t border-brand-border mt-auto">
        <button
          onClick={() => onView(edu.id, edu.fileUrl)}
          className={`w-full text-center text-xs font-bold border px-3 py-2 rounded-lg transition-colors ${
            isViewed
              ? 'text-green-700 border-green-300 bg-green-50 hover:bg-green-100'
              : 'text-brand-red border-brand-redMid bg-brand-redLight hover:bg-brand-red hover:text-white'
          }`}>
          {isViewed ? '✓ Tekrar Görüntüle' : '👁 Görüntüle'}
        </button>
      </div>
    </div>
  );
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-brand-border p-5 animate-pulse">
          <div className="h-5 bg-brand-border rounded w-1/3 mb-3" />
          <div className="h-4 bg-brand-border rounded w-3/4 mb-2" />
          <div className="h-3 bg-brand-border rounded w-1/2 mb-4" />
          <div className="h-2 bg-brand-border rounded w-full mb-3" />
          <div className="h-3 bg-brand-border rounded w-1/3" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="text-5xl mb-4">📚</span>
      <h3 className="text-lg font-bold text-brand-black mb-1">Kurs bulunamadı</h3>
      <p className="text-sm text-brand-gray max-w-xs">Bu filtre için gösterilecek kurs yok.</p>
    </div>
  );
}
