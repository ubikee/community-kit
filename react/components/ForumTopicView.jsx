import { useCallback, useEffect, useState } from 'react';
import { useCommunity } from '../context';

export default function ForumTopicView({ topicId, isAdmin, onBack }) {
  const { api, t, locale, currentUser, Avatar } = useCommunity();
  const dateLocale = locale === 'en' ? 'en-GB' : 'es-ES';
  const [topic, setTopic] = useState(null);
  const [posts, setPosts] = useState([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .fetchTopic(topicId)
      .then((d) => {
        setTopic(d.topic);
        setPosts(d.posts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [api, topicId]);

  useEffect(() => {
    load();
  }, [load]);

  const fmt = (v) => (v ? new Date(String(v).replace(' ', 'T')).toLocaleString(dateLocale) : '');

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    await api.createPost(topicId, reply.trim());
    setReply('');
    load();
  };

  const removePost = async (p) => {
    await api.deletePost(p.id);
    load();
  };
  const togglePin = async () => {
    await api.updateTopic(topicId, { pinned: !topic.pinned });
    load();
  };
  const toggleLock = async () => {
    await api.updateTopic(topicId, { locked: !topic.locked });
    load();
  };
  const removeTopic = async () => {
    if (!window.confirm(t('forum.deleteTopicConfirm'))) return;
    await api.deleteTopic(topicId);
    onBack();
  };

  if (loading || !topic) return <div className="ck-skeleton ck-skeleton--tall" />;

  const canManage = isAdmin || (currentUser && Number(currentUser.id) === Number(topic.user_id));

  return (
    <div className="ck-stack">
      <button onClick={onBack} className="ck-back">
        ← {t('forum.back')}
      </button>

      <div className="ck-card">
        <div className="ck-row ck-row--between">
          <h3 className="ck-topic-title">
            {topic.pinned ? '📌 ' : ''}
            {topic.title}
          </h3>
          <div className="ck-actions">
            {isAdmin && (
              <button onClick={togglePin} className="ck-btn ck-btn--ghost ck-btn--sm">
                {topic.pinned ? t('forum.unpin') : t('forum.pin')}
              </button>
            )}
            {isAdmin && (
              <button onClick={toggleLock} className="ck-btn ck-btn--ghost ck-btn--sm">
                {topic.locked ? t('forum.unlock') : t('forum.lock')}
              </button>
            )}
            {canManage && (
              <button onClick={removeTopic} className="ck-btn ck-btn--danger ck-btn--sm">
                {t('common.delete')}
              </button>
            )}
          </div>
        </div>
        {topic.body && <p className="ck-topic-body">{topic.body}</p>}
        <p className="ck-meta">
          {topic.name || topic.username} · {fmt(topic.created_at)}
        </p>
      </div>

      <ul className="ck-stack ck-stack--sm">
        {posts.map((p) => (
          <li key={p.id} className="ck-post">
            <Avatar user={p} size={32} />
            <div className="ck-list__grow">
              <p className="ck-post__author">{p.name || p.username}</p>
              <p className="ck-post__body">{p.body}</p>
              <p className="ck-meta">{fmt(p.created_at)}</p>
            </div>
            {(isAdmin || (currentUser && Number(currentUser.id) === Number(p.user_id))) && (
              <button onClick={() => removePost(p)} aria-label={t('common.delete')} className="ck-x">
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {topic.locked ? (
        <p className="ck-note">{t('forum.locked')}</p>
      ) : (
        <form onSubmit={send} className="ck-inline-form">
          <input
            className="ck-input ck-input--grow"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t('forum.replyPlaceholder')}
          />
          <button type="submit" className="ck-btn ck-btn--primary">
            {t('forum.reply')}
          </button>
        </form>
      )}
    </div>
  );
}
