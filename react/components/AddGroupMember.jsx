import { useEffect, useState } from 'react';
import { useCommunity } from '../context';

export default function AddGroupMember({ groupId, onAdded }) {
  const { api, t, Avatar, searchUsers } = useCommunity();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!searchUsers || !q.trim()) {
      setResults([]);
      return undefined;
    }
    let active = true;
    Promise.resolve(searchUsers(q.trim()))
      .then((u) => {
        if (active) setResults(u || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [q, searchUsers]);

  if (!searchUsers) return null;

  const add = async (u) => {
    await api.addGroupMember(groupId, u.id);
    setQ('');
    setResults([]);
    onAdded?.();
  };

  return (
    <div className="ck-card ck-add-member">
      <p className="ck-label">{t('groups.addMember')}</p>
      <input
        className="ck-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('groups.searchUsers')}
      />
      {results.length > 0 && (
        <ul className="ck-list ck-list--tight">
          {results.map((u) => (
            <li key={u.id} className="ck-list__row">
              <Avatar user={u} size={28} />
              <span className="ck-list__grow">{u.name || u.username}</span>
              <button onClick={() => add(u)} className="ck-btn ck-btn--ghost ck-btn--sm">
                {t('groups.add')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
