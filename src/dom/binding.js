/**
 * MonkeysJS - DOM Binding System
 * Declarative DOM binding with custom directives
 */

import { reactive, effect, stop, ref, isRef, watch } from '../core/reactive.js';
import { useFetch, RequestState } from '../http/client.js';

// Directive registry
const directives = new Map();

// Component registry
const components = new Map();

// Prefix for directives (m- by default)
let directivePrefix = 'm-';

// Store for app instances
const apps = new Map();

/**
 * Set directive prefix
 */
export function setPrefix(prefix) {
  directivePrefix = prefix;
}

/**
 * Register a custom directive
 */
export function directive(name, handler) {
  directives.set(name, handler);
}

/**
 * Register a component
 */
export function component(name, definition) {
  components.set(name, definition);
}

/**
 * Evaluate expression in context
 */
/**
 * Evaluate expression in context
 */
function evaluate(expression, context, element) {
  try {
    // Add $dispatch to context scope if not present or bound to element
    const dispatch = (name, detail = {}) => {
        const event = new CustomEvent(name, {
            detail,
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(event);
    };

    const fn = new Function(
      '$data', '$el', '$refs', '$event', '$dispatch', '$watch',
      `with($data) { return ${expression} }`
    );
    return fn(
        context.$data, 
        element, 
        context.$refs, 
        context.$event, 
        dispatch,
        context.$watch
    );
  } catch (error) {
    console.warn(`MonkeysJS: Error evaluating "${expression}":`, error);
    return undefined;
  }
}

/**
 * Execute statement in context
 */
function execute(statement, context, element, event) {
  try {
    const dispatch = (name, detail = {}) => {
        const evt = new CustomEvent(name, {
            detail,
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(evt);
    };

    const fn = new Function(
      '$data', '$el', '$refs', '$event', '$dispatch', '$watch',
      `with($data) { ${statement} }`
    );
    return fn(
        context.$data, 
        element, 
        context.$refs, 
        event, 
        dispatch,
        context.$watch
    );
  } catch (error) {
    console.warn(`MonkeysJS: Error executing "${statement}":`, error);
  }
}

/**
 * Built-in directives
 */

// m-data: Initialize reactive data
directive('data', {
  init(el, expression, context) {
    const data = expression ? evaluate(expression, context, el) : {};
    context.$data = reactive({ ...context.$data, ...data });
  }
});

// m-text: Set text content
directive('text', {
  effect(el, expression, context) {
    const value = evaluate(expression, context, el);
    el.textContent = value ?? '';
  }
});

// m-html: Set inner HTML
directive('html', {
  effect(el, expression, context) {
    const value = evaluate(expression, context, el);
    el.innerHTML = value ?? '';
  }
});

// m-show: Toggle visibility
directive('show', {
  effect(el, expression, context) {
    const value = evaluate(expression, context, el);
    el.style.display = value ? '' : 'none';
  }
});

// m-if: Conditional rendering
directive('if', {
  init(el, expression, context) {
    const placeholder = document.createComment('m-if');
    const template = el.cloneNode(true);
    el.parentNode.insertBefore(placeholder, el);
    el.remove();

    context._ifState = { placeholder, template, currentEl: null };
  },
  effect(el, expression, context) {
    const value = evaluate(expression, context, el);
    const { placeholder, template, currentEl } = context._ifState;

    if (value && !currentEl) {
      const newEl = template.cloneNode(true);
      newEl.removeAttribute(`${directivePrefix}if`);
      placeholder.parentNode.insertBefore(newEl, placeholder.nextSibling);
      context._ifState.currentEl = newEl;
      processElement(newEl, context);
    } else if (!value && currentEl) {
      currentEl.remove();
      context._ifState.currentEl = null;
    }
  }
});

// m-for: List rendering
directive('for', {
  init(el, expression, context) {
    const placeholder = document.createComment('m-for');
    const template = el.cloneNode(true);
    template.removeAttribute(`${directivePrefix}for`);
    el.parentNode.insertBefore(placeholder, el);
    el.remove();

    // Parse expression: "item in items" or "(item, index) in items"
    const match = expression.match(/^\s*(?:\(([^,]+),\s*([^)]+)\)|([^\s]+))\s+(?:in|of)\s+(.+)\s*$/);
    if (!match) {
      console.warn(`MonkeysJS: Invalid m-for expression: ${expression}`);
      return;
    }

    const itemName = match[3] || match[1];
    const indexName = match[2] || 'index';
    const listExpression = match[4];

    context._forState = { 
      placeholder, 
      template, 
      elements: [], 
      itemName, 
      indexName, 
      listExpression 
    };
  },
  effect(el, expression, context) {
    const { placeholder, template, elements, itemName, indexName, listExpression } = context._forState;
    const list = evaluate(listExpression, context, el) || [];

    // Remove old elements
    elements.forEach(e => e.remove());
    elements.length = 0;

    // Create new elements
    list.forEach((item, index) => {
      const newEl = template.cloneNode(true);
      const itemContext = createContext({
        ...context.$data,
        [itemName]: item,
        [indexName]: index
      }, context.$refs);

      placeholder.parentNode.insertBefore(newEl, placeholder);
      elements.push(newEl);
      processElement(newEl, itemContext);
    });
  }
});

// m-bind / m-: Bind attributes
directive('bind', {
  effect(el, expression, context, modifiers, attrName) {
    if (!attrName) {
      // Bind multiple attributes
      const attrs = evaluate(expression, context, el);
      if (attrs && typeof attrs === 'object') {
        Object.entries(attrs).forEach(([key, value]) => {
          setAttribute(el, key, value);
        });
      }
    } else {
      const value = evaluate(expression, context, el);
      setAttribute(el, attrName, value);
    }
  }
});

// m-on / @: Event binding
directive('on', {
  init(el, expression, context, modifiers, eventName) {
    if (!eventName) return;

    const handler = (event) => {
      // Handle modifiers
      if (modifiers.includes('prevent')) event.preventDefault();
      if (modifiers.includes('stop')) event.stopPropagation();
      if (modifiers.includes('self') && event.target !== el) return;
      if (modifiers.includes('once')) el.removeEventListener(eventName, handler);

      // Key modifiers
      if (event instanceof KeyboardEvent) {
        const keyModifiers = ['enter', 'tab', 'delete', 'esc', 'space', 'up', 'down', 'left', 'right'];
        const pressedKey = event.key.toLowerCase();
        
        for (const mod of modifiers) {
          if (keyModifiers.includes(mod)) {
            const keyMap = {
              enter: 'enter',
              tab: 'tab',
              delete: 'delete',
              esc: 'escape',
              space: ' ',
              up: 'arrowup',
              down: 'arrowdown',
              left: 'arrowleft',
              right: 'arrowright'
            };
            if (pressedKey !== keyMap[mod]) return;
          }
        }
      }

      context.$event = event;
      execute(expression, context, el, event);
    };

    const eventOptions = {
      capture: modifiers.includes('capture'),
      passive: modifiers.includes('passive'),
      once: modifiers.includes('once')
    };

    // Handle window/document modifiers
    if (modifiers.includes('window')) {
      window.addEventListener(eventName, handler, eventOptions);
    } else if (modifiers.includes('document')) {
      document.addEventListener(eventName, handler, eventOptions);
    } else {
      el.addEventListener(eventName, handler, eventOptions);
    }
  }
});

// m-model: Two-way binding
directive('model', {
  init(el, expression, context, modifiers) {
    const isCheckbox = el.type === 'checkbox';
    const isRadio = el.type === 'radio';
    const isSelect = el.tagName === 'SELECT';
    const isMultiSelect = isSelect && el.multiple;

    const event = modifiers.includes('lazy') ? 'change' : 'input';

    el.addEventListener(event, (e) => {
      let value;

      if (isCheckbox) {
        const currentValue = evaluate(expression, context, el);
        if (Array.isArray(currentValue)) {
          value = el.checked 
            ? [...currentValue, el.value]
            : currentValue.filter(v => v !== el.value);
        } else {
          value = el.checked;
        }
      } else if (isRadio) {
        value = el.value;
      } else if (isMultiSelect) {
        value = Array.from(el.selectedOptions).map(o => o.value);
      } else {
        value = el.value;
        
        // Type modifiers
        if (modifiers.includes('number')) {
          value = parseFloat(value) || 0;
        } else if (modifiers.includes('trim')) {
          value = value.trim();
        }
      }

      // Set value using Function constructor
      try {
        const setter = new Function('$data', 'value', `with($data) { ${expression} = value }`);
        setter(context.$data, value);
      } catch (error) {
        console.warn(`MonkeysJS: Error setting model "${expression}":`, error);
      }
    });
  },
  effect(el, expression, context, modifiers) {
    const value = evaluate(expression, context, el);
    const isCheckbox = el.type === 'checkbox';
    const isRadio = el.type === 'radio';
    const isSelect = el.tagName === 'SELECT';

    if (isCheckbox) {
      if (Array.isArray(value)) {
        el.checked = value.includes(el.value);
      } else {
        el.checked = !!value;
      }
    } else if (isRadio) {
      el.checked = el.value === value;
    } else if (isSelect) {
      // Handle select after options are populated
      requestAnimationFrame(() => {
        if (el.multiple && Array.isArray(value)) {
          Array.from(el.options).forEach(o => {
            o.selected = value.includes(o.value);
          });
        } else {
          el.value = value ?? '';
        }
      });
    } else {
      el.value = value ?? '';
    }
  }
});

// m-ref: Element reference
directive('ref', {
  init(el, expression, context) {
    context.$refs[expression] = el;
  }
});

// m-cloak: Hide until processed
directive('cloak', {
  init(el) {
    el.removeAttribute(`${directivePrefix}cloak`);
  }
});

// m-fetch: Declarative fetch
directive('fetch', {
  init(el, expression, context, modifiers) {
    const url = evaluate(expression, context, el);
    const method = modifiers[0]?.toUpperCase() || 'GET';
    
    const fetchState = useFetch(url, { method, immediate: false });
    
    context.$fetch = fetchState;
    context.$data.$loading = fetchState.isLoading;
    context.$data.$error = fetchState.error;
    context.$data.$data = fetchState.data;
  },
  effect(el, expression, context) {
    const url = evaluate(expression, context, el);
    if (url && context.$fetch) {
      context.$fetch.execute({ url });
    }
  }
});

// m-class: Class binding
directive('class', {
  effect(el, expression, context) {
    const value = evaluate(expression, context, el);
    
    if (typeof value === 'string') {
      el.className = value;
    } else if (Array.isArray(value)) {
      el.className = value.filter(Boolean).join(' ');
    } else if (typeof value === 'object') {
      Object.entries(value).forEach(([className, condition]) => {
        el.classList.toggle(className, !!condition);
      });
    }
  }
});

// m-style: Style binding
directive('style', {
  effect(el, expression, context) {
    const value = evaluate(expression, context, el);
    
    if (typeof value === 'string') {
      el.style.cssText = value;
    } else if (typeof value === 'object') {
      Object.entries(value).forEach(([prop, val]) => {
        if (prop.startsWith('--')) {
          el.style.setProperty(prop, val);
        } else {
          el.style[prop] = val;
        }
      });
    }
  }
});

// m-transition: Transition helpers
directive('transition', {
  init(el, expression, context) {
    const name = expression || 'fade';
    el.dataset.transition = name;
    
    // Add transition classes
    context._transition = {
      enter: `${name}-enter`,
      enterActive: `${name}-enter-active`,
      enterTo: `${name}-enter-to`,
      leave: `${name}-leave`,
      leaveActive: `${name}-leave-active`,
      leaveTo: `${name}-leave-to`
    };
  }
});

// m-teleport: Render content to another location in the DOM
directive('teleport', {
  init(el, expression, context) {
    const target = document.querySelector(expression);
    if (!target) {
      console.warn(`MonkeysJS: Teleport target "${expression}" not found`);
      return;
    }
    
    const placeholder = document.createComment('m-teleport');
    el.parentNode.insertBefore(placeholder, el);
    target.appendChild(el);
    
    context._teleportState = { placeholder, target, originalParent: placeholder.parentNode };
  }
});

// m-lazy: Lazy load content when element enters viewport
directive('lazy', {
  init(el, expression, context) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          context.$data.$lazy = true;
          el.classList.add('m-lazy-loaded');
          observer.unobserve(el);
          
          // Execute callback if provided
          if (expression) {
            execute(expression, context, el);
          }
        }
      });
    }, { threshold: 0.1 });
    
    context.$data.$lazy = false;
    observer.observe(el);
    context._lazyObserver = observer;
  }
});

// m-intersect: Run code when element intersects viewport
directive('intersect', {
  init(el, expression, context, modifiers) {
    const once = modifiers.includes('once');
    const threshold = modifiers.find(m => !isNaN(m)) || 0;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        context.$data.$visible = entry.isIntersecting;
        context.$data.$intersectionRatio = entry.intersectionRatio;
        
        if (entry.isIntersecting) {
          execute(expression, context, el);
          if (once) observer.unobserve(el);
        }
      });
    }, { threshold: parseFloat(threshold) });
    
    observer.observe(el);
  }
});

// m-debounce: Debounced event handling
directive('debounce', {
  init(el, expression, context, modifiers, eventName) {
    const delay = parseInt(modifiers[0]) || 300;
    let timeoutId = null;
    
    el.addEventListener(eventName || 'input', (event) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        context.$event = event;
        execute(expression, context, el, event);
      }, delay);
    });
  }
});

// m-throttle: Throttled event handling  
directive('throttle', {
  init(el, expression, context, modifiers, eventName) {
    const limit = parseInt(modifiers[0]) || 300;
    let inThrottle = false;
    
    el.addEventListener(eventName || 'scroll', (event) => {
      if (!inThrottle) {
        context.$event = event;
        execute(expression, context, el, event);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    });
  }
});

// m-clipboard: Copy to clipboard
directive('clipboard', {
  init(el, expression, context, modifiers) {
    el.addEventListener('click', async () => {
      const text = evaluate(expression, context, el);
      try {
        await navigator.clipboard.writeText(text);
        el.classList.add('m-clipboard-success');
        context.$data.$copied = true;
        
        setTimeout(() => {
          el.classList.remove('m-clipboard-success');
          context.$data.$copied = false;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
        context.$data.$copied = false;
      }
    });
  }
});

// m-portal: Alias for teleport with better semantics
directive('portal', directives.get('teleport'));

// m-animate: CSS animation trigger
directive('animate', {
  init(el, expression, context, modifiers) {
    const animationClass = expression || 'animate';
    const trigger = modifiers[0] || 'load'; // load, hover, click, visible
    
    const runAnimation = () => {
      el.classList.add(animationClass);
      el.addEventListener('animationend', () => {
        if (!modifiers.includes('keep')) {
          el.classList.remove(animationClass);
        }
      }, { once: true });
    };
    
    switch (trigger) {
      case 'load':
        runAnimation();
        break;
      case 'hover':
        el.addEventListener('mouseenter', runAnimation);
        break;
      case 'click':
        el.addEventListener('click', runAnimation);
        break;
      case 'visible':
        const observer = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            runAnimation();
            observer.unobserve(el);
          }
        });
        observer.observe(el);
        break;
    }
  }
});

// m-hotkey: Keyboard shortcut binding
directive('hotkey', {
  init(el, expression, context, modifiers) {
    const keys = modifiers.join('+').toLowerCase();
    
    const handler = (event) => {
      const pressed = [];
      if (event.ctrlKey || event.metaKey) pressed.push('ctrl');
      if (event.shiftKey) pressed.push('shift');
      if (event.altKey) pressed.push('alt');
      pressed.push(event.key.toLowerCase());
      
      if (pressed.join('+') === keys) {
        event.preventDefault();
        execute(expression, context, el, event);
      }
    };
    
    document.addEventListener('keydown', handler);
    context._hotkeyHandler = handler;
  }
});

// m-persist: Persist reactive data to storage
directive('persist', {
  init(el, expression, context, modifiers) {
    const storageKey = expression || 'm-persist-' + Math.random().toString(36).slice(2);
    const storage = modifiers.includes('session') ? sessionStorage : localStorage;
    
    // Load initial value
    try {
      const stored = storage.getItem(storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        Object.assign(context.$data, data);
      }
    } catch (e) {}
    
    // Watch for changes and persist
    const keys = modifiers.filter(m => m !== 'session' && m !== 'local');
    const watchKeys = keys.length > 0 ? keys : Object.keys(context.$data);
    
    effect(() => {
      const toSave = {};
      watchKeys.forEach(key => {
        if (key in context.$data) {
          toSave[key] = context.$data[key];
        }
      });
      storage.setItem(storageKey, JSON.stringify(toSave));
    });
  }
});

/**
 * Set attribute helper
 */
function setAttribute(el, name, value) {
  if (name === 'class') {
    if (typeof value === 'object' && !Array.isArray(value)) {
      Object.entries(value).forEach(([className, condition]) => {
        el.classList.toggle(className, !!condition);
      });
    } else {
      el.className = Array.isArray(value) ? value.join(' ') : value;
    }
  } else if (name === 'style') {
    if (typeof value === 'object') {
      Object.assign(el.style, value);
    } else {
      el.style.cssText = value;
    }
  } else if (name.startsWith('data-')) {
    el.dataset[name.slice(5)] = value;
  } else if (value === true) {
    el.setAttribute(name, '');
  } else if (value === false || value === null || value === undefined) {
    el.removeAttribute(name);
  } else {
    el.setAttribute(name, value);
  }
}

// m-mask: Input masking
directive('mask', {
  init(el, expression, context) {
    if (el.tagName !== 'INPUT') return;
    
    // Simple mask implementation (can be expanded)
    // 9: numeric, a: alpha, *: alphanumeric
    const pattern = expression;
    
    const format = (value) => {
      let vIndex = 0;
      let output = '';
      
      for (let pIndex = 0; pIndex < pattern.length; pIndex++) {
        const pChar = pattern[pIndex];
        
        // Static character in mask
        if (!['9', 'a', '*'].includes(pChar)) {
             output += pChar;
             if (value[vIndex] === pChar) vIndex++; // consume if matches literal
             continue;
        }

        // Placeholder: search for next valid char in input
        let found = false;
        while (vIndex < value.length) {
            const vChar = value[vIndex];
            vIndex++;

            if (
                (pChar === '9' && /\d/.test(vChar)) ||
                (pChar === 'a' && /[a-zA-Z]/.test(vChar)) ||
                (pChar === '*' && /[a-zA-Z0-9]/.test(vChar))
            ) {
                output += vChar;
                found = true;
                break;
            }
        }
        
        if (!found) break; // Running out of matching input
      }
      return output;
    };

    el.addEventListener('input', (e) => {
      const input = e.target;
      // Get only raw value for re-formatting? 
      // Actually typical mask behavior is re-evaluating the whole string.
      // But preserving user cursor is hard. 
      // For this "Simple" implementation, let's just format the current value.
      
      const originalValue = input.value;
      const formatted = format(originalValue);
      
      if (formatted !== originalValue) {
        input.value = formatted;
        // Dispatch input event to update model if bound
        input.dispatchEvent(new Event('input', { bubbles: true })); 
      }
    });
  }
});

// m-effect: Run side effects
directive('effect', {
  effect(el, expression, context) {
    execute(expression, context, el);
  }
});

/**
 * Create context object
 */
function createContext(data = {}, refs = {}) {
  const context = {
    $data: reactive(data),
    $refs: refs,
    $event: null,
    $fetch: null
  };

  // Add magic properties
  context.$dispatch = (event, detail = {}) => {
    // Find the current element processing this? 
    // We don't have reference to 'el' here easily unless passed.
    // So we'll attach it to the element in evaluate/execute
  };
  
  context.$watch = (source, callback, options) => {
    return watch(source, callback, options);
  };

  return context;
}

/**
 * Parse directive from attribute
 */
function parseDirective(attr) {
  const name = attr.name;
  
  // Short syntaxes
  if (name.startsWith('@')) {
    return {
      name: 'on',
      arg: name.slice(1).split('.')[0],
      modifiers: name.slice(1).split('.').slice(1),
      expression: attr.value
    };
  }
  
  if (name.startsWith(':')) {
    return {
      name: 'bind',
      arg: name.slice(1).split('.')[0],
      modifiers: name.slice(1).split('.').slice(1),
      expression: attr.value
    };
  }

  if (!name.startsWith(directivePrefix)) return null;

  const fullName = name.slice(directivePrefix.length);
  const [nameWithArg, ...modifiers] = fullName.split('.');
  const [directiveName, arg] = nameWithArg.split(':');

  return {
    name: directiveName,
    arg,
    modifiers,
    expression: attr.value
  };
}

/**
 * Process a single element
 */
function processElement(el, context) {
  if (el.nodeType !== Node.ELEMENT_NODE) return;

  const attrs = Array.from(el.attributes);
  const effects = [];

  // Priority directives (structural)
  const structuralDirectives = ['if', 'for'];
  
  for (const name of structuralDirectives) {
    const attrName = `${directivePrefix}${name}`;
    const attr = attrs.find(a => a.name === attrName);
    
    if (attr) {
      const directive = parseDirective(attr);
      if (directive) {
        const handler = directives.get(directive.name);
        if (handler) {
          if (handler.init) {
            handler.init(el, directive.expression, context, directive.modifiers, directive.arg);
          }
          
          if (handler.effect) {
             effect(() => {
              handler.effect(el, directive.expression, context, directive.modifiers, directive.arg);
            });
          }
          
          // Stop processing other directives on this element as it's likely removed/replaced
          return;
        }
      }
    }
  }

  // First pass: init directives
  for (const attr of attrs) {
    const directive = parseDirective(attr);
    if (!directive) continue;
    
    // Skip structural directives as they are already handled
    if (structuralDirectives.includes(directive.name)) continue;

    const handler = directives.get(directive.name);
    if (!handler) {
      // Don't warn for unknown directives, might be standard attributes
      continue;
    }

    if (handler.init) {
      handler.init(el, directive.expression, context, directive.modifiers, directive.arg);
    }

    if (handler.effect) {
      effects.push({ handler, directive });
    }

    // Remove directive attribute
    el.removeAttribute(attr.name);
  }

  // Second pass: setup reactive effects
  for (const { handler, directive } of effects) {
    effect(() => {
      handler.effect(el, directive.expression, context, directive.modifiers, directive.arg);
    });
  }

  // Process children
  Array.from(el.children).forEach(child => {
    processElement(child, context);
  });
}

/**
 * Create app instance
 */
export function createApp(rootData = {}) {
  let rootElement = null;
  let rootContext = null;
  const plugins = [];

  const app = {
    // Register directive
    directive(name, handler) {
      directives.set(name, handler);
      return app;
    },

    // Register component
    component(name, definition) {
      components.set(name, definition);
      return app;
    },

    // Use plugin
    use(plugin, options) {
      if (typeof plugin.install === 'function') {
        plugin.install(app, options);
      } else if (typeof plugin === 'function') {
        plugin(app, options);
      }
      plugins.push(plugin);
      return app;
    },

    // Provide value for injection
    provide(key, value) {
      if (!rootContext) {
        rootData[key] = value;
      } else {
        rootContext.$data[key] = value;
      }
      return app;
    },

    // Mount app
    mount(selector) {
      rootElement = typeof selector === 'string' 
        ? document.querySelector(selector) 
        : selector;

      if (!rootElement) {
        console.error(`MonkeysJS: Could not find element "${selector}"`);
        return app;
      }

      // Check for m-data on root element
      const dataAttr = rootElement.getAttribute(`${directivePrefix}data`);
      if (dataAttr) {
        try {
          const evalData = new Function(`return ${dataAttr}`)();
          Object.assign(rootData, evalData);
        } catch {
          // Ignore parse errors
        }
      }

      rootContext = createContext(rootData);
      processElement(rootElement, rootContext);

      apps.set(rootElement, { app, context: rootContext });

      return app;
    },

    // Unmount app
    unmount() {
      if (rootElement) {
        apps.delete(rootElement);
        rootElement = null;
        rootContext = null;
      }
      return app;
    },

    // Get reactive data
    get data() {
      return rootContext?.$data;
    },

    // Get refs
    get refs() {
      return rootContext?.$refs;
    }
  };

  return app;
}

/**
 * Auto-initialize elements with m-data
 */
export function autoInit() {
  document.querySelectorAll(`[${directivePrefix}data]`).forEach(el => {
    if (!apps.has(el)) {
      createApp().mount(el);
    }
  });
}

// Auto-init on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
}

export default {
  createApp,
  directive,
  component,
  setPrefix,
  autoInit
};
