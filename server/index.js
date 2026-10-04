const express = require('express');
const { migrate } = require('./schema');
const { createBus } = require('./bus');
const { createEnricher } = require('./util');
const groupsRouter = require('./routes/groups');
const forumRouter = require('./routes/forum');
const chatRouter = require('./routes/chat');

const DEFAULT_MESSAGES = {
  NOT_AUTH: 'Not authenticated',
  NAME_REQUIRED: 'Name is required',
  GROUP_NOT_FOUND: 'Group not found',
  PRIVATE_GROUP: 'Private group',
  NOT_ADMIN: 'Not authorized',
  OWNER_ONLY: 'Only the owner can do this',
  CANNOT_LEAVE_OWNER: 'The owner cannot leave; delete the group instead',
  USER_NOT_FOUND: 'User not found',
  BANNED: 'You cannot join this group',
  NOT_MEMBER: 'You are not a member of the group',
  TOPIC_NOT_FOUND: 'Topic not found',
  TITLE_REQUIRED: 'Title is required',
  TOPIC_LOCKED: 'The topic is locked',
  POST_REQUIRED: 'Message cannot be empty',
  POST_NOT_FOUND: 'Post not found',
  MESSAGE_EMPTY: 'Message cannot be empty',
  MESSAGE_NOT_FOUND: 'Message not found',
};

// createCommunity({ db, getUser, users, messages, onEvent })
//   db       handle node:sqlite (obligatorio)
//   getUser  (req) => ({ id }) | null. Por defecto `req.user`.
//   users    { getByIds(ids) } para enriquecer con username/name/avatar (opcional).
//   messages mapa code -> texto para personalizar errores (opcional).
//   onEvent  (type, payload) => void, ganchos para el host (notificaciones…) (opcional).
function createCommunity(options = {}) {
  const { db, getUser = (req) => req.user, users = null, messages = {}, onEvent = null } = options;
  if (!db) throw new Error('createCommunity: falta el parámetro `db`');

  migrate(db);

  const table = { ...DEFAULT_MESSAGES, ...messages };
  const fail = (res, status, code) => res.status(status).json({ error: table[code] || code, code: `community/${code}` });
  const bus = createBus();
  const ctx = { db, getUser, users, onEvent, fail, bus, enrich: createEnricher(users) };

  const router = express.Router();
  router.use((req, res, next) => {
    if (!getUser(req)) return fail(res, 401, 'NOT_AUTH');
    next();
  });
  router.use(groupsRouter(ctx));
  router.use(forumRouter(ctx));
  router.use(chatRouter(ctx));

  return { router, migrate: () => migrate(db), bus };
}

module.exports = { createCommunity, DEFAULT_MESSAGES };
