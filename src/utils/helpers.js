/**
 * MonkeysJS - Utilities
 * Helper functions and utilities
 */

/**
 * Debounce function
 */
export function debounce(fn, delay = 300) {
  let timeoutId = null;
  
  const debounced = (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, delay);
  };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  debounced.flush = (...args) => {
    debounced.cancel();
    fn.apply(this, args);
  };

  return debounced;
}

/**
 * Throttle function
 */
export function throttle(fn, limit = 300) {
  let inThrottle = false;
  let lastArgs = null;

  const throttled = (...args) => {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          throttled.apply(this, lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };

  throttled.cancel = () => {
    inThrottle = false;
    lastArgs = null;
  };

  return throttled;
}

/**
 * Deep clone object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }

  if (obj instanceof Map) {
    const mapCopy = new Map();
    obj.forEach((value, key) => {
      mapCopy.set(deepClone(key), deepClone(value));
    });
    return mapCopy;
  }

  if (obj instanceof Set) {
    const setCopy = new Set();
    obj.forEach(value => {
      setCopy.add(deepClone(value));
    });
    return setCopy;
  }

  const cloned = {};
  Object.keys(obj).forEach(key => {
    cloned[key] = deepClone(obj[key]);
  });

  return cloned;
}

/**
 * Deep merge objects
 */
export function deepMerge(target, ...sources) {
  if (!sources.length) return target;
  
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!target[key]) {
          Object.assign(target, { [key]: {} });
        }
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    });
  }

  return deepMerge(target, ...sources);
}

/**
 * Check if value is plain object
 */
export function isObject(item) {
  return !!(item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Get nested property value
 */
export function get(obj, path, defaultValue = undefined) {
  const keys = typeof path === 'string' ? path.split('.') : path;
  let result = obj;

  for (const key of keys) {
    if (result === null || result === undefined) {
      return defaultValue;
    }
    result = result[key];
  }

  return result === undefined ? defaultValue : result;
}

/**
 * Set nested property value
 */
export function set(obj, path, value) {
  const keys = typeof path === 'string' ? path.split('.') : path;
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return obj;
}

/**
 * Remove nested property
 */
export function unset(obj, path) {
  const keys = typeof path === 'string' ? path.split('.') : path;
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      return obj;
    }
    current = current[key];
  }

  delete current[keys[keys.length - 1]];
  return obj;
}

/**
 * Check if object has nested property
 */
export function has(obj, path) {
  const keys = typeof path === 'string' ? path.split('.') : path;
  let current = obj;

  for (const key of keys) {
    if (!current || !(key in current)) {
      return false;
    }
    current = current[key];
  }

  return true;
}

/**
 * Pick properties from object
 */
export function pick(obj, keys) {
  return keys.reduce((result, key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
    return result;
  }, {});
}

/**
 * Omit properties from object
 */
export function omit(obj, keys) {
  const keysSet = new Set(keys);
  return Object.keys(obj).reduce((result, key) => {
    if (!keysSet.has(key)) {
      result[key] = obj[key];
    }
    return result;
  }, {});
}

/**
 * Generate unique ID
 */
export function uniqueId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}${timestamp}${random}`;
}

/**
 * Generate UUID v4
 */
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Sleep/delay utility
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with backoff
 */
export async function retry(fn, options = {}) {
  const {
    attempts = 3,
    delay = 1000,
    backoff = 'exponential',
    onRetry = () => {}
  } = options;

  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      
      if (attempt < attempts - 1) {
        const waitTime = backoff === 'exponential' 
          ? delay * Math.pow(2, attempt)
          : delay * (attempt + 1);
        
        onRetry(error, attempt + 1, waitTime);
        await sleep(waitTime);
      }
    }
  }

  throw lastError;
}

/**
 * Memoize function
 */
export function memoize(fn, resolver) {
  const cache = new Map();

  const memoized = (...args) => {
    const key = resolver ? resolver(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };

  memoized.cache = cache;
  memoized.clear = () => cache.clear();

  return memoized;
}

/**
 * Create event emitter
 */
export function createEventEmitter() {
  const events = new Map();

  return {
    on(event, handler) {
      if (!events.has(event)) {
        events.set(event, new Set());
      }
      events.get(event).add(handler);
      return () => this.off(event, handler);
    },

    off(event, handler) {
      if (events.has(event)) {
        events.get(event).delete(handler);
      }
    },

    once(event, handler) {
      const wrappedHandler = (...args) => {
        this.off(event, wrappedHandler);
        handler(...args);
      };
      this.on(event, wrappedHandler);
    },

    emit(event, ...args) {
      if (events.has(event)) {
        events.get(event).forEach(handler => {
          try {
            handler(...args);
          } catch (error) {
            console.error(`Error in event handler for "${event}":`, error);
          }
        });
      }
    },

    clear(event) {
      if (event) {
        events.delete(event);
      } else {
        events.clear();
      }
    }
  };
}

/**
 * Create a cancellable promise
 */
export function cancellable(promise) {
  let isCancelled = false;

  const wrappedPromise = new Promise((resolve, reject) => {
    promise.then(
      value => isCancelled ? reject({ cancelled: true }) : resolve(value),
      error => isCancelled ? reject({ cancelled: true }) : reject(error)
    );
  });

  return {
    promise: wrappedPromise,
    cancel() {
      isCancelled = true;
    }
  };
}

/**
 * Queue for sequential async operations
 */
export function createQueue(concurrency = 1) {
  const queue = [];
  let running = 0;

  async function process() {
    if (running >= concurrency || queue.length === 0) return;

    running++;
    const { fn, resolve, reject } = queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      running--;
      process();
    }
  }

  return {
    add(fn) {
      return new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        process();
      });
    },
    
    get pending() {
      return queue.length;
    },
    
    get running() {
      return running;
    },

    clear() {
      queue.length = 0;
    }
  };
}

/**
 * Parse query string
 */
export function parseQuery(queryString) {
  const params = new URLSearchParams(queryString);
  const result = {};

  params.forEach((value, key) => {
    if (key in result) {
      if (!Array.isArray(result[key])) {
        result[key] = [result[key]];
      }
      result[key].push(value);
    } else {
      result[key] = value;
    }
  });

  return result;
}

/**
 * Stringify object to query string
 */
export function stringifyQuery(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    
    if (Array.isArray(value)) {
      value.forEach(v => searchParams.append(key, v));
    } else {
      searchParams.append(key, value);
    }
  });

  return searchParams.toString();
}

/**
 * Escape HTML
 */
export function escapeHtml(str) {
  const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return str.replace(/[&<>"']/g, char => htmlEscapes[char]);
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Format number with separators
 */
export function formatNumber(num, options = {}) {
  const { locale = 'en-US', ...intlOptions } = options;
  return new Intl.NumberFormat(locale, intlOptions).format(num);
}

/**
 * Capitalize string
 */
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert to camelCase
 */
export function camelCase(str) {
  return str
    .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
    .replace(/^./, char => char.toLowerCase());
}

/**
 * Convert to kebab-case
 */
export function kebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Convert to snake_case
 */
export function snakeCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

export default {
  debounce,
  throttle,
  deepClone,
  deepMerge,
  isObject,
  get,
  set,
  unset,
  has,
  pick,
  omit,
  uniqueId,
  uuid,
  sleep,
  retry,
  memoize,
  createEventEmitter,
  cancellable,
  createQueue,
  parseQuery,
  stringifyQuery,
  escapeHtml,
  formatBytes,
  formatNumber,
  capitalize,
  camelCase,
  kebabCase,
  snakeCase
};
