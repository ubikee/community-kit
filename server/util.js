function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueSlug(db, name) {
  const base = normalize(name) || 'group';
  let slug = base;
  let i = 1;
  while (db.prepare('SELECT 1 FROM ck_groups WHERE slug = ?').get(slug)) {
    slug = `${base}-${(i += 1)}`;
  }
  return slug;
}

function membership(db, groupId, userId) {
  return db.prepare('SELECT * FROM ck_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}

function isActive(m) {
  return Boolean(m && m.status === 'active');
}

function isAdmin(m) {
  return Boolean(m && m.status === 'active' && (m.role === 'owner' || m.role === 'admin'));
}

function getGroup(db, id) {
  return db.prepare('SELECT * FROM ck_groups WHERE id = ?').get(id);
}

// Puente de usuarios del host: enriquece filas con username/name/avatar.
function createEnricher(users) {
  return function enrich(rows) {
    const list = Array.isArray(rows) ? rows : [rows];
    if (!users || typeof users.getByIds !== 'function' || list.length === 0) return rows;
    const ids = [...new Set(list.map((r) => r && r.user_id).filter(Boolean))];
    if (ids.length === 0) return rows;
    const map = new Map((users.getByIds(ids) || []).map((u) => [Number(u.id), u]));
    const out = list.map((r) => {
      const u = map.get(Number(r.user_id));
      return { ...r, username: u ? u.username : null, name: u ? u.name : null, avatar: u ? u.avatar : null };
    });
    return Array.isArray(rows) ? out : out[0];
  };
}

module.exports = { normalize, uniqueSlug, membership, isActive, isAdmin, getGroup, createEnricher };
