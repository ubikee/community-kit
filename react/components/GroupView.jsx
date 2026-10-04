import { useCallback, useEffect, useState } from 'react';
import { useCommunity } from '../context';
import ForumTopicList from './ForumTopicList';
import ChatPanel from './ChatPanel';
import AddGroupMember from './AddGroupMember';

const ROLE_KEY = { owner: 'groups.roleOwner', admin: 'groups.roleAdmin', member: 'groups.roleMember' };

export default function GroupView({ groupId, onLeft = null }) {
  const { api, t, Avatar } = useCommunity();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('forum');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const g = await api.fetchGroup(groupId);
      setGroup(g);
      setMembers(await api.fetchGroupMembers(groupId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const join = async () => {
    await api.joinGroup(groupId);
    load();
  };
  const leave = async () => {
    if (!window.confirm(t('groups.leaveConfirm'))) return;
    await api.leaveGroup(groupId);
    onLeft ? onLeft() : load();
  };
  const approve = async (u) => {
    await api.approveGroupMember(groupId, u.id);
    load();
  };
  const remove = async (u) => {
    if (!window.confirm(t('groups.removeConfirm', { name: u.name || u.username }))) return;
    await api.removeGroupMember(groupId, u.id);
    load();
  };

  if (loading) return <div className="ck-skeleton ck-skeleton--page" />;
  if (error) return <p className="ck-card ck-center">{error}</p>;

  const isAdmin = group.myRole === 'owner' || group.myRole === 'admin';
  const isMember = group.myStatus === 'active';

  const tabs = [
    { key: 'forum', label: t('forum.title') },
    { key: 'chat', label: t('groups.chat') },
    { key: 'members', label: t('groups.membersTitle') },
  ];

  return (
    <div className="ck-view">
      <header className="ck-card">
        <div className="ck-row ck-row--between ck-row--start">
          <div className="ck-grow">
            <h1 className="ck-title">{group.name}</h1>
            {group.description && <p className="ck-desc">{group.description}</p>}
            <p className="ck-meta">
              {group.members} {t('groups.members')} ·{' '}
              {group.visibility === 'private' ? t('groups.private') : t('groups.public')}
            </p>
          </div>
          <div>
            {isMember ? (
              group.myRole !== 'owner' && (
                <button onClick={leave} className="ck-btn ck-btn--ghost">
                  {t('groups.leave')}
                </button>
              )
            ) : group.myStatus === 'pending' ? (
              <span className="ck-badge ck-badge--amber">{t('groups.pending')}</span>
            ) : (
              <button onClick={join} className="ck-btn ck-btn--primary">
                {t('groups.join')}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="ck-tabs">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setTab(x.key)}
            className={`ck-tab ${tab === x.key ? 'ck-tab--active' : ''}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'forum' &&
        (isMember ? <ForumTopicList groupId={group.id} isAdmin={isAdmin} /> : <p className="ck-empty">{t('groups.mustJoin')}</p>)}

      {tab === 'chat' &&
        (isMember ? <ChatPanel groupId={group.id} isAdmin={isAdmin} /> : <p className="ck-empty">{t('groups.mustJoin')}</p>)}

      {tab === 'members' && (
        <div className="ck-stack ck-stack--sm">
          {isAdmin && <AddGroupMember groupId={group.id} onAdded={load} />}
          <ul className="ck-list">
            {members.map((m) => (
              <li key={m.id} className="ck-member">
                <Avatar user={m} size={36} />
                <div className="ck-grow">
                  <p className="ck-truncate ck-strong">{m.name || m.username}</p>
                  <p className="ck-meta">{t(ROLE_KEY[m.role] || 'groups.roleMember')}</p>
                </div>
                {m.status === 'pending' ? (
                  <div className="ck-actions">
                    <button onClick={() => approve(m)} className="ck-btn ck-btn--primary ck-btn--sm">
                      {t('groups.approve')}
                    </button>
                    <button onClick={() => remove(m)} className="ck-btn ck-btn--danger ck-btn--sm">
                      {t('common.delete')}
                    </button>
                  </div>
                ) : (
                  isAdmin &&
                  m.role !== 'owner' && (
                    <button onClick={() => remove(m)} className="ck-btn ck-btn--ghost ck-btn--sm">
                      {t('groups.remove')}
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
