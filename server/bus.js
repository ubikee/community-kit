// Bus SSE en memoria, agrupado por clave (id de grupo). Un canal por grupo.
function createBus() {
  const listeners = new Map();

  function subscribe(key, cb) {
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    set.add(cb);
    return () => {
      set.delete(cb);
      if (set.size === 0) listeners.delete(key);
    };
  }

  function emit(key, payload) {
    const set = listeners.get(key);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(payload);
      } catch {
        /* ignore */
      }
    }
  }

  return { subscribe, emit };
}

module.exports = { createBus };
