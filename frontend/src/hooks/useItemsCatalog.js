import { useEffect, useState } from 'react';
import { api } from '../context/AuthContext';

// Shared, app-wide item catalogue (lite projection) with stale-while-revalidate.
// Pages render instantly from the cached copy and refresh in the background.
const TTL_MS = 5 * 60 * 1000;
let cache = { data: null, ts: 0, promise: null, dirty: false };
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn(cache.data));

export function getItemsCatalog({ force = false } = {}) {
  const fresh = cache.data && !cache.dirty && Date.now() - cache.ts < TTL_MS;
  if (!force && fresh) return Promise.resolve(cache.data);
  if (cache.promise) return cache.promise;
  cache.promise = api.get('/api/items?lite=1')
    .then((r) => {
      cache = { data: r.data || [], ts: Date.now(), promise: null, dirty: false };
      notify();
      return cache.data;
    })
    .catch((e) => { cache.promise = null; throw e; });
  return cache.promise;
}

export function peekItemsCatalog() { return cache.data; }

// Any write to the API may change items/stock → mark stale (next mount refetches in background).
export function markItemsCatalogDirty() { cache.dirty = true; }

api.interceptors.response.use((response) => {
  const m = (response.config?.method || 'get').toLowerCase();
  if (m !== 'get' && m !== 'head' && m !== 'options') markItemsCatalogDirty();
  return response;
});

export function useItemsCatalog() {
  const [items, setItems] = useState(() => peekItemsCatalog() || []);
  useEffect(() => {
    listeners.add(setItems);
    getItemsCatalog().catch((e) => console.error('Failed to load items catalogue:', e));
    return () => { listeners.delete(setItems); };
  }, []);
  return items;
}
