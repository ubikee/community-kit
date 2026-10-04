const express = require('express');
const { membership, isActive, isAdmin } = require('../util');

module.exports = function chatRouter(ctx) {
  const { db, getUser, enrich, bus, onEvent, fail } = ctx;
  const router = express.Router();

  router.get('/groups/:id/messages', (req, res) => {
    const me = getUser(req);
    const groupId = Number(req.params.id);
    if (!isActive(membership(db, groupId, me.id))) return fail(res, 403, 'NOT_MEMBER');
    const before = req.query.before ? Number(req.query.before) : null;
    const limit = Math.min(100, Number(req.query.limit) || 50);
    let sql = 'SELECT * FROM ck_messages WHERE group_id = ? AND deleted_at IS NULL';
    const params = [groupId];
    if (before) {
      sql += ' AND id < ?';
      params.push(before);
    }
    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);
    const rows = db.prepare(sql).all(...params).reverse();
    res.json(enrich(rows));
  });

  router.post('/groups/:id/messages', (req, res) => {
    const me = getUser(req);
    const groupId = Number(req.params.id);
    if (!isActive(membership(db, groupId, me.id))) return fail(res, 403, 'NOT_MEMBER');
    const body = String(req.body.body || '').trim();
    if (!body) return fail(res, 400, 'MESSAGE_EMPTY');
    const result = db
      .prepare('INSERT INTO ck_messages (group_id, user_id, body) VALUES (?, ?, ?)')
      .run(groupId, me.id, body);
    const message = enrich(db.prepare('SELECT * FROM ck_messages WHERE id = ?').get(result.lastInsertRowid));
    bus.emit(groupId, { type: 'message', message });
    onEvent?.('message.created', { groupId, messageId: message.id, userId: me.id });
    res.status(201).json(message);
  });

  router.delete('/messages/:id', (req, res) => {
    const me = getUser(req);
    const msg = db.prepare('SELECT * FROM ck_messages WHERE id = ?').get(req.params.id);
    if (!msg) return fail(res, 404, 'MESSAGE_NOT_FOUND');
    const m = membership(db, msg.group_id, me.id);
    if (!isAdmin(m) && Number(msg.user_id) !== Number(me.id)) return fail(res, 403, 'NOT_ADMIN');
    db.prepare('UPDATE ck_messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(msg.id);
    res.json({ ok: true });
  });

  router.post('/groups/:id/read', (req, res) => {
    const me = getUser(req);
    const groupId = Number(req.params.id);
    if (!isActive(membership(db, groupId, me.id))) return fail(res, 403, 'NOT_MEMBER');
    const lastId = Number(req.body.lastId) || 0;
    db.prepare(
      `INSERT INTO ck_reads (group_id, user_id, last_read_id) VALUES (?, ?, ?)
       ON CONFLICT(group_id, user_id) DO UPDATE SET last_read_id = MAX(excluded.last_read_id, ck_reads.last_read_id)`
    ).run(groupId, me.id, lastId);
    res.json({ ok: true });
  });

  router.get('/groups/:id/unread', (req, res) => {
    const me = getUser(req);
    const groupId = Number(req.params.id);
    if (!isActive(membership(db, groupId, me.id))) return fail(res, 403, 'NOT_MEMBER');
    const row = db.prepare('SELECT last_read_id FROM ck_reads WHERE group_id = ? AND user_id = ?').get(groupId, me.id);
    const lastRead = row ? row.last_read_id : 0;
    const { c } = db
      .prepare('SELECT COUNT(*) AS c FROM ck_messages WHERE group_id = ? AND id > ? AND deleted_at IS NULL')
      .get(groupId, lastRead);
    res.json({ count: c });
  });

  router.get('/groups/:id/stream', (req, res) => {
    const me = getUser(req);
    const groupId = Number(req.params.id);
    if (!isActive(membership(db, groupId, me.id))) return fail(res, 403, 'NOT_MEMBER');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    const unsubscribe = bus.subscribe(groupId, (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`));
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  });

  return router;
};
