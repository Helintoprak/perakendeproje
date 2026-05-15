import { useEffect, useState } from 'react';
import { StreamChat } from 'stream-chat';
import {
  Chat,
  Channel,
  ChannelHeader,
  ChannelList,
  MessageList,
  MessageComposer,   // v14: eski MessageInput'un yerini aldı (yazı kutusu + gönder + dosya/emoji)
  Thread,
  Window,
} from 'stream-chat-react';

import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import NewGroupModal from '../components/chat/NewGroupModal';

// Stream'in kendi temel CSS'i (zorunlu) + Sporthink override
// Not: stream-chat-react v14 itibarıyla CSS yolu /dist/css/index.css (v2 alt klasörü yok).
import 'stream-chat-react/dist/css/index.css';
import '../styles/stream-chat-sporthink.css';

/**
 * MeetingPage — Sporthink Chat Hub
 *
 * İki sabit kanal:
 *   📢 Genel Chat        — tüm personel
 *   🏠 [Mağaza Adı] Chat — kullanıcının kendi mağazası
 *
 * Layout:
 *   Sol  ~280px — <ChannelList /> (kanal listesi, başlık + son mesaj önizlemesi)
 *   Sağ flex-1  — <Channel /> (header + mesaj listesi + composer + thread)
 *
 * Akış:
 *   1. /api/chat/config    → Stream key
 *   2. /api/chat/token     → userToken alıp connectUser
 *   3. /api/chat/bootstrap → kullanıcıyı kendi kanallarına üye yap, ID listesini al
 *   4. <ChannelList filters={{ id: { $in: allowedIds } }} /> ile sadece o kanallar listelenir
 */

interface ChatConfigResponse {
  enabled:     boolean;
  apiKey:      string | null;
  diagnostics?: { hasApiKey: boolean; hasApiSecret: boolean; hint: string | null };
}
interface ChatTokenResponse  { token: string; user: { id: string; name: string; role: string } }
interface BootstrapResponse  { channels: { id: string; name: string }[] }

export default function MeetingPage() {
  const { user, isAdmin, isManager, isRegionalManager } = useAuth();
  const canCreateGroup = Boolean(isAdmin || isManager || isRegionalManager);

  const [client, setClient] = useState<StreamChat | null>(null);
  const [allowedChannelIds, setAllowedChannelIds] = useState<string[]>([]);
  const [error, setError]   = useState<string>('');
  // Aşamalı durum — UI hangi adımda olduğunu net gösterir, kanal sadece 'ready' iken render edilir
  const [stage, setStage] = useState<
    'idle' | 'config' | 'token' | 'connecting' | 'bootstrap' | 'ready' | 'error'
  >('idle');
  const [showNewGroup, setShowNewGroup] = useState(false);

  useEffect(() => {
    if (!user) return;

    // İptal bayrağı + bizim açtığımız bağlantı bayrağı (singleton'a saygı için).
    // StreamChat.getInstance() singleton döndürür; başkası tarafından zaten bağlanmışsa
    // bizim disconnect etmemiz onların oturumunu keser. Sadece WE connected ise disconnect.
    let cancelled = false;
    let connectedByUs = false;
    let localClient: StreamChat | null = null;

    (async () => {
      try {
        setStage('config');
        setError('');

        console.log('[MeetingPage] 🟡 Sohbet başlatılıyor — kullanıcı:', {
          userId: user.userId,
          name:   user.fullName,
          role:   user.role,
          store:  user.store,
        });

        // 1. Stream yapılandırmasını al
        const cfg = await api.get<ChatConfigResponse>('/chat/config');
        console.log('[MeetingPage] 🔧 /chat/config yanıtı:', cfg.data);
        if (!cfg.data.enabled || !cfg.data.apiKey) {
          const diag = cfg.data.diagnostics;
          const detail = diag
            ? ` (apiKey: ${diag.hasApiKey ? '✅' : '❌'}, secret: ${diag.hasApiSecret ? '✅' : '❌'})`
            : '';
          const hint = diag?.hint ? ` ${diag.hint}` : '';
          throw new Error(`Sohbet sunucu tarafında yapılandırılmamış${detail}.${hint}`);
        }
        const apiKey = cfg.data.apiKey;
        if (cancelled) return;

        // 2. Kullanıcı için token al
        setStage('token');
        const tokenRes = await api.get<ChatTokenResponse>('/chat/token');
        console.log('[MeetingPage] 🎟️ Token alındı, uzunluk:', tokenRes.data.token.length);
        if (cancelled) return;

        // 3. Stream client'ı bağla — singleton'a saygılı bağlanma
        setStage('connecting');
        localClient = StreamChat.getInstance(apiKey);
        const targetUserId = tokenRes.data.user.id;

        if (localClient.userID && localClient.userID !== targetUserId) {
          console.log('[MeetingPage] 🔄 Farklı kullanıcı bağlı, disconnect →', localClient.userID);
          await localClient.disconnectUser();
        }
        if (!localClient.userID) {
          await localClient.connectUser(
            { id: targetUserId, name: tokenRes.data.user.name },
            tokenRes.data.token
          );
          connectedByUs = true;
          console.log('[MeetingPage] 🔗 connectUser başarılı:', tokenRes.data.user);
        } else {
          console.log('[MeetingPage] ♻️ Mevcut bağlantı yeniden kullanılıyor:', localClient.userID);
        }

        if (cancelled) return;

        // GUARD: ChannelList query'sinden önce userID dolu olmalı
        if (!localClient.userID) {
          throw new Error('connectUser tamamlandı ama client.userID hâlâ boş — bağlantı sorunu');
        }

        // 4. Bootstrap — Genel + Mağaza kanalını oluştur/üye yap, ID listesini al
        setStage('bootstrap');
        const bootstrapRes = await api.post<BootstrapResponse>('/chat/bootstrap');
        console.log('[MeetingPage] 🚪 Erişilebilir kanallar:', bootstrapRes.data.channels);
        if (cancelled) return;

        setAllowedChannelIds(bootstrapRes.data.channels.map(c => c.id));
        setClient(localClient);
        setStage('ready');
        console.log('[MeetingPage] ✅ Sohbet hazır');
      } catch (e: any) {
        const msg = e?.response?.data?.message ?? e?.message ?? 'Sohbet başlatılamadı';
        console.error('[MeetingPage] ❌ Sohbet başlatma hatası:', {
          message:    msg,
          httpStatus: e?.response?.status,
          httpData:   e?.response?.data,
          stack:      e?.stack,
        });
        if (!cancelled) {
          setError(msg);
          setStage('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      // Yalnızca kendi açtığımız bağlantıyı kapat (singleton paylaşımına saygı).
      if (connectedByUs && localClient) {
        localClient.disconnectUser().catch(() => {});
      }
    };
  }, [user]);

  // ChannelList filtreleri — kullanıcının ÜYE OLDUĞU tüm messaging kanallarını gösterir.
  // Bootstrap (Genel + Mağaza) + sonradan oluşturulan grup sohbetleri otomatik düşer.
  // Üyelik backend tarafında zorlandığı için frontend manipüle edemez.
  const channelFilters = client?.userID
    ? { type: 'messaging', members: { $in: [client.userID] } }
    : null;
  // allowedChannelIds bootstrap teşhisi için saklanıyor — UI filtresinde değil
  void allowedChannelIds;
  const channelSort  = { last_message_at: -1 as const };
  const channelOpts  = { state: true, watch: true, presence: true, limit: 10 };

  return (
    // Tam-bleed: DashboardLayout'un padding'inden negatif margin ile kaç, header'a kadar yasla.
    // Header ~80px (py-5 + içerik) → kalan tüm yükseklik chat'e ait. Slack/Discord hissi.
    <div
      className="sporthink-chat -mx-4 lg:-mx-8 -my-4 lg:-my-8 flex bg-white"
      style={{ height: 'calc(100vh - 80px)' }}
    >
      {stage === 'error' ? (
        <ChatPlaceholder text={error} icon="⚠️" />
      ) : stage !== 'ready' ? (
        <ChatPlaceholder text={stageLabel(stage)} spinner />
      ) : client?.userID && channelFilters ? (
        <Chat client={client} theme="str-chat__theme-light">
          <div className="flex w-full h-full">
            {/* Sol — Kanal listesi (Slack-tarzı dar şerit) */}
            <div className="w-64 shrink-0 border-r border-brand-border bg-brand-lightGray flex flex-col">
              <div className="px-4 py-3 border-b border-brand-border bg-white flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-gray">
                  Sohbetler
                </h3>
                {canCreateGroup && (
                  <button
                    onClick={() => setShowNewGroup(true)}
                    title="Yeni grup sohbeti oluştur"
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-red hover:text-white hover:bg-brand-red border border-brand-red/30 hover:border-brand-red rounded-md px-2 py-1 transition-colors"
                  >
                    <span className="text-sm leading-none">+</span> Yeni
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                <ChannelList
                  filters={channelFilters}
                  sort={channelSort}
                  options={channelOpts}
                />
              </div>
            </div>

            {/* Sağ — Aktif kanalın tam ekran mesaj penceresi */}
            <div className="flex-1 flex min-w-0">
              <Channel>
                <Window>
                  <ChannelHeader />
                  <MessageList />
                  <MessageComposer />
                </Window>
                <Thread />
              </Channel>
            </div>
          </div>
        </Chat>
      ) : (
        <ChatPlaceholder text="Sohbet kullanılamıyor." icon="💬" />
      )}

      {/* Yeni Grup Modal — yalnızca yetkili roller için */}
      {showNewGroup && canCreateGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreated={async (channelId, channelType) => {
            // Yaratılan kanalı hemen watch et — ChannelList real-time event'i
            // gelmeden de listeye düşmesini garantile.
            try {
              if (client?.userID) {
                await client.channel(channelType, channelId).watch();
                console.log('[MeetingPage] 👥 Yeni grup watch edildi:', channelId);
              }
            } catch (e) {
              console.warn('[MeetingPage] Yeni grup watch hatası:', e);
            }
          }}
        />
      )}
    </div>
  );
}

// ─── State machine etiketleri ────────────────────────────────────────────────
function stageLabel(stage: string): string {
  switch (stage) {
    case 'idle':       return 'Hazırlanıyor...';
    case 'config':     return 'Sohbet ayarları kontrol ediliyor...';
    case 'token':      return 'Kimlik doğrulanıyor...';
    case 'connecting': return 'Stream\'e bağlanılıyor...';
    case 'bootstrap':  return 'Kanallarınız hazırlanıyor...';
    case 'ready':      return 'Hazır';
    default:           return 'Yükleniyor...';
  }
}

// ─── Yer tutucu (loading / error / disabled) ─────────────────────────────────
function ChatPlaceholder({
  text,
  icon = '💬',
  spinner = false,
}: {
  text:    string;
  icon?:   string;
  spinner?: boolean;
}) {
  return (
    <div className="flex-1 bg-white rounded-2xl border border-brand-border shadow-md flex items-center justify-center text-center p-6">
      <div>
        {spinner ? (
          <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        ) : (
          <p className="text-3xl mb-2">{icon}</p>
        )}
        <p className="text-sm text-brand-gray font-medium">{text}</p>
      </div>
    </div>
  );
}
