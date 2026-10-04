const express = require('express');
const { membership, isActive, isAdmin } = require('../util');

module.exports = function forumRouter(ctx) {
  const { db, getUser, enrich, onEvent, fail } = ctx;
  const router = express.Router();

  const TOPIC_SELECT = `
    SELECT t.*,
      (SELECT COUNT(*) FROM ck_posts p WHERE p.topic_id = t.id AND p.deleted_at IS NULL) AS posts
    FROM ck_topics t
  `;

  router.get('/groups/:groupId/topics', (req, res) => {
    const me = getUser(req);
    const groupId = Number(req.params.groupId);
    if (!isActive(membership(db, groupId, me.id))) return fail(res, 403, 'NOT_MEMBER');
    const topics = db.prepare(`${TOPIC_SELECT} WHERE t.group_id = ? ORDER BY t.pinned DESC, t.updated_at DESC`).all(groupId);
    res.json(enrich(topics));
  });

  router.post('/groups/:groupId/topics', (req, res) => {
    const me = getUser(req);
    const groupId = Number(req.params.groupId);
    if (!isActive(membership(db, groupId, me.id))) return fail(res, 403, 'NOT_MEMBER');
    const title = String(req.body.title || '').trim();
    const body = String(req.body.body || '').trim();
    if (!title) return fail(res, 400, 'TITLE_REQUIRED');
    const result = db
      .prepare('INSERT INTO ck_topics (group_id, user_id, title, body) VALUES (?, ?, ?, ?)')
      .run(groupId, me.id, title, body || null);
    const topic = enrich(db.prepare(`${TOPIC_SELECT} WHERE t.id = ?`).get(result.lastInsertRowid));
    onEvent?.('topic.created', { groupId, topicId: topic.id, userId: me.id });
    res.status(201).json(topic);
  });

  router.get('/topics/:id', (req, res) => {
    const me = getUser(req);
    const topic = db.prepare('SELECT * FROM ck_topics WHERE id = ?').get(req.params.id);
    if (!topic) return fail(res, 404, 'TOPIC_NOT_FOUND');
    const m = membership(db, topic.group_id, me.id);
    if (!isActive(m)) return fail(res, 403, 'NOT_MEMBER');
    const posts = db
      .prepare('SELECT * FROM ck_posts WHERE topic_id = ? AND deleted_at IS NULL ORDER BY created_at ASC')
      .all(topic.id);
    res.json({ topic: { ...enrich(topic), myRole: m.role }, posts: enrich(posts) });
  });

  router.patch('/topics/:id', (req, res) => {
    const me = getUser(req);
    const topic = db.prepare('SELECT * FROM ck_topics WHERE id = ?').get(req.params.id);
    if (!topic) return fail(res, 404, 'TOPIC_NOT_FOUND');
    const m = membership(db, topic.group_id, me.id);
    const admin = isAdmin(m);
    if (!isActive(m)) return fail(res, 403, 'NOT_MEMBER');
    if (!admin && Number(topic.user_id) !== Number(me.id)) return fail(res, 403, 'NOT_ADMIN');
    const title = req.body.title !== undefined ? String(req.body.title).trim() : topic.title;
    const body = req.body.body !== undefined ? String(req.body.body).trim() : topic.body;
    const pinned = req.body.pinned !== undefined && admin ? (req.body.pinned ? 1 : 0) : topic.pinned;
    const locked = req.body.locked !== undefined && admin ? (req.body.locked ? 1 : 0) : topic.locked;
    db.prepare(
      'UPDATE ck_topics SET title = ?, body = ?, pinned = ?, locked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(title || topic.title, body || null, pinned, locked, topic.id);
    res.json(db.prepare('SELECT * FROM ck_topics WHERE id = ?').get(topic.id));
  });

  router.delete('/topics/:id', (req, res) => {
    const me = getUser(req);
    const topic = db.prepare('SELECT * FROM ck_topics WHERE id = ?').get(req.params.id);
    if (!topic) return fail(res, 404, 'TOPIC_NOT_FOUND');
    const m = membership(db, topic.group_id, me.id);
    if (!isAdmin(m) && Number(topic.user_id) !== Number(me.id)) return fail(res, 403, 'NOT_ADMIN');
    db.prepare('DELETE FROM ck_topics WHERE id = ?').run(topic.id);
    db.prepare('DELETE FROM ck_posts WHERE topic_id = ?').run(topic.id);
    res.json({ ok: true });
  });

  router.post('/topics/:id/posts', (req, res) => {
    const me = getUser(req);
    const topic = db.prepare('SELECT * FROM ck_topics WHERE id = ?').get(req.params.id);
    if (!topic) return fail(res, 404, 'TOPIC_NOT_FOUND');
    if (!isActive(membership(db, topic.group_id, me.id))) return fail(res, 403, 'NOT_MEMBER');
    if (topic.locked) return fail(res, 400, 'TOPIC_LOCKED');
    const body = String(req.body.body || '').trim();
    if (!body) return fail(res, 400, 'POST_REQUIRED');
    const result = db.prepare('INSERT INTO ck_posts (topic_id, user_id, body) VALUES (?, ?, ?)').run(topic.id, me.id, body);
    db.prepare('UPDATE ck_topics SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(topic.id);
    const post = enrich(db.prepare('SELECT * FROM ck_posts WHERE id = ?').get(result.lastInsertRowid));
    onEvent?.('post.created', { groupId: topic.group_id, topicId: topic.id, postId: post.id, userId: me.id });
    res.status(201).json(post);
  });

  router.patch('/posts/:id', (req, res) => {
    const me = getUser(req);
    const post = db.prepare('SELECT * FROM ck_posts WHERE id = ?').get(req.params.id);
    if (!post || post.deleted_at) return fail(res, 404, 'POST_NOT_FOUND');
    if (Number(post.user_id) !== Number(me.id)) return fail(res, 403, 'NOT_ADMIN');
    const body = String(req.body.body || '').trim();
    if (!body) return fail(res, 400, 'POST_REQUIRED');
    db.prepare('UPDATE ck_posts SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(body, post.id);
    res.json(db.prepare('SELECT * FROM ck_posts WHERE id = ?').get(post.id));
  });

  router.delete('/posts/:id', (req, res) => {
    const me = getUser(req);
    const post = db.prepare('SELECT * FROM ck_posts WHERE id = ?').get(req.params.id);
    if (!post) return fail(res, 404, 'POST_NOT_FOUND');
    const topic = db.prepare('SELECT * FROM ck_topics WHERE id = ?').get(post.topic_id);
    const m = membership(db, topic.group_id, me.id);
    if (!isAdmin(m) && Number(post.user_id) !== Number(me.id)) return fail(res, 403, 'NOT_ADMIN');
    db.prepare('UPDATE ck_posts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(post.id);
    res.json({ ok: true });
  });

  return router;
};
