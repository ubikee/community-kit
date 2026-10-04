import { useCallback, useEffect, useState } from 'react';
import { useCommunity } from '../context';
import Dialog from './Dialog';
import ForumTopicView from './ForumTopicView';

export default function ForumTopicList({ groupId, isAdmin }) {
  const { api, t, locale } = useCommunity();
  const dateLocale = locale === 'en' ? 'en-GB' : 'es-ES';
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ title: '', body: '' });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    return api
      .fetchTopics(groupId)
      .then(setTopics)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [api, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  if (selected) {
    return (
      <ForumTopicView
        topicId={selected}
        isAdmin={isAdmin}
        onBack={() => {
          setSelected(null);
          load();
        }}
      />
    );
  }

  const publish = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError(t('forum.topicTitle'));
      return;
    }
    await api.createTopic(groupId, form);
    setForm({ title: '', body: '' });
    setError('');
    setOpenNew(false);
    load();
  };

  return (
    <div className="ck-stack ck-stack--sm">
      <button onClick={() => setOpenNew(true)} className="ck-btn ck-btn--primary ck-self-start">
        + {t('forum.newTopic')}
      </button>

      {loading ? (
        <div className="ck-skeleton" />
      ) : topics.length === 0 ? (
        <p className="ck-empty">{t('forum.empty')}</p>
      ) : (
        <ul className="ck-list">
          {topics.map((topic) => (
            <li key={topic.id}>
              <button onClick={() => setSelected(topic.id)} className="ck-topic">
                <span className="ck-topic__head">
                  {topic.pinned ? <span className="ck-badge ck-badge--amber">{t('forum.pinned')}</span> : null}
                  {topic.locked ? <span className="ck-badge">{t('forum.locked')}</span> : null}
                  <span className="ck-topic__name">{topic.title}</span>
                </span>
                <span className="ck-meta">
                  {topic.name || topic.username} · {topic.posts} {t('forum.posts')} ·{' '}
                  {new Date(String(topic.updated_at).replace(' ', 'T')).toLocaleDateString(dateLocale)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={openNew} onClose={() => setOpenNew(false)} title={t('forum.newTopic')}>
        <form onSubmit={publish} className="ck-stack">
          {error && <p className="ck-error">{error}</p>}
          <input
            placeholder={t('forum.topicTitle')}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="ck-input"
            autoFocus
          />
          <textarea
            rows={4}
            placeholder={t('forum.topicBody')}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            className="ck-textarea"
          />
          <div className="ck-dialog__actions">
            <button type="button" onClick={() => setOpenNew(false)} className="ck-btn ck-btn--ghost">
              {t('common.cancel')}
            </button>
            <button type="submit" className="ck-btn ck-btn--primary">
              {t('forum.create')}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
