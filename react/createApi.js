// Cliente HTTP del paquete. Independiente del proyecto: recibe la base, cómo
// obtener el token y qué hacer ante un 401. El chat usa EventSource nativo,
// pasando el token como query param (?token=…).
export function createCommunityApi({ basePath = '/api/community', getToken, onUnauthorized } = {}) {
  const doFetch = (...args) => {
    if (typeof fetch === 'undefined') return Promise.reject(new Error('fetch no disponible'));
    return fetch(...args);
  };

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = typeof getToken === 'function' ? getToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await doFetch(basePath + path, { ...options, headers });
    if (res.status === 401) onUnauthorized?.();
    return res;
  }

  async function json(path, options) {
    const res = await request(path, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.code || 'community error');
    }
    return res.json();
  }

  const withBody = (method, data) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  function subscribeGroupChat(groupId, onMessage) {
    if (typeof EventSource === 'undefined') return () => {};
    const token = typeof getToken === 'function' ? getToken() : null;
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    const es = new EventSource(`${basePath}/groups/${groupId}/stream${qs}`);
    es.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data));
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }

  return {
    fetchGroups(scope = 'discover', q = '') {
      const params = new URLSearchParams({ scope });
      if (q) params.set('q', q);
      return json(`/groups?${params.toString()}`);
    },
    createGroup: (data) => json('/groups', withBody('POST', data)),
    fetchGroup: (id) => json(`/groups/${id}`),
    updateGroup: (id, data) => json(`/groups/${id}`, withBody('PATCH', data)),
    deleteGroup: (id) => json(`/groups/${id}`, { method: 'DELETE' }),
    fetchGroupMembers: (id) => json(`/groups/${id}/members`),
    joinGroup: (id) => json(`/groups/${id}/join`, { method: 'POST' }),
    leaveGroup: (id) => json(`/groups/${id}/join`, { method: 'DELETE' }),
    approveGroupMember: (id, userId) => json(`/groups/${id}/members/${userId}/approve`, { method: 'POST' }),
    addGroupMember: (id, userId) => json(`/groups/${id}/members`, withBody('POST', { userId })),
    removeGroupMember: (id, userId) => json(`/groups/${id}/members/${userId}`, { method: 'DELETE' }),

    fetchTopics: (groupId) => json(`/groups/${groupId}/topics`),
    createTopic: (groupId, data) => json(`/groups/${groupId}/topics`, withBody('POST', data)),
    fetchTopic: (id) => json(`/topics/${id}`),
    updateTopic: (id, data) => json(`/topics/${id}`, withBody('PATCH', data)),
    deleteTopic: (id) => json(`/topics/${id}`, { method: 'DELETE' }),
    createPost: (topicId, text) => json(`/topics/${topicId}/posts`, withBody('POST', { body: text })),
    updatePost: (id, text) => json(`/posts/${id}`, withBody('PATCH', { body: text })),
    deletePost: (id) => json(`/posts/${id}`, { method: 'DELETE' }),

    fetchMessages: (groupId, before) => json(`/groups/${groupId}/messages${before ? `?before=${before}` : ''}`),
    sendMessage: (groupId, text) => json(`/groups/${groupId}/messages`, withBody('POST', { body: text })),
    deleteMessage: (id) => json(`/messages/${id}`, { method: 'DELETE' }),
    markChatRead: (groupId, lastId) => json(`/groups/${groupId}/read`, withBody('POST', { lastId })),
    getUnread: (groupId) => json(`/groups/${groupId}/unread`),
    subscribeGroupChat,
  };
}
