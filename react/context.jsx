import { createContext, useCallback, useContext, useMemo } from 'react';
import { DICT, translateFromDict } from './i18n';

const CommunityContext = createContext(null);

// CommunityProvider agrupa todo lo que los componentes necesitan del host:
//   api           cliente creado con createCommunityApi
//   t             (opcional) traductor del host; si falta o no encuentra la
//                 clave, se usa el diccionario incluido (es/en)
//   locale        'es' | 'en' (para el diccionario por defecto)
//   currentUser   usuario actual ({ id, name, username, avatar })
//   Avatar        componente de avatar: <Avatar user size />
//   LinkComponent componente de enlace: recibe `to` y `className`
//   searchUsers   (opcional) (q) => usuarios, para invitar a un grupo
export function CommunityProvider({
  api,
  t,
  locale = 'es',
  currentUser = null,
  Avatar = DefaultAvatar,
  LinkComponent = DefaultLink,
  searchUsers = null,
  children,
}) {
  const translate = useCallback(
    (key, vars) => {
      if (typeof t === 'function') {
        const value = t(key, vars);
        if (value && value !== key) return value;
      }
      return translateFromDict(DICT, locale, key, vars);
    },
    [t, locale]
  );

  const value = useMemo(
    () => ({ api, t: translate, locale, currentUser, Avatar, LinkComponent, searchUsers }),
    [api, translate, locale, currentUser, Avatar, LinkComponent, searchUsers]
  );

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error('useCommunity debe usarse dentro de <CommunityProvider>');
  return ctx;
}

export function DefaultAvatar({ user, size = 32, className = '' }) {
  const initial = (user?.name || user?.username || '?').charAt(0).toUpperCase();
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt=""
        className={`ck-avatar ${className}`}
        style={{ width: size, height: size }}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    );
  }
  return (
    <span className={`ck-avatar ck-avatar--text ${className}`} style={{ width: size, height: size }}>
      {initial}
    </span>
  );
}

export function DefaultLink({ to, className = '', children }) {
  return (
    <a href={to} className={className}>
      {children}
    </a>
  );
}
