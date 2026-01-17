/**
 * MonkeysJS TypeScript Definitions
 */

declare module 'monkeysjs' {
  // ============================================
  // Core Reactive System
  // ============================================

  export interface Ref<T = any> {
    value: T;
    __isRef: true;
  }

  export interface ComputedRef<T = any> extends Ref<T> {
    __isComputed: true;
  }

  export interface EffectOptions {
    lazy?: boolean;
    computed?: boolean;
    scheduler?: (effect: Function) => void;
    onStop?: () => void;
  }

  export interface WatchOptions {
    immediate?: boolean;
    deep?: boolean;
    flush?: 'pre' | 'post' | 'sync';
  }

  export type WatchSource<T = any> = Ref<T> | (() => T);
  export type WatchCallback<T = any> = (
    newValue: T,
    oldValue: T,
    onCleanup: (fn: () => void) => void
  ) => void;

  export function reactive<T extends object>(target: T): T;
  export function ref<T>(value: T): Ref<T>;
  export function unref<T>(ref: T | Ref<T>): T;
  export function isRef<T>(value: any): value is Ref<T>;
  export function isReactive(value: any): boolean;
  export function toRaw<T>(observed: T): T;
  export function computed<T>(getter: () => T): ComputedRef<T>;
  export function computed<T>(options: { get: () => T; set: (value: T) => void }): Ref<T>;
  export function watch<T>(source: WatchSource<T>, callback: WatchCallback<T>, options?: WatchOptions): () => void;
  export function effect(fn: () => void, options?: EffectOptions): () => void;
  export function stop(effectFn: () => void): void;
  export function batch(fn: () => void): void;
  export function track(target: object, key: string | symbol): void;
  export function trigger(target: object, key: string | symbol, type?: string): void;

  // ============================================
  // HTTP Client
  // ============================================

  export const RequestState: {
    IDLE: 'idle';
    LOADING: 'loading';
    SUCCESS: 'success';
    ERROR: 'error';
  };

  export interface HttpConfig {
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
    retries?: number;
    retryDelay?: number;
    retryBackoff?: 'linear' | 'exponential';
    retryCondition?: (error: HttpError) => boolean;
    cache?: boolean;
    cacheTTL?: number;
    dedupeRequests?: boolean;
    credentials?: RequestCredentials;
    responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData';
  }

  export interface HttpResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    config: HttpConfig;
  }

  export class HttpError extends Error {
    status: number;
    response: any;
    request: any;
  }

  export interface HttpClient {
    defaults: HttpConfig;
    get<T = any>(url: string, config?: HttpConfig): Promise<HttpResponse<T>>;
    post<T = any>(url: string, data?: any, config?: HttpConfig): Promise<HttpResponse<T>>;
    put<T = any>(url: string, data?: any, config?: HttpConfig): Promise<HttpResponse<T>>;
    patch<T = any>(url: string, data?: any, config?: HttpConfig): Promise<HttpResponse<T>>;
    delete<T = any>(url: string, config?: HttpConfig): Promise<HttpResponse<T>>;
    head<T = any>(url: string, config?: HttpConfig): Promise<HttpResponse<T>>;
    options<T = any>(url: string, config?: HttpConfig): Promise<HttpResponse<T>>;
    request<T = any>(config: HttpConfig & { url: string; method?: string }): Promise<HttpResponse<T>>;
    interceptors: {
      request: {
        use(fulfilled: (config: HttpConfig) => HttpConfig | Promise<HttpConfig>, rejected?: (error: any) => any): number;
        eject(id: number): void;
        clear(): void;
      };
      response: {
        use(fulfilled: (response: HttpResponse) => HttpResponse | Promise<HttpResponse>, rejected?: (error: any) => any): number;
        eject(id: number): void;
        clear(): void;
      };
    };
    cache: {
      get(key: string): any;
      set(key: string, value: any, ttl?: number): void;
      delete(key: string): void;
      clear(): void;
      has(key: string): boolean;
    };
  }

  export function createClient(config?: HttpConfig): HttpClient;
  export const http: HttpClient;

  export interface UseFetchReturn<T = any> {
    data: T | null;
    error: Error | null;
    status: string;
    isLoading: boolean;
    isError: boolean;
    isSuccess: boolean;
    response: HttpResponse<T> | null;
    execute(config?: Partial<HttpConfig>): Promise<HttpResponse<T> | null>;
    abort(): void;
    reset(): void;
    refresh(): Promise<HttpResponse<T> | null>;
  }

  export interface UseFetchOptions extends HttpConfig {
    immediate?: boolean;
    throwOnError?: boolean;
  }

  export function useFetch<T = any>(url: string, options?: UseFetchOptions): UseFetchReturn<T>;

  export interface UsePollingReturn<T = any> extends UseFetchReturn<T> {
    isPolling: Ref<boolean>;
    start(): void;
    stop(): void;
    toggle(): void;
  }

  export function usePolling<T = any>(url: string, interval?: number, options?: UseFetchOptions): UsePollingReturn<T>;

  // ============================================
  // WebSocket
  // ============================================

  export const WebSocketState: {
    CONNECTING: 'connecting';
    OPEN: 'open';
    CLOSING: 'closing';
    CLOSED: 'closed';
  };

  export interface WebSocketOptions {
    reconnect?: boolean;
    reconnectAttempts?: number;
    reconnectDelay?: number;
    reconnectDelayMax?: number;
    reconnectBackoff?: 'linear' | 'exponential';
    heartbeat?: boolean;
    heartbeatInterval?: number;
    heartbeatMessage?: string;
    heartbeatTimeout?: number;
    protocols?: string | string[];
    immediate?: boolean;
  }

  export interface UseWebSocketReturn {
    status: string;
    data: any;
    error: Event | null;
    lastMessage: string | null;
    lastMessageTime: number | null;
    reconnectCount: number;
    isConnected: boolean;
    isConnecting: boolean;
    state: {
      status: string;
      data: any;
      error: Event | null;
      lastMessage: string | null;
      lastMessageTime: number | null;
      reconnectCount: number;
    };
    open(): void;
    close(code?: number, reason?: string): void;
    send(data: any, options?: { queue?: boolean }): boolean;
    sendAsync<T = any>(data: any, options?: { timeout?: number; matcher?: (response: any, request: any) => boolean }): Promise<T>;
    on(event: 'open' | 'message' | 'error' | 'close', handler: Function): () => void;
    off(event: 'open' | 'message' | 'error' | 'close', handler: Function): void;
    once(event: 'open' | 'message' | 'error' | 'close', handler: Function): () => void;
    ws: Ref<WebSocket | null>;
  }

  export function useWebSocket(url: string, options?: WebSocketOptions): UseWebSocketReturn;

  export interface WebSocketClient {
    connect(path?: string, options?: WebSocketOptions): UseWebSocketReturn;
    disconnect(path?: string): void;
    disconnectAll(): void;
    on(event: 'open' | 'message' | 'error' | 'close', handler: Function): () => void;
    off(event: 'open' | 'message' | 'error' | 'close', handler: Function): void;
    broadcast(data: any): void;
    connections: Map<string, UseWebSocketReturn>;
  }

  export function createWebSocketClient(baseUrl: string, options?: WebSocketOptions): WebSocketClient;

  // ============================================
  // DOM Binding
  // ============================================

  export interface DirectiveHandler {
    init?(el: HTMLElement, expression: string, context: any, modifiers: string[], arg?: string): void;
    effect?(el: HTMLElement, expression: string, context: any, modifiers: string[], arg?: string): void;
  }

  export interface AppInstance {
    directive(name: string, handler: DirectiveHandler): AppInstance;
    component(name: string, definition: any): AppInstance;
    use(plugin: any, options?: any): AppInstance;
    provide(key: string, value: any): AppInstance;
    mount(selector: string | Element): AppInstance;
    unmount(): AppInstance;
    data: any;
    refs: Record<string, Element>;
  }

  export function createApp(rootData?: Record<string, any>): AppInstance;
  export function directive(name: string, handler: DirectiveHandler): void;
  export function component(name: string, definition: any): void;
  export function setPrefix(prefix: string): void;
  export function autoInit(): void;

  // ============================================
  // Form Utilities
  // ============================================

  export interface FormValidators {
    required(value: any, message?: string): string | null;
    email(value: any, message?: string): string | null;
    min(value: any, min: number, message?: string): string | null;
    max(value: any, max: number, message?: string): string | null;
    pattern(value: any, pattern: RegExp | string, message?: string): string | null;
    url(value: any, message?: string): string | null;
    matches(value: any, field: string, message?: string): string | null;
    custom(value: any, validator: (value: any, values: any) => string | null): string | null;
  }

  export interface ValidationRule {
    type: keyof FormValidators;
    value?: any;
    message?: string;
  }

  export interface UseFormReturn<T = Record<string, any>> {
    values: T;
    errors: Record<string, string>;
    touched: Record<string, boolean>;
    dirty: Record<string, boolean>;
    isSubmitting: Ref<boolean>;
    submitCount: Ref<number>;
    submitError: Ref<Error | null>;
    isValid: ComputedRef<boolean>;
    isDirty: ComputedRef<boolean>;
    isTouched: ComputedRef<boolean>;
    defineRules(rules: Record<string, ValidationRule | ValidationRule[] | ((value: any, values: T) => string | null)>): void;
    validate(): boolean;
    validateField(field: string): boolean;
    setValue(field: string, value: any): void;
    setValues(values: Partial<T>): void;
    setTouched(field: string, isTouched?: boolean): void;
    setError(field: string, message?: string): void;
    clearError(field: string): void;
    clearErrors(): void;
    reset(newInitialValues?: T): void;
    handleSubmit(onSubmit: (values: T) => Promise<any> | any): Promise<{ success: boolean; data?: any; error?: Error; errors?: Record<string, string> }>;
    field(name: string): {
      value: any;
      error: string | undefined;
      touched: boolean;
      dirty: boolean;
      onChange(value: any): void;
      onBlur(): void;
      bind: { value: any; onInput: (e: Event) => void; onBlur: () => void };
    };
    validators: FormValidators;
  }

  export interface UseFormOptions<T = Record<string, any>> {
    validateOnChange?: boolean;
    validateOnBlur?: boolean;
    validateOnSubmit?: boolean;
    resetOnSubmit?: boolean;
    transform?: (values: T) => any;
    validate?: (values: T) => Record<string, string> | null;
  }

  export function useForm<T = Record<string, any>>(initialValues?: T, options?: UseFormOptions<T>): UseFormReturn<T>;
  export function useFormSubmit<T = Record<string, any>>(url: string, options?: UseFormOptions<T> & HttpConfig & {
    method?: string;
    onSuccess?: (data: any, response: HttpResponse) => void;
    onError?: (error: Error) => void;
  }): UseFormReturn<T>;
  export function serializeForm(formElement: HTMLFormElement): Record<string, any>;
  export function useDebouncedValidation(form: UseFormReturn, delay?: number): (field?: string) => void;

  export interface UseFieldArrayReturn<T = any> {
    fields: T[];
    append(value?: T): void;
    prepend(value?: T): void;
    insert(index: number, value?: T): void;
    remove(index: number): void;
    swap(indexA: number, indexB: number): void;
    move(from: number, to: number): void;
    replace(index: number, value: T): void;
    clear(): void;
  }

  export function useFieldArray<T = any>(form: UseFormReturn, name: string, initialValue?: T[]): UseFieldArrayReturn<T>;

  // ============================================
  // Storage
  // ============================================

  export interface StorageAdapter {
    get<T = any>(key: string): T | null;
    set<T = any>(key: string, value: T): boolean;
    remove(key: string): void;
    clear(): void;
    has(key: string): boolean;
    keys(): string[];
  }

  export const localStorage: StorageAdapter;
  export const sessionStorage: StorageAdapter;
  export function createMemoryStorage(): StorageAdapter;

  export interface UseStorageOptions {
    serializer?: { parse: (value: string) => any; stringify: (value: any) => string };
    onError?: (error: Error) => void;
    listenToStorageChanges?: boolean;
  }

  export function useLocalStorage<T = any>(key: string, defaultValue: T, options?: UseStorageOptions): Ref<T>;
  export function useSessionStorage<T = any>(key: string, defaultValue: T, options?: UseStorageOptions): Ref<T>;
  export function useStorage<T = any>(key: string, defaultValue: T, storage: StorageAdapter, options?: UseStorageOptions): Ref<T>;

  export interface CookieOptions {
    path?: string;
    domain?: string;
    expires?: Date | string;
    maxAge?: number;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    httpOnly?: boolean;
  }

  export const cookies: {
    get(name: string): string | null;
    set(name: string, value: string, options?: CookieOptions): void;
    remove(name: string, options?: CookieOptions): void;
    has(name: string): boolean;
    getAll(): Record<string, string>;
  };

  export function useCookie(name: string, defaultValue?: string, options?: CookieOptions): Ref<string>;

  export interface IndexedDBStore {
    name: string;
    options?: IDBObjectStoreParameters;
  }

  export interface IndexedDBWrapper {
    open(stores?: IndexedDBStore[]): Promise<IDBDatabase>;
    get<T = any>(storeName: string, key: IDBValidKey): Promise<T | undefined>;
    getAll<T = any>(storeName: string): Promise<T[]>;
    set<T = any>(storeName: string, value: T): Promise<IDBValidKey>;
    add<T = any>(storeName: string, value: T): Promise<IDBValidKey>;
    delete(storeName: string, key: IDBValidKey): Promise<void>;
    clear(storeName: string): Promise<void>;
    count(storeName: string): Promise<number>;
    close(): void;
  }

  export function createIndexedDB(dbName: string, version?: number): IndexedDBWrapper;

  // ============================================
  // Utilities
  // ============================================

  export interface DebouncedFunction<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): void;
    cancel(): void;
    flush(...args: Parameters<T>): void;
  }

  export interface ThrottledFunction<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): void;
    cancel(): void;
  }

  export function debounce<T extends (...args: any[]) => any>(fn: T, delay?: number): DebouncedFunction<T>;
  export function throttle<T extends (...args: any[]) => any>(fn: T, limit?: number): ThrottledFunction<T>;
  export function deepClone<T>(obj: T): T;
  export function deepMerge<T extends object>(target: T, ...sources: Partial<T>[]): T;
  export function isObject(item: any): item is object;
  export function get<T = any>(obj: any, path: string | string[], defaultValue?: T): T;
  export function set<T extends object>(obj: T, path: string | string[], value: any): T;
  export function unset<T extends object>(obj: T, path: string | string[]): T;
  export function has(obj: any, path: string | string[]): boolean;
  export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>;
  export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>;
  export function uniqueId(prefix?: string): string;
  export function uuid(): string;
  export function sleep(ms: number): Promise<void>;

  export interface RetryOptions {
    attempts?: number;
    delay?: number;
    backoff?: 'linear' | 'exponential';
    onRetry?: (error: Error, attempt: number, delay: number) => void;
  }

  export function retry<T>(fn: (attempt: number) => Promise<T>, options?: RetryOptions): Promise<T>;

  export interface MemoizedFunction<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): ReturnType<T>;
    cache: Map<string, ReturnType<T>>;
    clear(): void;
  }

  export function memoize<T extends (...args: any[]) => any>(fn: T, resolver?: (...args: Parameters<T>) => string): MemoizedFunction<T>;

  export interface EventEmitter {
    on(event: string, handler: (...args: any[]) => void): () => void;
    off(event: string, handler: (...args: any[]) => void): void;
    once(event: string, handler: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
    clear(event?: string): void;
  }

  export function createEventEmitter(): EventEmitter;

  export interface CancellablePromise<T> {
    promise: Promise<T>;
    cancel(): void;
  }

  export function cancellable<T>(promise: Promise<T>): CancellablePromise<T>;

  export interface Queue {
    add<T>(fn: () => Promise<T>): Promise<T>;
    readonly pending: number;
    readonly running: number;
    clear(): void;
  }

  export function createQueue(concurrency?: number): Queue;

  export function parseQuery(queryString: string): Record<string, string | string[]>;
  export function stringifyQuery(params: Record<string, any>): string;
  export function escapeHtml(str: string): string;
  export function formatBytes(bytes: number, decimals?: number): string;
  export function formatNumber(num: number, options?: Intl.NumberFormatOptions & { locale?: string }): string;
  export function capitalize(str: string): string;
  export function camelCase(str: string): string;
  export function kebabCase(str: string): string;
  export function snakeCase(str: string): string;

  // ============================================
  // Default Export
  // ============================================

  export interface MonkeysJS {
    version: string;
    install(app: any, options?: { baseURL?: string }): void;
    
    // All exports included
    reactive: typeof reactive;
    ref: typeof ref;
    computed: typeof computed;
    watch: typeof watch;
    effect: typeof effect;
    createClient: typeof createClient;
    http: typeof http;
    useFetch: typeof useFetch;
    useWebSocket: typeof useWebSocket;
    createApp: typeof createApp;
    useForm: typeof useForm;
    // ... etc
  }

  const MonkeysJS: MonkeysJS;
  export default MonkeysJS;
}

declare global {
  interface Window {
    MonkeysJS: typeof import('monkeysjs').default;
    $m: typeof import('monkeysjs').default;
  }
}
