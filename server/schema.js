// Esquema canónico del paquete. Todas las tablas usan el prefijo `ck_` y no
// declaran claves foráneas hacia el modelo de usuario del host: el puente de
// usuarios se resuelve en tiempo de consulta (ver `users` en createCommunity).
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ck_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      description TEXT,
      visibility TEXT NOT NULL DEFAULT 'public',
      owner_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ck_members (
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS ck_invites (
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      invited_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS ck_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      locked INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ck_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS ck_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS ck_reads (
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      last_read_id INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ck_members_group ON ck_members(group_id);
    CREATE INDEX IF NOT EXISTS idx_ck_topics_group ON ck_topics(group_id);
    CREATE INDEX IF NOT EXISTS idx_ck_posts_topic ON ck_posts(topic_id);
    CREATE INDEX IF NOT EXISTS idx_ck_messages_group ON ck_messages(group_id, id);
  `);
}

module.exports = { migrate };
