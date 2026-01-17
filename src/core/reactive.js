/**
 * MonkeysJS - Core Reactive System
 * Provides reactive state management with fine-grained reactivity
 */

// Track current effect being executed
let activeEffect = null;
const effectStack = [];

// WeakMap to store dependencies for each reactive object
const targetMap = new WeakMap();

/**
 * Creates a reactive effect that automatically re-runs when dependencies change
 * @param {Function} fn - The effect function
 * @param {Object} options - Effect options
 * @returns {Function} - The effect runner
 */
export function effect(fn, options = {}) {
  const effectFn = () => {
    cleanup(effectFn);
    activeEffect = effectFn;
    effectStack.push(effectFn);
    
    try {
      const result = fn();
      return result;
    } finally {
      effectStack.pop();
      activeEffect = effectStack[effectStack.length - 1];
    }
  };

  effectFn.deps = new Set();
  effectFn.options = options;
  effectFn.active = true;

  if (!options.lazy) {
    effectFn();
  }

  return effectFn;
}

/**
 * Cleanup effect dependencies
 * @param {Function} effectFn - The effect function
 */
function cleanup(effectFn) {
  effectFn.deps.forEach(dep => {
    dep.delete(effectFn);
  });
  effectFn.deps.clear();
}

/**
 * Stop an effect from running
 * @param {Function} effectFn - The effect function to stop
 */
export function stop(effectFn) {
  if (effectFn.active) {
    cleanup(effectFn);
    effectFn.active = false;
    if (effectFn.options.onStop) {
      effectFn.options.onStop();
    }
  }
}

/**
 * Track a dependency
 * @param {Object} target - The reactive object
 * @param {string} key - The property key
 */
export function track(target, key) {
  if (!activeEffect) return;

  let depsMap = targetMap.get(target);
  if (!depsMap) {
    targetMap.set(target, (depsMap = new Map()));
  }

  let dep = depsMap.get(key);
  if (!dep) {
    depsMap.set(key, (dep = new Set()));
  }

  if (!dep.has(activeEffect)) {
    dep.add(activeEffect);
    activeEffect.deps.add(dep);
  }
}

/**
 * Trigger effects for a dependency
 * @param {Object} target - The reactive object
 * @param {string} key - The property key
 * @param {string} type - The trigger type ('set', 'add', 'delete')
 */
export function trigger(target, key, type = 'set') {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;

  const effects = new Set();
  const computedEffects = new Set();

  const addEffects = (dep) => {
    if (dep) {
      dep.forEach(effect => {
        if (effect !== activeEffect) {
          if (effect.options.computed) {
            computedEffects.add(effect);
          } else {
            effects.add(effect);
          }
        }
      });
    }
  };

  addEffects(depsMap.get(key));

  // Handle array length changes
  if (type === 'add' && Array.isArray(target)) {
    addEffects(depsMap.get('length'));
  }

  // Handle array index changes
  if (key === 'length' && Array.isArray(target)) {
    depsMap.forEach((dep, k) => {
      if (k >= target.length) {
        addEffects(dep);
      }
    });
  }

  // Run computed effects first
  computedEffects.forEach(effect => {
    if (effect.options.scheduler) {
      effect.options.scheduler(effect);
    } else {
      effect();
    }
  });

  // Then run regular effects
  effects.forEach(effect => {
    if (effect.options.scheduler) {
      effect.options.scheduler(effect);
    } else {
      effect();
    }
  });
}

// Proxy handlers for reactive objects
const reactiveHandlers = {
  get(target, key, receiver) {
    if (key === '__isReactive') return true;
    if (key === '__raw') return target;

    const result = Reflect.get(target, key, receiver);
    
    // Track the dependency
    track(target, key);

    // Recursively make nested objects reactive
    if (result !== null && typeof result === 'object') {
      return reactive(result);
    }

    return result;
  },

  set(target, key, value, receiver) {
    const oldValue = target[key];
    const hadKey = Array.isArray(target) 
      ? Number(key) < target.length 
      : Object.prototype.hasOwnProperty.call(target, key);

    const result = Reflect.set(target, key, value, receiver);

    if (!hadKey) {
      trigger(target, key, 'add');
    } else if (value !== oldValue && (value === value || oldValue === oldValue)) {
      trigger(target, key, 'set');
    }

    return result;
  },

  deleteProperty(target, key) {
    const hadKey = Object.prototype.hasOwnProperty.call(target, key);
    const result = Reflect.deleteProperty(target, key);

    if (hadKey && result) {
      trigger(target, key, 'delete');
    }

    return result;
  },

  has(target, key) {
    track(target, key);
    return Reflect.has(target, key);
  },

  ownKeys(target) {
    track(target, Array.isArray(target) ? 'length' : Symbol.for('iterate'));
    return Reflect.ownKeys(target);
  }
};

// Cache for reactive proxies
const reactiveMap = new WeakMap();

/**
 * Creates a reactive proxy for an object
 * @param {Object} target - The object to make reactive
 * @returns {Proxy} - The reactive proxy
 */
export function reactive(target) {
  if (target === null || typeof target !== 'object') {
    return target;
  }

  // Return existing proxy if already reactive
  if (target.__isReactive) {
    return target;
  }

  // Check cache
  const existingProxy = reactiveMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }

  const proxy = new Proxy(target, reactiveHandlers);
  reactiveMap.set(target, proxy);

  return proxy;
}

/**
 * Creates a ref (reactive reference to a single value)
 * @param {*} value - The initial value
 * @returns {Object} - The ref object
 */
export function ref(value) {
  const refObject = {
    __isRef: true,
    get value() {
      track(refObject, 'value');
      return value;
    },
    set value(newValue) {
      if (newValue !== value) {
        value = newValue;
        trigger(refObject, 'value');
      }
    }
  };
  return refObject;
}

/**
 * Unwraps a ref to get its value
 * @param {*} ref - The ref or value
 * @returns {*} - The unwrapped value
 */
export function unref(ref) {
  return ref?.__isRef ? ref.value : ref;
}

/**
 * Checks if a value is a ref
 * @param {*} value - The value to check
 * @returns {boolean}
 */
export function isRef(value) {
  return value?.__isRef === true;
}

/**
 * Checks if a value is reactive
 * @param {*} value - The value to check
 * @returns {boolean}
 */
export function isReactive(value) {
  return value?.__isReactive === true;
}

/**
 * Gets the raw (non-reactive) object
 * @param {*} observed - The reactive object
 * @returns {*} - The raw object
 */
export function toRaw(observed) {
  return observed?.__raw || observed;
}

/**
 * Creates a computed reactive value
 * @param {Function|Object} getterOrOptions - Getter function or options object
 * @returns {Object} - The computed ref
 */
export function computed(getterOrOptions) {
  let getter, setter;

  if (typeof getterOrOptions === 'function') {
    getter = getterOrOptions;
    setter = () => {
      console.warn('Computed property is readonly');
    };
  } else {
    getter = getterOrOptions.get;
    setter = getterOrOptions.set;
  }

  let value;
  let dirty = true;

  const effectFn = effect(getter, {
    lazy: true,
    computed: true,
    scheduler: () => {
      if (!dirty) {
        dirty = true;
        trigger(computedRef, 'value');
      }
    }
  });

  const computedRef = {
    __isRef: true,
    __isComputed: true,
    get value() {
      if (dirty) {
        value = effectFn();
        dirty = false;
      }
      track(computedRef, 'value');
      return value;
    },
    set value(newValue) {
      setter(newValue);
    }
  };

  return computedRef;
}

/**
 * Watch a reactive source and run a callback when it changes
 * @param {Function|Object} source - The source to watch
 * @param {Function} callback - The callback function
 * @param {Object} options - Watch options
 * @returns {Function} - Stop function
 */
export function watch(source, callback, options = {}) {
  let getter;
  let oldValue;
  let cleanup;

  const onCleanup = (fn) => {
    cleanup = fn;
  };

  if (typeof source === 'function') {
    getter = source;
  } else if (isRef(source)) {
    getter = () => source.value;
  } else if (isReactive(source)) {
    getter = () => traverse(source);
  } else if (Array.isArray(source)) {
    getter = () => source.map(s => {
      if (isRef(s)) return s.value;
      if (isReactive(s)) return traverse(s);
      if (typeof s === 'function') return s();
      return s;
    });
  } else {
    getter = () => source;
  }

  const job = () => {
    if (cleanup) {
      cleanup();
    }
    const newValue = effectFn();
    if (options.deep || newValue !== oldValue || 
        (typeof newValue === 'object' && newValue !== null)) {
      callback(newValue, oldValue, onCleanup);
      oldValue = newValue;
    }
  };

  const effectFn = effect(getter, {
    lazy: true,
    scheduler: () => {
      if (options.flush === 'sync') {
        job();
      } else if (options.flush === 'post') {
        Promise.resolve().then(() => queueMicrotask(job));
      } else {
        queueMicrotask(job);
      }
    }
  });

  if (options.immediate) {
    job();
  } else {
    oldValue = effectFn();
  }

  return () => {
    stop(effectFn);
    if (cleanup) cleanup();
  };
}

/**
 * Traverse an object to track all properties
 * @param {*} value - The value to traverse
 * @param {Set} seen - Set of seen objects (for circular reference detection)
 * @returns {*}
 */
function traverse(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach(v => traverse(v, seen));
  } else {
    Object.keys(value).forEach(key => traverse(value[key], seen));
  }

  return value;
}

/**
 * Batch multiple reactive updates
 * @param {Function} fn - Function containing updates
 */
let isBatching = false;
const batchQueue = new Set();

export function batch(fn) {
  isBatching = true;
  try {
    fn();
  } finally {
    isBatching = false;
    batchQueue.forEach(effect => effect());
    batchQueue.clear();
  }
}

export default {
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
};
