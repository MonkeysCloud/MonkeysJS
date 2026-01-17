/**
 * MonkeysJS - Storage Utilities
 * Local storage, session storage, and cookie helpers with reactive state
 */

import { ref, watch } from '../core/reactive.js';

/**
 * Storage adapter interface
 */
const createStorageAdapter = (storage) => ({
  get(key) {
    try {
      const item = storage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return storage.getItem(key);
    }
  },

  set(key, value) {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      storage.setItem(key, serialized);
      return true;
    } catch (error) {
      console.warn('Storage set failed:', error);
      return false;
    }
  },

  remove(key) {
    storage.removeItem(key);
  },

  clear() {
    storage.clear();
  },

  has(key) {
    return storage.getItem(key) !== null;
  },

  keys() {
    return Object.keys(storage);
  }
});

// Storage adapters
export const localStorage = typeof window !== 'undefined' 
  ? createStorageAdapter(window.localStorage)
  : createMemoryStorage();

export const sessionStorage = typeof window !== 'undefined'
  ? createStorageAdapter(window.sessionStorage)
  : createMemoryStorage();

/**
 * Create in-memory storage (for SSR or testing)
 */
export function createMemoryStorage() {
  const store = new Map();

  return {
    get(key) {
      return store.get(key) ?? null;
    },

    set(key, value) {
      store.set(key, value);
      return true;
    },

    remove(key) {
      store.delete(key);
    },

    clear() {
      store.clear();
    },

    has(key) {
      return store.has(key);
    },

    keys() {
      return Array.from(store.keys());
    }
  };
}

/**
 * Reactive local storage
 */
export function useLocalStorage(key, defaultValue, options = {}) {
  return useStorage(key, defaultValue, localStorage, options);
}

/**
 * Reactive session storage
 */
export function useSessionStorage(key, defaultValue, options = {}) {
  return useStorage(key, defaultValue, sessionStorage, options);
}

/**
 * Generic reactive storage
 */
export function useStorage(key, defaultValue, storage, options = {}) {
  const {
    serializer = JSON,
    onError = console.error,
    listenToStorageChanges = true
  } = options;

  // Get initial value
  const getStoredValue = () => {
    try {
      const raw = storage.get(key);
      return raw !== null ? raw : defaultValue;
    } catch (error) {
      onError(error);
      return defaultValue;
    }
  };

  const data = ref(getStoredValue());

  // Watch for changes and sync to storage
  watch(
    () => data.value,
    (newValue) => {
      try {
        if (newValue === null || newValue === undefined) {
          storage.remove(key);
        } else {
          storage.set(key, newValue);
        }
      } catch (error) {
        onError(error);
      }
    },
    { deep: true }
  );

  // Listen for storage events from other tabs
  if (listenToStorageChanges && typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === key) {
        try {
          data.value = event.newValue ? serializer.parse(event.newValue) : defaultValue;
        } catch {
          data.value = event.newValue ?? defaultValue;
        }
      }
    });
  }

  return data;
}

/**
 * Cookie utilities
 */
export const cookies = {
  get(name) {
    if (typeof document === 'undefined') return null;
    
    const matches = document.cookie.match(
      new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)')
    );
    return matches ? decodeURIComponent(matches[1]) : null;
  },

  set(name, value, options = {}) {
    if (typeof document === 'undefined') return;

    const {
      path = '/',
      domain,
      expires,
      maxAge,
      secure,
      sameSite = 'Lax',
      httpOnly
    } = options;

    let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

    if (path) cookieString += `; path=${path}`;
    if (domain) cookieString += `; domain=${domain}`;
    
    if (expires) {
      const date = expires instanceof Date ? expires : new Date(expires);
      cookieString += `; expires=${date.toUTCString()}`;
    }
    
    if (maxAge !== undefined) cookieString += `; max-age=${maxAge}`;
    if (secure) cookieString += '; secure';
    if (sameSite) cookieString += `; samesite=${sameSite}`;
    if (httpOnly) cookieString += '; httponly';

    document.cookie = cookieString;
  },

  remove(name, options = {}) {
    this.set(name, '', { ...options, maxAge: -1 });
  },

  has(name) {
    return this.get(name) !== null;
  },

  getAll() {
    if (typeof document === 'undefined') return {};
    
    return document.cookie.split(';').reduce((cookies, cookie) => {
      const [name, value] = cookie.split('=').map(c => c.trim());
      if (name) {
        cookies[decodeURIComponent(name)] = decodeURIComponent(value || '');
      }
      return cookies;
    }, {});
  }
};

/**
 * Reactive cookie
 */
export function useCookie(name, defaultValue, options = {}) {
  const data = ref(cookies.get(name) ?? defaultValue);

  watch(
    () => data.value,
    (newValue) => {
      if (newValue === null || newValue === undefined) {
        cookies.remove(name, options);
      } else {
        cookies.set(name, newValue, options);
      }
    }
  );

  return data;
}

/**
 * IndexedDB wrapper
 */
export function createIndexedDB(dbName, version = 1) {
  let db = null;
  let dbPromise = null;

  const open = (stores = []) => {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available'));
        return;
      }

      const request = indexedDB.open(dbName, version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        stores.forEach(store => {
          if (!database.objectStoreNames.contains(store.name)) {
            database.createObjectStore(store.name, store.options || { keyPath: 'id' });
          }
        });
      };
    });

    return dbPromise;
  };

  const getStore = (storeName, mode = 'readonly') => {
    if (!db) throw new Error('Database not opened');
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  };

  const promisifyRequest = (request) => {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  return {
    open,

    async get(storeName, key) {
      await open();
      const store = getStore(storeName);
      return promisifyRequest(store.get(key));
    },

    async getAll(storeName) {
      await open();
      const store = getStore(storeName);
      return promisifyRequest(store.getAll());
    },

    async set(storeName, value) {
      await open();
      const store = getStore(storeName, 'readwrite');
      return promisifyRequest(store.put(value));
    },

    async add(storeName, value) {
      await open();
      const store = getStore(storeName, 'readwrite');
      return promisifyRequest(store.add(value));
    },

    async delete(storeName, key) {
      await open();
      const store = getStore(storeName, 'readwrite');
      return promisifyRequest(store.delete(key));
    },

    async clear(storeName) {
      await open();
      const store = getStore(storeName, 'readwrite');
      return promisifyRequest(store.clear());
    },

    async count(storeName) {
      await open();
      const store = getStore(storeName);
      return promisifyRequest(store.count());
    },

    close() {
      if (db) {
        db.close();
        db = null;
        dbPromise = null;
      }
    }
  };
}

export default {
  localStorage,
  sessionStorage,
  createMemoryStorage,
  useLocalStorage,
  useSessionStorage,
  useStorage,
  cookies,
  useCookie,
  createIndexedDB
};
