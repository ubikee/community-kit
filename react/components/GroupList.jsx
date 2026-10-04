import { useCallback, useEffect, useState } from 'react';
import { useCommunity } from '../context';
import Dialog from './Dialog';
import CreateGroupDialog from './CreateGroupDialog';

export default function GroupList({ groupHref = (g) => `/groups/${g.id}`, onOpenGroup = null }) {
  const { api, t, LinkComponent } = useCommunity();
  const [mine, setMine] = useState([]);
  const [q, setQ] = useState('');
  const [discover, setDiscover] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);

  const loadMine = useCallback(() => api.fetchGroups('mine').then(setMine).catch(() => {}), [api]);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .fetchGroups('discover', q.trim())
      .then((rows) => {
        if (active) setDiscover(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, q]);

  const join = async (g) => {
    await api.joinGroup(g.id);
    loadMine();
    api.fetchGroups('discover', q.trim()).then(setDiscover).catch(() => {});
  };

  return (
    <div className="ck-stack">
      <button onClick={() => setOpenCreate(true)} className="ck-btn ck-btn--primary ck-block">
        + {t('groups.create')}
      </button>

      <div>
        <p className="ck-label">{t('groups.mine')}</p>
        {mine.length === 0 ? (
          <p className="ck-muted">—</p>
        ) : (
          <ul className="ck-list">
            {mine.map((g) => (
              <li key={g.id}>
                <LinkComponent to={groupHref(g)} className="ck-list__link">
                  <span className="ck-list__grow ck-truncate ck-strong">{g.name}</span>
                  <span className="ck-meta">{g.members}</span>
                </LinkComponent>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="ck-label">{t('groups.discover')}</p>
        <input
          className="ck-input ck-field--gap"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('groups.searchPlaceholder')}
        />
        {loading ? (
          <div className="ck-skeleton" />
        ) : discover.length === 0 ? (
          <p className="ck-muted">—</p>
        ) : (
          <ul className="ck-list">
            {discover.map((g) => (
              <li key={g.id} className="ck-list__row">
                <LinkComponent to={groupHref(g)} className="ck-list__grow">
                  <p className="ck-truncate ck-strong">{g.name}</p>
                  <p className="ck-meta">
                    {g.members} {t('groups.members')}
                  </p>
                </LinkComponent>
                {g.myStatus === 'active' ? (
                  <span className="ck-ok">{t('groups.joined')}</span>
                ) : g.myStatus === 'pending' ? (
                  <span className="ck-warn">{t('groups.pending')}</span>
                ) : (
                  <button onClick={() => join(g)} className="ck-btn ck-btn--ghost ck-btn--sm">
                    {t('groups.join')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} title={t('groups.create')}>
        <CreateGroupDialog
          onClose={() => setOpenCreate(false)}
          onCreated={(group) => {
            loadMine();
            onOpenGroup?.(group);
          }}
        />
      </Dialog>
    </div>
  );
}
