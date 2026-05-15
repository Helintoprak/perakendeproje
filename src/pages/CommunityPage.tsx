import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface CommentUser {
  fullName: string;
  store: { storeName: string } | null;
}

interface Comment {
  commentId: number;
  postId: number;
  userId: number;
  content: string;
  createdAt: string;
  user: CommentUser;
}

interface PostUser {
  fullName: string;
  role: { roleName: string };
  store: { storeName: string } | null;
}

interface Post {
  postId: number;
  userId: number;
  title: string;
  content: string | null;
  category: string;
  likeCount: number;
  createdAt: string;
  user: PostUser;
  comments: Comment[];
}

const CATEGORIES = [
  { value: 'all',    label: 'Tümü',     emoji: '🌐' },
  { value: 'genel',  label: 'Genel',    emoji: '💬' },
  { value: 'duyuru', label: 'Duyuru',   emoji: '📢' },
  { value: 'öneri',  label: 'Öneri',    emoji: '💡' },
  { value: 'başarı', label: 'Başarı',   emoji: '🏆' },
  { value: 'soru',   label: 'Soru',     emoji: '❓' },
];

const CATEGORY_COLORS: Record<string, string> = {
  genel:  'bg-blue-50 text-blue-700',
  duyuru: 'bg-orange-50 text-orange-700',
  öneri:  'bg-purple-50 text-purple-700',
  başarı: 'bg-green-50 text-green-700',
  soru:   'bg-yellow-50 text-yellow-700',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Az önce';
  if (mins < 60)  return `${mins} dk önce`;
  if (hours < 24) return `${hours} sa önce`;
  return `${days} gün önce`;
}

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const sz = size === 'md' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';
  return (
    <div className={`${sz} rounded-full bg-brand-red flex items-center justify-center text-white font-bold shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function CommentItem({
  comment,
  currentUserId,
  onDelete,
}: {
  comment: Comment;
  currentUserId: number;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex gap-2.5 group">
      <Avatar name={comment.user.fullName} />
      <div className="flex-1 min-w-0">
        <div className="bg-brand-lightGray rounded-xl px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-brand-black">{comment.user.fullName}</span>
            {comment.user.store && (
              <span className="text-[10px] text-brand-gray">{comment.user.store.storeName}</span>
            )}
          </div>
          <p className="text-sm text-brand-black mt-0.5 whitespace-pre-wrap break-words">{comment.content}</p>
        </div>
        <div className="flex items-center gap-3 mt-0.5 px-1">
          <span className="text-[10px] text-brand-gray">{timeAgo(comment.createdAt)}</span>
          {comment.userId === currentUserId && (
            <button
              onClick={() => onDelete(comment.commentId)}
              className="text-[10px] text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Sil
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PostCard({
  post,
  currentUserId,
  onLike,
  onDeletePost,
  onAddComment,
  onDeleteComment,
}: {
  post: Post;
  currentUserId: number;
  onLike: (id: number) => void;
  onDeletePost: (id: number) => void;
  onAddComment: (postId: number, content: string) => Promise<void>;
  onDeleteComment: (postId: number, commentId: number) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cat = CATEGORIES.find(c => c.value === post.category);

  async function handleComment() {
    if (!commentText.trim()) return;
    setSubmitting(true);
    await onAddComment(post.postId, commentText);
    setCommentText('');
    setSubmitting(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleComment();
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-start gap-3">
        <Avatar name={post.user.fullName} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-brand-black text-sm">{post.user.fullName}</span>
            <span className="text-xs text-brand-gray">{post.user.role.roleName}</span>
            {post.user.store && (
              <span className="text-xs text-brand-gray flex items-center gap-0.5">
                <span>🏪</span>{post.user.store.storeName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-brand-gray">{timeAgo(post.createdAt)}</span>
            {cat && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[post.category] ?? 'bg-gray-100 text-gray-600'}`}>
                {cat.emoji} {cat.label}
              </span>
            )}
          </div>
        </div>
        {post.userId === currentUserId && (
          <button
            onClick={() => onDeletePost(post.postId)}
            className="text-brand-gray hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50 shrink-0"
            title="Gönderiyi sil"
          >
            🗑️
          </button>
        )}
      </div>

      {/* İçerik */}
      <div className="px-5 pb-3">
        <h3 className="font-semibold text-brand-black text-base">{post.title}</h3>
        {post.content && (
          <p className="text-sm text-brand-gray mt-1 whitespace-pre-wrap break-words">{post.content}</p>
        )}
      </div>

      {/* Aksiyon çubuğu */}
      <div className="px-5 py-2.5 border-t border-brand-border flex items-center gap-4">
        <button
          onClick={() => onLike(post.postId)}
          className="flex items-center gap-1.5 text-sm text-brand-gray hover:text-brand-red transition-colors"
        >
          <span>❤️</span>
          <span>{post.likeCount}</span>
        </button>
        <button
          onClick={() => {
            setShowComments(v => !v);
            setTimeout(() => inputRef.current?.focus(), 100);
          }}
          className="flex items-center gap-1.5 text-sm text-brand-gray hover:text-brand-black transition-colors"
        >
          <span>💬</span>
          <span>{post.comments.length} Yorum</span>
        </button>
      </div>

      {/* Yorumlar */}
      {showComments && (
        <div className="px-5 pb-4 space-y-3 border-t border-brand-border pt-3">
          {post.comments.map(c => (
            <CommentItem
              key={c.commentId}
              comment={c}
              currentUserId={currentUserId}
              onDelete={(id) => onDeleteComment(post.postId, id)}
            />
          ))}

          {/* Yorum yaz */}
          <div className="flex gap-2.5 pt-1">
            <Avatar name="S" />
            <div className="flex-1 flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Yorum yaz... (Enter ile gönder)"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-red transition-colors bg-brand-lightGray"
              />
              <button
                onClick={handleComment}
                disabled={submitting || !commentText.trim()}
                className="px-3 py-2 bg-brand-red text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-red-700 transition-colors shrink-0"
              >
                {submitting ? '...' : 'Gönder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewPostForm({ onSubmit }: { onSubmit: (title: string, content: string, category: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('genel');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    await onSubmit(title, content, category);
    setTitle('');
    setContent('');
    setCategory('genel');
    setOpen(false);
    setSubmitting(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-white border border-brand-border rounded-2xl px-5 py-3.5 text-left text-sm text-brand-gray hover:border-brand-red hover:bg-red-50 transition-all shadow-sm flex items-center gap-3"
      >
        <span className="text-xl">✏️</span>
        <span>Bir şeyler paylaş...</span>
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-brand-red rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-brand-border flex items-center justify-between">
        <span className="font-semibold text-brand-black text-sm">Yeni Gönderi</span>
        <button type="button" onClick={() => setOpen(false)} className="text-brand-gray hover:text-brand-black text-lg leading-none">×</button>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.filter(c => c.value !== 'all').map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                category === c.value
                  ? 'bg-brand-red text-white border-brand-red'
                  : 'border-brand-border text-brand-gray hover:border-brand-red'
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Başlık *"
          className="w-full border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-red"
          maxLength={150}
          required
        />
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Detay ekle... (isteğe bağlı)"
          rows={3}
          className="w-full border border-brand-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-red resize-none"
        />
      </div>
      <div className="px-5 pb-4 flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2 text-sm text-brand-gray hover:text-brand-black border border-brand-border rounded-xl transition-colors"
        >
          İptal
        </button>
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="px-5 py-2 bg-brand-red text-white text-sm font-medium rounded-xl disabled:opacity-40 hover:bg-red-700 transition-colors"
        >
          {submitting ? 'Paylaşılıyor...' : 'Paylaş'}
        </button>
      </div>
    </form>
  );
}

export default function CommunityPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    fetchPosts();
  }, [activeCategory]);

  async function fetchPosts() {
    setLoading(true);
    setError('');
    try {
      const params = activeCategory !== 'all' ? { category: activeCategory } : {};
      const { data } = await api.get<Post[]>('/community', { params });
      setPosts(data);
    } catch {
      setError('Gönderiler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }

  async function handleNewPost(title: string, content: string, category: string) {
    try {
      const { data } = await api.post<Post>('/community', { title, content, category });
      setPosts(prev => [data, ...prev]);
    } catch {
      alert('Gönderi paylaşılamadı.');
    }
  }

  async function handleLike(postId: number) {
    try {
      const { data } = await api.post<{ likeCount: number }>(`/community/${postId}/like`);
      setPosts(prev => prev.map(p => p.postId === postId ? { ...p, likeCount: data.likeCount } : p));
    } catch {}
  }

  async function handleDeletePost(postId: number) {
    if (!confirm('Bu gönderiyi silmek istediğinizden emin misiniz?')) return;
    try {
      await api.delete(`/community/${postId}`);
      setPosts(prev => prev.filter(p => p.postId !== postId));
    } catch {
      alert('Gönderi silinemedi.');
    }
  }

  async function handleAddComment(postId: number, content: string) {
    try {
      const { data } = await api.post<Comment>(`/community/${postId}/comments`, { content });
      setPosts(prev => prev.map(p =>
        p.postId === postId ? { ...p, comments: [...p.comments, data] } : p
      ));
    } catch {
      alert('Yorum eklenemedi.');
    }
  }

  function handleDeleteComment(postId: number, commentId: number) {
    if (!confirm('Bu yorumu silmek istiyor musunuz?')) return;
    api.delete(`/community/comments/${commentId}`)
      .then(() => {
        setPosts(prev => prev.map(p =>
          p.postId === postId
            ? { ...p, comments: p.comments.filter(c => c.commentId !== commentId) }
            : p
        ));
      })
      .catch(() => alert('Yorum silinemedi.'));
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Başlık */}
      <div>
        <h1 className="text-xl font-bold text-brand-black">Topluluk</h1>
        <p className="text-sm text-brand-gray mt-0.5">Ekibinle bilgi paylaş, soru sor, başarıları kutla.</p>
      </div>

      {/* Kategori filtresi */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setActiveCategory(c.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
              activeCategory === c.value
                ? 'bg-brand-red text-white border-brand-red'
                : 'border-brand-border text-brand-gray hover:border-brand-red bg-white'
            }`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {/* Yeni gönderi */}
      <NewPostForm onSubmit={handleNewPost} />

      {/* Feed */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-brand-gray">
          <p className="text-4xl mb-3">😕</p>
          <p>{error}</p>
          <button onClick={fetchPosts} className="mt-3 text-brand-red text-sm underline">Tekrar dene</button>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-brand-gray">
          <p className="text-5xl mb-3">🌱</p>
          <p className="font-medium">Henüz gönderi yok</p>
          <p className="text-sm mt-1">İlk gönderiyi sen paylaş!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard
              key={post.postId}
              post={post}
              currentUserId={user!.userId}
              onLike={handleLike}
              onDeletePost={handleDeletePost}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
