// Prueba de humo del servidor: levanta un host mínimo con un usuario falso por
// cabecera `x-user` y ejerce grupos, foro, chat y SSE.
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const { createCommunity } = require('./index');

const USERS = [
  { id: 1, username: 'ana', name: 'Ana', avatar: null },
  { id: 2, username: 'luis', name: 'Luis', avatar: null },
];

const db = new DatabaseSync(':memory:');
const community = createCommunity({
  db,
  getUser: (req) => {
    const id = Number(req.headers['x-user']);
    return id ? { id } : null;
  },
  users: {
    getByIds: (ids) => USERS.filter((u) => ids.map(Number).includes(u.id)),
  },
});

const app = express();
app.use(express.json());
app.use('/api/community', community.router);
const server = app.listen(0);

const base = () => `http://localhost:${server.address().port}/api/community`;
const as = (id) => ({ 'x-user': String(id), 'Content-Type': 'application/json' });
const parse = async (r) => {
  const text = await r.text();
  try {
    return { status: r.status, body: JSON.parse(text) };
  } catch {
    throw new Error(`respuesta no JSON (${r.status}) para ${r.url}: ${text.slice(0, 120)}`);
  }
};
const get = (p, id) => fetch(`${base()}${p}`, { headers: as(id) }).then(parse);
const post = (p, id, body) =>
  fetch(`${base()}${p}`, { method: 'POST', headers: as(id), body: JSON.stringify(body || {}) }).then(parse);
const del = (p, id) => fetch(`${base()}${p}`, { method: 'DELETE', headers: as(id) }).then(parse);

async function main() {
  const g = await post('/groups', 1, { name: 'Club de prueba', visibility: 'private' });
  assert.equal(g.status, 201);
  const groupId = g.body.id;
  assert.equal(g.body.members, 1);

  // Luis solicita entrar (privado → pending) y Ana aprueba.
  const joined = await post(`/groups/${groupId}/join`, 2);
  assert.equal(joined.body.myStatus, 'pending');
  await post(`/groups/${groupId}/members/2/approve`, 1);

  const members = await get(`/groups/${groupId}/members`, 1);
  assert.equal(members.body.length, 2);
  assert.equal(members.body.find((m) => m.id === 2).name, 'Luis'); // puente de usuarios

  // Foro
  const topic = await post(`/groups/${groupId}/topics`, 2, { title: 'Hola', body: 'Primer tema' });
  assert.equal(topic.status, 201);
  assert.equal(topic.body.name, 'Luis');
  await post(`/topics/${topic.body.id}/posts`, 1, { body: 'Respondo' });
  const full = await get(`/topics/${topic.body.id}`, 1);
  assert.equal(full.body.posts.length, 1);
  assert.equal(full.body.posts[0].name, 'Ana');

  // Chat + SSE (EventSource: token por query, aquí mediante cabecera x-user)
  const sse = await fetch(`${base()}/groups/${groupId}/stream`, { headers: { 'x-user': '2' } });
  assert.equal(sse.status, 200);
  const reader = sse.body.getReader();
  const decoder = new TextDecoder();
  const received = (async () => {
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return null;
      buf += decoder.decode(value, { stream: true });
      const m = buf.match(/data: (.*)\n\n/);
      if (m) return JSON.parse(m[1]);
    }
  })();

  await new Promise((r) => setTimeout(r, 100));
  await post(`/groups/${groupId}/messages`, 1, { body: '¡Hola chat!' });
  const msg = await received;
  assert.equal(msg.type, 'message');
  assert.equal(msg.message.body, '¡Hola chat!');
  assert.equal(msg.message.name, 'Ana');
  await reader.cancel();

  const history = await get(`/groups/${groupId}/messages`, 2);
  assert.equal(history.body.length, 1);
  const unread = await get(`/groups/${groupId}/unread`, 2);
  assert.equal(unread.body.count, 1);
  await post(`/groups/${groupId}/read`, 2, { lastId: msg.message.id });
  const unread2 = await get(`/groups/${groupId}/unread`, 2);
  assert.equal(unread2.body.count, 0);

  // No miembro → 403
  const outsider = await get(`/groups/${groupId}/messages`, 99);
  assert.equal(outsider.status, 403);
  assert.equal(outsider.body.code, 'community/NOT_MEMBER');

  server.close();
  console.log('✓ community-kit server: todas las pruebas pasaron');
}

main().catch((err) => {
  server.close();
  console.error('✗ fallo:', err.message);
  process.exit(1);
});
