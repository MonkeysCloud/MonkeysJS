/**
 * MonkeysJS Live — Shared Utilities
 *
 * Helpers for CSRF, modifiers, IDs, debounce/throttle, and DOM queries.
 * Part of the purpose-built live runtime for MonkeysLegion.
 *
 * @module monkeysjs/live/utils
 */

/**
 * Read the CSRF token from the meta tag injected by @liveScripts.
 * @returns {string}
 */
export function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') || '' : '';
}

/**
 * Generate a unique component instance ID.
 * @returns {string}
 */
export function generateId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return 'lc_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Parse a modifier chain from an attribute value.
 *
 * @example
 *   parseModifiers('ml:model.live.debounce.300ms')
 *   // => { name: 'model', modifiers: ['live', 'debounce', '300ms'] }
 *
 * @param {string} attrName The full attribute name.
 * @returns {{ name: string, modifiers: string[], eventName: string|null }}
 */
export function parseModifiers(attrName) {
  // Remove 'ml:' prefix
  const raw = attrName.startsWith('ml:') ? attrName.slice(3) : attrName;
  const parts = raw.split('.');
  const name = parts[0];
  const modifiers = parts.slice(1);

  // For event directives (ml:click, ml:keydown.enter), extract the event name
  const eventDirectives = ['on', 'click', 'submit', 'keydown', 'keyup',
    'keypress', 'change', 'input', 'focus', 'blur', 'mouseenter',
    'mouseleave', 'scroll', 'resize'];

  let eventName = null;
  if (eventDirectives.includes(name)) {
    eventName = name;
  }

  return { name, modifiers, eventName };
}

/**
 * Parse a duration modifier (e.g., '300ms', '1.5s').
 * @param {string} mod The modifier string.
 * @returns {number} Duration in milliseconds.
 */
export function parseDuration(mod) {
  if (mod.endsWith('ms')) {
    return parseInt(mod, 10);
  }
  if (mod.endsWith('s')) {
    return parseFloat(mod) * 1000;
  }
  return parseInt(mod, 10) || 300;
}

/**
 * Debounce a function call.
 * @param {Function} fn The function to debounce.
 * @param {number} delay Delay in milliseconds.
 * @returns {Function}
 */
export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * Throttle a function call.
 * @param {Function} fn The function to throttle.
 * @param {number} limit Limit in milliseconds.
 * @returns {Function}
 */
export function throttle(fn, limit) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Find the closest live component root element from any child element.
 * @param {Element} el The element to start from.
 * @returns {Element|null}
 */
export function findComponentRoot(el) {
  return el.closest('[data-ml-id]');
}

/**
 * Get the component ID from a root element.
 * @param {Element} root The component root element.
 * @returns {string|null}
 */
export function getComponentId(root) {
  return root.getAttribute('data-ml-id');
}

/**
 * Check if the user is currently offline.
 * @returns {boolean}
 */
export function isOffline() {
  return !navigator.onLine;
}

/**
 * Deep-compare two plain objects/arrays.
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Set a value at a dotted path on an object.
 * @param {object} obj Target object.
 * @param {string} path Dot-notation path (e.g., 'user.name').
 * @param {*} value The value to set.
 */
export function setByPath(obj, path, value) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Get a value at a dotted path on an object.
 * @param {object} obj Source object.
 * @param {string} path Dot-notation path.
 * @returns {*}
 */
export function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) =>
    acc != null ? acc[key] : undefined, obj);
}
