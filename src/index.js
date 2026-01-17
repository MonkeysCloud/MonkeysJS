/**
 * MonkeysJS
 * A lightweight, reactive JavaScript library with built-in HTTP client,
 * declarative DOM binding, caching, WebSockets, and more
 * 
 * @author Yorch / MonkeysCloud
 * @license MIT
 * @version 1.0.0
 */

// Core Reactive System
export {
  reactive,
  ref,
  unref,
  isRef,
  isReactive,
  toRaw,
  computed,
  watch,
  effect,
  stop,
  batch,
  track,
  trigger
} from './core/reactive.js';

// HTTP Client
export {
  createClient,
  useFetch,
  usePolling,
  http,
  HttpError,
  RequestState
} from './http/client.js';

// WebSocket
export {
  useWebSocket,
  createWebSocketClient,
  WebSocketState
} from './http/websocket.js';

// DOM Binding
export {
  createApp,
  directive,
  component,
  setPrefix,
  autoInit
} from './dom/binding.js';

// Form Utilities
export {
  useForm,
  useFormSubmit,
  serializeForm,
  useDebouncedValidation,
  useFieldArray
} from './dom/form.js';

// Storage
export {
  localStorage,
  sessionStorage,
  createMemoryStorage,
  useLocalStorage,
  useSessionStorage,
  useStorage,
  cookies,
  useCookie,
  createIndexedDB
} from './utils/storage.js';

// Utilities
export {
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
} from './utils/helpers.js';

// Import defaults for namespace
import reactiveModule from './core/reactive.js';
import httpModule from './http/client.js';
import wsModule from './http/websocket.js';
import domModule from './dom/binding.js';
import formModule from './dom/form.js';
import storageModule from './utils/storage.js';
import utilsModule from './utils/helpers.js';

// Create MonkeysJS namespace
const MonkeysJS = {
  // Version
  version: '1.0.0',

  // Core
  ...reactiveModule,

  // HTTP
  ...httpModule,

  // WebSocket
  ...wsModule,

  // DOM
  ...domModule,

  // Forms
  ...formModule,

  // Storage
  ...storageModule,

  // Utils
  ...utilsModule,

  // Install as plugin (for compatibility)
  install(app, options = {}) {
    // Add global properties
    app.config.globalProperties.$monkeys = MonkeysJS;
    
    // Add reactive helpers
    app.config.globalProperties.$reactive = reactiveModule.reactive;
    app.config.globalProperties.$ref = reactiveModule.ref;
    app.config.globalProperties.$computed = reactiveModule.computed;
    app.config.globalProperties.$watch = reactiveModule.watch;
    
    // Add HTTP client
    app.config.globalProperties.$http = httpModule.http;
    
    // Configure if options provided
    if (options.baseURL) {
      httpModule.http.defaults.baseURL = options.baseURL;
    }
  }
};

// Auto-init when used via CDN
if (typeof window !== 'undefined') {
  window.MonkeysJS = MonkeysJS;
  window.$m = MonkeysJS;
  
  // Auto-initialize DOM bindings when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      domModule.autoInit();
    });
  }
}

export default MonkeysJS;
