/**
 * MonkeysJS - HTTP Client
 * Full-featured HTTP client with caching, retries, deduplication, and more
 */

import { reactive, ref } from '../core/reactive.js';

// Request states
export const RequestState = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error'
};

// Default configuration
const defaultConfig = {
  baseURL: '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  },
  retries: 0,
  retryDelay: 1000,
  retryBackoff: 'exponential', // 'linear' | 'exponential'
  retryCondition: (error) => error.status >= 500 || error.status === 0,
  cache: false,
  cacheTTL: 5 * 60 * 1000, // 5 minutes
  dedupeRequests: true,
  credentials: 'same-origin',
  responseType: 'json' // 'json' | 'text' | 'blob' | 'arrayBuffer'
};

// Request interceptors
const requestInterceptors = [];
const responseInterceptors = [];

// Cache storage
const cache = new Map();
const cacheTimestamps = new Map();

// In-flight requests for deduplication
const pendingRequests = new Map();

/**
 * HTTP Error class
 */
export class HttpError extends Error {
  constructor(message, status, response, request) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.response = response;
    this.request = request;
  }
}

/**
 * Generate cache key from request config
 */
function getCacheKey(config) {
  const { method, url, params, data } = config;
  return `${method}:${url}:${JSON.stringify(params || {})}:${JSON.stringify(data || {})}`;
}

/**
 * Check if cache entry is valid
 */
function isCacheValid(key, ttl) {
  const timestamp = cacheTimestamps.get(key);
  if (!timestamp) return false;
  return Date.now() - timestamp < ttl;
}

/**
 * Build URL with query params
 */
function buildURL(baseURL, url, params) {
  let fullURL = url.startsWith('http') ? url : `${baseURL}${url}`;
  
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, v));
        } else {
          searchParams.append(key, value);
        }
      }
    });
    const separator = fullURL.includes('?') ? '&' : '?';
    fullURL += separator + searchParams.toString();
  }
  
  return fullURL;
}

/**
 * Sleep utility for retry delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay
 */
function getRetryDelay(attempt, baseDelay, backoff) {
  if (backoff === 'exponential') {
    return baseDelay * Math.pow(2, attempt);
  }
  return baseDelay * (attempt + 1);
}

/**
 * Run request interceptors
 */
async function runRequestInterceptors(config) {
  let currentConfig = { ...config };
  
  for (const interceptor of requestInterceptors) {
    try {
      currentConfig = await interceptor.fulfilled(currentConfig);
    } catch (error) {
      if (interceptor.rejected) {
        currentConfig = await interceptor.rejected(error);
      } else {
        throw error;
      }
    }
  }
  
  return currentConfig;
}

/**
 * Run response interceptors
 */
async function runResponseInterceptors(response, config) {
  let currentResponse = response;
  
  for (const interceptor of responseInterceptors) {
    try {
      currentResponse = await interceptor.fulfilled(currentResponse, config);
    } catch (error) {
      if (interceptor.rejected) {
        currentResponse = await interceptor.rejected(error, config);
      } else {
        throw error;
      }
    }
  }
  
  return currentResponse;
}

/**
 * Parse response based on type
 */
async function parseResponse(response, type) {
  switch (type) {
    case 'json':
      const text = await response.text();
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return text;
      }
    case 'text':
      return response.text();
    case 'blob':
      return response.blob();
    case 'arrayBuffer':
      return response.arrayBuffer();
    case 'formData':
      return response.formData();
    default:
      return response.json();
  }
}

/**
 * Core fetch function with all features
 */
async function coreFetch(config) {
  const finalConfig = { ...defaultConfig, ...config };
  const {
    baseURL,
    url,
    method = 'GET',
    headers,
    data,
    params,
    timeout,
    retries,
    retryDelay,
    retryBackoff,
    retryCondition,
    cache: useCache,
    cacheTTL,
    dedupeRequests,
    credentials,
    responseType,
    onUploadProgress,
    onDownloadProgress,
    signal: externalSignal
  } = finalConfig;

  const fullURL = buildURL(baseURL, url, params);
  const cacheKey = getCacheKey({ method, url: fullURL, params, data });

  // Check cache for GET requests
  if (useCache && method === 'GET' && isCacheValid(cacheKey, cacheTTL)) {
    return cache.get(cacheKey);
  }

  // Check for duplicate in-flight requests
  if (dedupeRequests && method === 'GET' && pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;

  // Combine external signal with internal controller
  const signal = externalSignal 
    ? (externalSignal.aborted ? controller.signal : controller.signal)
    : controller.signal;

  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort());
  }

  // Prepare fetch options
  const fetchOptions = {
    method: method.toUpperCase(),
    headers: { ...defaultConfig.headers, ...headers },
    credentials,
    signal
  };

  // Add body for non-GET requests
  if (data && method !== 'GET') {
    if (data instanceof FormData) {
      delete fetchOptions.headers['Content-Type'];
      fetchOptions.body = data;
    } else if (typeof data === 'object') {
      fetchOptions.body = JSON.stringify(data);
    } else {
      fetchOptions.body = data;
    }
  }

  // Create the fetch promise
  const fetchPromise = (async () => {
    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(fullURL, fetchOptions);
        
        if (!response.ok) {
          const errorData = await parseResponse(response.clone(), responseType);
          throw new HttpError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            errorData,
            { url: fullURL, method, data }
          );
        }

        const parsedData = await parseResponse(response, responseType);
        
        const result = {
          data: parsedData,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          config: finalConfig
        };

        // Cache successful GET requests
        if (useCache && method === 'GET') {
          cache.set(cacheKey, result);
          cacheTimestamps.set(cacheKey, Date.now());
        }

        return result;
      } catch (error) {
        lastError = error;
        
        // Don't retry if aborted
        if (error.name === 'AbortError') {
          throw new HttpError('Request aborted', 0, null, { url: fullURL, method, data });
        }

        // Check if we should retry
        const shouldRetry = attempt < retries && 
          (error instanceof HttpError ? retryCondition(error) : true);

        if (shouldRetry) {
          const delay = getRetryDelay(attempt, retryDelay, retryBackoff);
          await sleep(delay);
          continue;
        }

        throw error;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    throw lastError;
  })();

  // Track pending request for deduplication
  if (dedupeRequests && method === 'GET') {
    pendingRequests.set(cacheKey, fetchPromise);
    fetchPromise.finally(() => pendingRequests.delete(cacheKey)).catch(() => {});
  }

  return fetchPromise;
}

/**
 * Main request function with interceptors
 */
async function request(config) {
  // Run request interceptors
  const interceptedConfig = await runRequestInterceptors(config);
  
  // Execute request
  const response = await coreFetch(interceptedConfig);
  
  // Run response interceptors
  return runResponseInterceptors(response, interceptedConfig);
}

/**
 * HTTP client factory
 */
export function createClient(baseConfig = {}) {
  const clientConfig = { ...defaultConfig, ...baseConfig };

  const client = {
    // Configuration
    defaults: clientConfig,

    // HTTP methods
    get(url, config = {}) {
      return request({ ...clientConfig, ...config, url, method: 'GET' });
    },

    post(url, data, config = {}) {
      return request({ ...clientConfig, ...config, url, method: 'POST', data });
    },

    put(url, data, config = {}) {
      return request({ ...clientConfig, ...config, url, method: 'PUT', data });
    },

    patch(url, data, config = {}) {
      return request({ ...clientConfig, ...config, url, method: 'PATCH', data });
    },

    delete(url, config = {}) {
      return request({ ...clientConfig, ...config, url, method: 'DELETE' });
    },

    head(url, config = {}) {
      return request({ ...clientConfig, ...config, url, method: 'HEAD' });
    },

    options(url, config = {}) {
      return request({ ...clientConfig, ...config, url, method: 'OPTIONS' });
    },

    // Generic request
    request(config) {
      return request({ ...clientConfig, ...config });
    },

    // Interceptors
    interceptors: {
      request: {
        use(fulfilled, rejected) {
          const id = requestInterceptors.length;
          requestInterceptors.push({ fulfilled, rejected });
          return id;
        },
        eject(id) {
          requestInterceptors.splice(id, 1);
        },
        clear() {
          requestInterceptors.length = 0;
        }
      },
      response: {
        use(fulfilled, rejected) {
          const id = responseInterceptors.length;
          responseInterceptors.push({ fulfilled, rejected });
          return id;
        },
        eject(id) {
          responseInterceptors.splice(id, 1);
        },
        clear() {
          responseInterceptors.length = 0;
        }
      }
    },

    // Cache management
    cache: {
      get(key) {
        return cache.get(key);
      },
      set(key, value, ttl = clientConfig.cacheTTL) {
        cache.set(key, value);
        cacheTimestamps.set(key, Date.now());
      },
      delete(key) {
        cache.delete(key);
        cacheTimestamps.delete(key);
      },
      clear() {
        cache.clear();
        cacheTimestamps.clear();
      },
      has(key) {
        return cache.has(key) && isCacheValid(key, clientConfig.cacheTTL);
      }
    }
  };

  return client;
}

/**
 * Reactive fetch composable
 * Creates reactive state for HTTP requests
 */
export function useFetch(url, options = {}) {
  const data = ref(null);
  const error = ref(null);
  const status = ref(RequestState.IDLE);
  const isLoading = ref(false);
  const isError = ref(false);
  const isSuccess = ref(false);
  const response = ref(null);

  const config = reactive({
    url,
    ...options
  });

  const abortController = ref(null);

  async function execute(overrideConfig = {}) {
    // Abort previous request if exists
    if (abortController.value) {
      abortController.value.abort();
    }

    abortController.value = new AbortController();

    status.value = RequestState.LOADING;
    isLoading.value = true;
    isError.value = false;
    isSuccess.value = false;
    error.value = null;

    try {
      const result = await request({
        ...config,
        ...overrideConfig,
        url: overrideConfig.url || config.url,
        signal: abortController.value.signal
      });

      data.value = result.data;
      response.value = result;
      status.value = RequestState.SUCCESS;
      isSuccess.value = true;

      return result;
    } catch (err) {
      error.value = err;
      status.value = RequestState.ERROR;
      isError.value = true;

      if (options.throwOnError) {
        throw err;
      }

      return null;
    } finally {
      isLoading.value = false;
    }
  }

  function abort() {
    if (abortController.value) {
      abortController.value.abort();
    }
  }

  function reset() {
    data.value = null;
    error.value = null;
    status.value = RequestState.IDLE;
    isLoading.value = false;
    isError.value = false;
    isSuccess.value = false;
    response.value = null;
  }

  // Auto-execute if immediate option is set
  if (options.immediate !== false) {
    execute();
  }

  return {
    data,
    error,
    status,
    isLoading,
    isError,
    isSuccess,
    response,
    execute,
    abort,
    reset,
    refresh: execute
  };
}

/**
 * Polling composable
 */
export function usePolling(url, interval = 5000, options = {}) {
  const fetchState = useFetch(url, { ...options, immediate: false });
  const isPolling = ref(false);
  let timeoutId = null;

  async function poll() {
    if (!isPolling.value) return;
    
    await fetchState.execute();
    
    if (isPolling.value) {
      timeoutId = setTimeout(poll, interval);
    }
  }

  function start() {
    if (isPolling.value) return;
    isPolling.value = true;
    poll();
  }

  function stop() {
    isPolling.value = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function toggle() {
    if (isPolling.value) {
      stop();
    } else {
      start();
    }
  }

  return {
    ...fetchState,
    isPolling,
    start,
    stop,
    toggle
  };
}

/**
 * Upload composable with progress
 */
export function useUpload(url, options = {}) {
  const progress = ref(0);
  const isUploading = ref(false);
  const error = ref(null);
  const data = ref(null);
  const abortController = ref(null);

  /**
   * Upload file or data
   */
  async function upload(fileOrData, config = {}) {
    progress.value = 0;
    isUploading.value = true;
    error.value = null;
    data.value = null;

    if (abortController.value) {
      abortController.value.abort();
    }
    abortController.value = new AbortController();

    try {
      // Prepare FormData if it's a file
      let body = fileOrData;
      if (fileOrData instanceof File) {
        body = new FormData();
        body.append(options.fieldName || 'file', fileOrData);
      }

      // Use XMLHttpRequest for progress events (fetch doesn't support upload progress yet standardly)
      // Or use the custom client if it supports it.
      // Our client logic uses fetch.
      // To support progress, we might need XHR or a fetch wrapper that simulates it?
      // Actually, let's stick to XHR for true upload progress.

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(options.method || 'POST', url);
        
        // Headers
        if (options.headers) {
          Object.entries(options.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        }
        
        // Progress
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            progress.value = Math.round((e.loaded / e.total) * 100);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              data.value = response;
              progress.value = 100;
              resolve(response);
            } catch (e) {
               data.value = xhr.responseText;
               resolve(xhr.responseText);
            }
          } else {
            error.value = new Error(`Upload failed: ${xhr.statusText}`);
            reject(error.value);
          }
          isUploading.value = false;
        };

        xhr.onerror = () => {
          error.value = new Error('Network error');
          isUploading.value = false;
          reject(error.value);
        };

        xhr.onabort = () => {
            isUploading.value = false;
            // Don't reject if aborted manually usually
        };

        // Attach abort signal
        abortController.value.signal.addEventListener('abort', () => xhr.abort());

        xhr.send(body);
      });

    } catch (err) {
      error.value = err;
      isUploading.value = false;
      throw err;
    }
  }

  function cancel() {
    if (abortController.value) {
      abortController.value.abort();
      isUploading.value = false;
    }
  }

  return {
    progress,
    isUploading,
    error,
    data,
    upload,
    cancel
  };
}

// Default client instance
export const http = createClient();

export default {
  createClient,
  useFetch,
  usePolling,
  http,
  HttpError,
  RequestState
};
