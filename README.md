# community-kit

Módulo reutilizable de **grupos, foro y chat** para apps Node + React. Empaqueta el backend (router
Express + esquema SQLite) y los componentes React con estilos propios, de forma **parametrizable**: el
host inyecta su base de datos, su autenticación, su modelo de usuario, su i18n y su tema.

- **Sin framework de UI obligatorio**: los componentes traen su propio CSS (variables `--ck-*`).
- **Sin modelo de usuario propio**: se conecta mediante un puente (`users.getByIds`, `searchUsers`).
- **Sin auth propia**: el host monta su middleware antes del router.
- **Chat en vivo** con SSE nativo (`EventSource`).

---

## 1. Instalación

Como dependencia git (recomendado para poder usarlo en varios proyectos):

```bash
npm install github:ubikee/community-kit#v0.1.0
# o en package.json:
# "community-kit": "github:ubikee/community-kit#v0.1.0"
```

Requisitos:

- **Backend**: Node con `node:sqlite` (Node ≥ 22 con `--experimental-sqlite`, ≥ 24 estable), Express 4.
- **Frontend**: React ≥ 18.

### Nota para Vite (importante)

`community-kit/react` es ESM con `.jsx` y `exports` condicionales. Para que Vite no intente pre-bundlearlo
(y falle), añade a `vite.config.js`:

```js
export default defineConfig({
  optimizeDeps: {
    exclude: ['community-kit', 'community-kit/react'],
  },
});
```

---

## 2. Estructura y exports

```
community-kit/
  server/           → community-kit/server   (CommonJS)
  react/            → community-kit/react    (ESM + JSX)
  react/styles.css  → community-kit/styles.css
```

---

## 3. Backend

### 3.1 Montaje

```js
const express = require('express');
const { createCommunity } = require('community-kit/server');

const app = express();
app.use(express.json());

const community = createCommunity({
  db,                                   // (obligatorio) handle node:sqlite: new DatabaseSync(...)
  getUser: (req) => req.user,           // (opcional) auth del host; por defecto req.user
  users: { getByIds },                  // (opcional) puente al modelo de usuario del host
  messages: {},                         // (opcional) textos de error por código
  onEvent: (type, data) => {},          // (opcional) ganchos para notificaciones, etc.
});

// La auth es responsabilidad del host: ponla ANTES del router.
app.use('/api/community', requireAuth, community.router);
```

`createCommunity` devuelve:

| Campo     | Descripción                                             |
| --------- | ------------------------------------------------------- |
| `router`  | Router Express con todas las rutas (grupos, foro, chat) |
| `migrate` | Fuerza la creación/migración del esquema                |
| `bus`     | Bus SSE por grupo: `subscribe(groupId, cb)` / `emit`    |

El esquema (`ck_*`) se crea automáticamente al llamar a `createCommunity`.

### 3.2 Opciones de `createCommunity`

| Opción     | Tipo                                  | Por defecto      | Descripción                                                                 |
| ---------- | ------------------------------------- | ---------------- | --------------------------------------------------------------------------- |
| `db`       | `DatabaseSync`                        | — (obligatorio)  | Conexión `node:sqlite` del host.                                            |
| `getUser`  | `(req) => ({ id }) \| null`           | `(req) => req.user` | Devuelve el usuario actual o `null` (→ 401).                             |
| `users`    | `{ getByIds(ids) => users[] }`        | `null`           | Enriquece autores con `username`, `name`, `avatar`.                         |
| `messages` | `{ [CODE]: string }`                  | inglés           | Personaliza el texto de error (ver 3.5).                                    |
| `onEvent`  | `(type, data) => void`                | `null`           | Ganchos: `group.created`, `member.joined`, `member.requested`, `member.added`, `member.approved`, `topic.created`, `post.created`, `message.created`. |

El puente de usuarios debe devolver objetos con al menos `{ id, username, name, avatar }`:

```js
function getByIds(ids) {
  if (!ids?.length) return [];
  const ph = ids.map(() => '?').join(',');
  return db
    .prepare(`SELECT id, username, name, avatar FROM users WHERE id IN (${ph})`)
    .all(...ids);
}
```

### 3.3 Endpoints (relativos a la ruta donde montes el router)

Grupos

| Método | Ruta                                    | Quién            |
| ------ | --------------------------------------- | ---------------- |
| GET    | `/groups?scope=mine\|discover&q=`       | autenticado      |
| POST   | `/groups` `{name, description?, visibility?}` | autenticado |
| GET    | `/groups/:id`                           | autenticado      |
| PATCH  | `/groups/:id` `{name?, description?, visibility?}` | admin |
| DELETE | `/groups/:id`                           | propietario      |
| GET    | `/groups/:id/members`                   | autenticado      |
| POST   | `/groups/:id/join`                      | autenticado      |
| DELETE | `/groups/:id/join` (salir)              | miembro          |
| POST   | `/groups/:id/members` `{userId}`        | admin            |
| POST   | `/groups/:id/members/:userId/approve`   | admin            |
| DELETE | `/groups/:id/members/:userId`           | admin            |

Foro

| Método | Ruta                          | Quién             |
| ------ | ----------------------------- | ----------------- |
| GET    | `/groups/:groupId/topics`     | miembro activo    |
| POST   | `/groups/:groupId/topics` `{title, body?}` | miembro |
| GET    | `/topics/:id`                 | miembro (→ `{topic, posts}`) |
| PATCH  | `/topics/:id` `{title?, body?, pinned?, locked?}` | autor; pin/lock admin |
| DELETE | `/topics/:id`                 | autor o admin     |
| POST   | `/topics/:id/posts` `{body}`  | miembro (tema abierto) |
| PATCH  | `/posts/:id` `{body}`         | autor             |
| DELETE | `/posts/:id`                  | autor o admin     |

Chat

| Método | Ruta                                | Quién          |
| ------ | ----------------------------------- | -------------- |
| GET    | `/groups/:id/messages?before=&limit=` | miembro activo |
| POST   | `/groups/:id/messages` `{body}`     | miembro        |
| DELETE | `/messages/:id`                     | autor o admin  |
| POST   | `/groups/:id/read` `{lastId}`       | miembro        |
| GET    | `/groups/:id/unread` → `{count}`    | miembro        |
| GET    | `/groups/:id/stream` (SSE)          | miembro        |

### 3.4 SSE y autenticación (muy importante)

El chat usa **`EventSource`**, que **no permite cabeceras**. Por eso el cliente manda el token como query:
`GET /groups/:id/stream?token=<token>`. Tu middleware de auth debe aceptar el token **también** en
`req.query.token`:

```js
function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (typeof req.query.token === 'string') return req.query.token; // ← SSE
  return null;
}
```

El bus es **en memoria** (un proceso). Si escalas a varias instancias, sustituye el bus por pub/sub externo.

### 3.5 Errores

Responden con `{ error, code }` donde `code` es `community/<CODE>`. Códigos:

`NOT_AUTH`, `NAME_REQUIRED`, `GROUP_NOT_FOUND`, `PRIVATE_GROUP`, `NOT_ADMIN`, `OWNER_ONLY`,
`CANNOT_LEAVE_OWNER`, `USER_NOT_FOUND`, `BANNED`, `NOT_MEMBER`, `TOPIC_NOT_FOUND`, `TITLE_REQUIRED`,
`TOPIC_LOCKED`, `POST_REQUIRED`, `POST_NOT_FOUND`, `MESSAGE_EMPTY`, `MESSAGE_NOT_FOUND`.

Personalízalos con `messages`:

```js
createCommunity({
  db,
  messages: {
    NOT_MEMBER: 'No eres miembro del grupo',
    NAME_REQUIRED: 'El nombre es obligatorio',
  },
});
```

### 3.6 Modelo de datos (canónico `ck_*`)

`ck_groups`, `ck_members` (rol: `owner|admin|member`; estado: `active|pending|banned`), `ck_invites`,
`ck_topics` (`pinned`, `locked`), `ck_posts` (borrado lógico), `ck_messages` (borrado lógico),
`ck_reads` (`last_read_id` por usuario/grupo).

---

## 4. Frontend (React)

### 4.1 API + Provider

```jsx
import {
  createCommunityApi,
  CommunityProvider,
  GroupList,
  GroupView,
} from 'community-kit/react';
import 'community-kit/styles.css';
import { Link, useNavigate, useParams } from 'react-router-dom';

// Una sola instancia de API
export const communityApi = createCommunityApi({
  basePath: '/api/community',
  getToken: () => localStorage.getItem('token'),
  onUnauthorized: () => { /* redirigir a login */ },
});

// Envuelve las vistas de grupos/foro/chat
export function CommunityScope({ children }) {
  const { t, lang } = useI18n();        // tu i18n (opcional)
  const { user } = useAuth();           // tu usuario actual
  return (
    <CommunityProvider
      api={communityApi}
      t={t}                             // opcional: tu traductor
      locale={lang}                     // 'es' | 'en'
      currentUser={user}                // { id, name, username, avatar }
      Avatar={UserAvatar}               // tu componente <Avatar user size />
      LinkComponent={Link}              // react-router Link, next/link, etc.
      searchUsers={(q) => api.searchUsers(q)} // opcional, para invitar
    >
      {children}
    </CommunityProvider>
  );
}
```

### 4.2 `createCommunityApi(options)`

`{ basePath = '/api/community', getToken, onUnauthorized }`. Devuelve métodos con los nombres de las
operaciones: `fetchGroups`, `createGroup`, `fetchGroup`, `updateGroup`, `deleteGroup`, `fetchGroupMembers`,
`joinGroup`, `leaveGroup`, `approveGroupMember`, `addGroupMember`, `removeGroupMember`, `fetchTopics`,
`createTopic`, `fetchTopic`, `updateTopic`, `deleteTopic`, `createPost`, `updatePost`, `deletePost`,
`fetchMessages`, `sendMessage`, `deleteMessage`, `markChatRead`, `getUnread` y
`subscribeGroupChat(groupId, onMessage) → unsubscribe()`.

### 4.3 `CommunityProvider` (props)

| Prop            | Descripción                                                            |
| --------------- | ---------------------------------------------------------------------- |
| `api`           | Instancia de `createCommunityApi` (obligatorio).                        |
| `t`             | `(key, vars) => string`. Si no encuentra la clave, usa el diccionario interno. |
| `locale`        | `'es'` \| `'en'` para el diccionario interno.                          |
| `currentUser`   | `{ id, name, username, avatar }`.                                       |
| `Avatar`        | Componente `<Avatar user size />`. Por defecto, iniciales.             |
| `LinkComponent` | Componente de enlace; recibe `to` y `className`. Por defecto `<a>`.    |
| `searchUsers`   | `(q) => Promise<users[]>`. Habilita el buscador para invitar.          |

### 4.4 Componentes

| Componente       | Props                                   | Qué muestra                               |
| ---------------- | --------------------------------------- | ----------------------------------------- |
| `GroupList`      | `groupHref?(g)`, `onOpenGroup?(g)`      | Mis grupos + descubrir + crear + unirse.  |
| `GroupView`      | `groupId`, `onLeft?()`                  | Cabecera + pestañas **Foro · Chat · Miembros**. |
| `ForumTopicList` | `groupId`, `isAdmin`                    | Lista de temas + crear.                   |
| `ForumTopicView` | `topicId`, `isAdmin`, `onBack()`         | Tema + respuestas + pin/lock/borrar.      |
| `ChatPanel`      | `groupId`, `isAdmin`                    | Chat en vivo (historial, envío, no leídos, borrar). |
| `AddGroupMember` | `groupId`, `onAdded?()`                 | Buscador para invitar (requiere `searchUsers`). |

Ejemplo de página de grupo:

```jsx
function GroupPage() {
  const { id } = useParams();
  return (
    <CommunityScope>
      <GroupView groupId={id} />
    </CommunityScope>
  );
}

function GroupsPage() {
  const navigate = useNavigate();
  return (
    <CommunityScope>
      <GroupList onOpenGroup={(g) => navigate(`/groups/${g.id}`)} />
    </CommunityScope>
  );
}
```

### 4.5 Estilos y tema

Importa una vez `import 'community-kit/styles.css';`. Personaliza con variables CSS:

```css
:root {
  --ck-fg: #1c1c1e;
  --ck-muted: #8a8a8e;
  --ck-bg: #ffffff;
  --ck-soft: #f5f5f7;
  --ck-border: #e5e5ea;
  --ck-primary: #1c1c1e;
  --ck-primary-fg: #ffffff;
  --ck-danger: #dc2626;
  --ck-radius: 12px;
}
```

Soporta modo oscuro automático (`prefers-color-scheme: dark`).

### 4.6 i18n

Los componentes usan claves con prefijo `groups.*`, `forum.*`, `chat.*` y `common.*`. Trae diccionarios
`es`/`en` internos (`DICT`). Si pasas tu propio `t`, se usa el tuyo cuando la clave existe; si no, cae al
diccionario interno.

---

## 5. Integración en 10 minutos

1. `npm i github:ubikee/community-kit#v0.1.0`
2. **Backend**: `createCommunity({ db, getUser, users })` y móntalo tras tu auth en `/api/community`.
   Acepta el token en `?token=` para el SSE.
3. **Frontend**: crea el `communityApi`, envuelve tus vistas con `CommunityProvider` y usa `GroupList` /
   `GroupView`. Importa `community-kit/styles.css`.
4. **Vite**: añade `optimizeDeps.exclude: ['community-kit', 'community-kit/react']`.
5. Envuelve la ruta del grupo con tu auth/i18n y listo.

---

## 6. Límites conocidos

- No hay mensajes directos (DM), adjuntos, edición de mensajes ni moderación/expulsión avanzada.
- El bus SSE es en memoria (una sola instancia).
- La migración de datos es responsabilidad del host si viene de otro esquema.
- `AddGroupMember` requiere que pases `searchUsers`; si no, no se muestra.
