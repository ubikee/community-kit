const express = require('express');
const { uniqueSlug, membership, isActive, isAdmin, getGroup } = require('../util');

module.exports = function groupsRouter(ctx) {
  const { db, getUser, onEvent, fail } = ctx;
  const router = express.Router();

  function groupSummary(group, userId) {
    const members = db
      .prepare(`SELECT COUNT(*) AS c FROM ck_members WHERE group_id = ? AND status = 'active'`)
      .get(group.id).c;
    const m = membership(db, group.id, userId);
    return { ...group, members, myStatus: m ? m.status : 'none', myRole: m ? m.role : null };
  }

  router.get('/groups', (req, res) => {
    const me = getUser(req);
    const scope = req.query.scope === 'mine' ? 'mine' : 'discover';
    const q = String(req.query.q || '').trim();

    if (scope === 'mine') {
      const rows = db
        .prepare(
          `SELECT g.*, m.role AS my_role, m.status AS my_status,
             (SELECT COUNT(*) FROM ck_members gm WHERE gm.group_id = g.id AND gm.status='active') AS members
           FROM ck_groups g
           JOIN ck_members m ON m.group_id = g.id AND m.user_id = ?
           WHERE m.status = 'active'
           ORDER BY g.name ASC`
        )
        .all(me.id);
      return res.json(rows.map((r) => ({ ...r, myStatus: 'active' })));
    }

    const params = [me.id];
    let sql = `SELECT g.*,
        (SELECT COUNT(*) FROM ck_members gm WHERE gm.group_id = g.id AND gm.status='active') AS members,
        (SELECT status FROM ck_members gm WHERE gm.group_id = g.id AND gm.user_id = ?) AS my_status
      FROM ck_groups g
      WHERE g.visibility = 'public'`;
    if (q) {
      sql += ` AND (g.name LIKE ? OR g.description LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY g.name ASC LIMIT 50';
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map((r) => ({ ...r, myStatus: r.my_status || 'none' })));
  });

  router.post('/groups', (req, res) => {
    const me = getUser(req);
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const visibility = req.body.visibility === 'private' ? 'private' : 'public';
    if (!name) return fail(res, 400, 'NAME_REQUIRED');

    const slug = uniqueSlug(db, name);
    const result = db
      .prepare('INSERT INTO ck_groups (name, slug, description, visibility, owner_id) VALUES (?, ?, ?, ?, ?)')
      .run(name, slug, description || null, visibility, me.id);
    const id = result.lastInsertRowid;
    db.prepare(`INSERT INTO ck_members (group_id, user_id, role, status) VALUES (?, ?, 'owner', 'active')`).run(
      id,
      me.id
    );
    const group = getGroup(db, id);
    onEvent?.('group.created', { groupId: Number(id), userId: me.id });
    res.status(201).json(groupSummary(group, me.id));
  });

  router.get('/groups/:id', (req, res) => {
    const me = getUser(req);
    const group = getGroup(db, req.params.id);
    if (!group) return fail(res, 404, 'GROUP_NOT_FOUND');
    const m = membership(db, group.id, me.id);
    if (group.visibility === 'private' && !isActive(m)) return fail(res, 403, 'PRIVATE_GROUP');
    res.json(groupSummary(group, me.id));
  });

  router.patch('/groups/:id', (req, res) => {
    const me = getUser(req);
    const group = getGroup(db, req.params.id);
    if (!group) return fail(res, 404, 'GROUP_NOT_FOUND');
    if (!isAdmin(membership(db, group.id, me.id))) return fail(res, 403, 'NOT_ADMIN');
    const name = req.body.name !== undefined ? String(req.body.name).trim() : group.name;
    const description = req.body.description !== undefined ? String(req.body.description).trim() : group.description;
    const visibility =
      req.body.visibility !== undefined ? (req.body.visibility === 'private' ? 'private' : 'public') : group.visibility;
    db.prepare('UPDATE ck_groups SET name = ?, description = ?, visibility = ? WHERE id = ?').run(
      name || group.name,
      description || null,
      visibility,
      group.id
    );
    res.json(groupSummary(getGroup(db, group.id), me.id));
  });

  router.delete('/groups/:id', (req, res) => {
    const me = getUser(req);
    const group = getGroup(db, req.params.id);
    if (!group) return fail(res, 404, 'GROUP_NOT_FOUND');
    if (Number(group.owner_id) !== Number(me.id)) return fail(res, 403, 'OWNER_ONLY');
    db.prepare('DELETE FROM ck_groups WHERE id = ?').run(group.id);
    db.prepare('DELETE FROM ck_members WHERE group_id = ?').run(group.id);
    db.prepare('DELETE FROM ck_topics WHERE group_id = ?').run(group.id);
    db.prepare('DELETE FROM ck_messages WHERE group_id = ?').run(group.id);
    res.json({ ok: true });
  });

  router.get('/groups/:id/members', (req, res) => {
    const me = getUser(req);
    const group = getGroup(db, req.params.id);
    if (!group) return fail(res, 404, 'GROUP_NOT_FOUND');
    const m = membership(db, group.id, me.id);
    if (group.visibility === 'private' && !isActive(m)) return fail(res, 403, 'PRIVATE_GROUP');
    const rows = db
      .prepare(
        `SELECT user_id, user_id AS id, role, status, joined_at FROM ck_members
         WHERE group_id = ? AND (status = 'active' ${isAdmin(m) ? "OR status = 'pending'" : ''})
         ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`
      )
      .all(group.id);
    res.json(ctx.enrich(rows));
  });

  router.post('/groups/:id/join', (req, res) => {
    const me = getUser(req);
    const group = getGroup(db, req.params.id);
    if (!group) return fail(res, 404, 'GROUP_NOT_FOUND');

    const m = membership(db, group.id, me.id);
    if (isActive(m)) return res.json(groupSummary(group, me.id));
    if (m && m.status === 'banned') return fail(res, 403, 'BANNED');

    const status = group.visibility === 'private' ? 'pending' : 'active';
    db.prepare(
      `INSERT INTO ck_members (group_id, user_id, role, status) VALUES (?, ?, 'member', ?)
       ON CONFLICT(group_id, user_id) DO UPDATE SET status = excluded.status`
    ).run(group.id, me.id, status);
    onEvent?.(status === 'active' ? 'member.joined' : 'member.requested', { groupId: group.id, userId: me.id });
    res.json(groupSummary(group, me.id));
  });

  router.delete('/groups/:id/join', (req, res) => {
    const me = getUser(req);
    const group = getGroup(db, req.params.id);
    if (!group) return fail(res, 404, 'GROUP_NOT_FOUND');
    if (Number(group.owner_id) === Number(me.id)) return fail(res, 400, 'CANNOT_LEAVE_OWNER');
    db.prepare('DELETE FROM ck_members WHERE group_id = ? AND user_id = ?').run(group.id, me.id);
    res.json({ ok: true });
  });

  router.post('/groups/:id/members', (req, res) => {
    const me = getUser(req);
    const group = getGroup(db, req.params.id);
    if (!group) return fail(res, 404, 'GROUP_NOT_FOUND');
    if (!isAdmin(membership(db, group.id, me.id))) return fail(res, 403, 'NOT_ADMIN');
    const userId = Number(req.body.userId);
    if (!userId) return fail(res, 400, 'USER_NOT_FOUND');

    db.prepare('INSERT OR IGNORE INTO ck_invites (group_id, user_id, invited_by) VALUES (?, ?, ?)').run(
      group.id,
      userId,
      me.id
    );
    db.prepare(
      `INSERT INTO ck_members (group_id, user_id, role, status) VALUES (?, ?, 'member', 'active')
       ON CONFLICT(group_id, user_id) DO UPDATE SET status = 'active'`
    ).run(group.id, userId);
    onEvent?.('member.added', { groupId: group.id, userId, by: me.id });
    res.status(201).json({ ok: true });
  });

  router.post('/groups/:id/members/:userId/approve', (req, res) => {
    const me = getUser(req);
    const group = getGroup(db, req.params.id);
    if (!group) return fail(res, 404, 'GROUP_NOT_FOUND');
    if (!isAdmin(membership(db, group.id, me.id))) return fail(res, 403, 'NOT_ADMIN');
    db.prepare(`UPDATE ck_members SET status = 'active' WHERE group_id = ? AND user_id = ?`).run(
      group.id,
      req.params.userId
    );
    onEvent?.('member.approved', { groupId: group.id, userId: Number(req.params.userId), by: me.id });
    res.json({ ok: true });
  });

  router.delete('/groups/:id/members/:userId', (req, res) => {
    const me = getUser(req);
    const group = getGroup(db, req.params.id);
    if (!group) return fail(res, 404, 'GROUP_NOT_FOUND');
    if (!isAdmin(membership(db, group.id, me.id))) return fail(res, 403, 'NOT_ADMIN');
    if (Number(group.owner_id) === Number(req.params.userId)) return fail(res, 400, 'OWNER_ONLY');
    db.prepare('DELETE FROM ck_members WHERE group_id = ? AND user_id = ?').run(group.id, req.params.userId);
    res.json({ ok: true });
  });

  return router;
};
