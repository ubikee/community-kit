import { useCallback, useEffect, useRef, useState } from 'react';
import { useCommunity } from '../context';

export default function ChatPanel({ groupId, isAdmin }) {
  const { api, t, currentUser, Avatar } = useCommunity();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);

  const isMine = (m) => currentUser && Number(currentUser.id) === Number(m.user_id);

  const markRead = useCallback(
    (list) => {
      const last = list.length ? list[list.length - 1].id : 0;
      if (last) api.markChatRead(groupId, last).catch(() => {});
    },
    [api, groupId]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .fetchMessages(groupId)
      .then((list) => {
        if (!active) return;
        setMessages(list);
        markRead(list);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = api.subscribeGroupChat(groupId, (msg) => {
      if (msg.type !== 'message') return;
      setMessages((list) => (list.some((x) => x.id === msg.message.id) ? list : [...list, msg.message]));
      api.markChatRead(groupId, msg.message.id).catch(() => {});
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [api, groupId, markRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    const m = await api.sendMessage(groupId, body);
    setText('');
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  };

  const remove = async (m) => {
    await api.deleteMessage(m.id);
    setMessages((list) => list.filter((x) => x.id !== m.id));
  };

  return (
    <div className="ck-chat">
      <div className="ck-chat__body">
        {loading ? (
          <p className="ck-muted ck-center">{t('common.loading')}</p>
        ) : messages.length === 0 ? (
          <p className="ck-muted ck-center">{t('chat.empty')}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`ck-chat__row ${isMine(m) ? 'ck-chat__row--mine' : ''}`}>
              <Avatar user={m} size={28} />
              <div className={`ck-bubble ${isMine(m) ? 'ck-bubble--mine' : ''}`}>
                <p className="ck-bubble__author">{m.name || m.username}</p>
                <p className="ck-bubble__text">{m.body}</p>
              </div>
              {(isAdmin || isMine(m)) && (
                <button onClick={() => remove(m)} aria-label={t('common.delete')} className="ck-x">
                  ×
                </button>
              )}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="ck-chat__form">
        <input
          className="ck-input ck-input--grow"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('chat.placeholder')}
        />
        <button type="submit" className="ck-btn ck-btn--primary">
          {t('chat.send')}
        </button>
      </form>
    </div>
  );
}
