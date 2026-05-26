/**
 * MonkeysJS Live — Directive System
 *
 * Parses and handles `ml:` directives on DOM elements. These directives
 * bind the component's state and actions to the DOM declaratively.
 *
 * Directives: ml:model, ml:click, ml:submit, ml:loading, ml:dirty,
 * ml:poll, ml:offline, ml:online, ml:show, ml:transition, ml:ignore,
 * ml:replace, ml:preserve, ml:stream, ml:target, ml:on:*
 *
 * @module monkeysjs/live/directives
 */

import { parseModifiers, parseDuration, debounce, throttle, findComponentRoot, getComponentId } from './utils.js';

/**
 * Process all `ml:` directives on an element tree.
 *
 * @param {Element} root The root element to scan.
 * @param {object} componentManager The component manager for dispatching.
 */
export function processDirectives(root, componentManager) {
  // Process the root element itself
  processElement(root, componentManager);

  // Process all descendant elements
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode())) {
    processElement(node, componentManager);
  }
}

/**
 * Process `ml:` directives on a single element.
 *
 * @param {Element} el The element to process.
 * @param {object} componentManager The component manager.
 */
function processElement(el, componentManager) {
  const attrs = Array.from(el.attributes);

  for (const attr of attrs) {
    if (!attr.name.startsWith('ml:')) continue;

    const { name, modifiers, eventName } = parseModifiers(attr.name);
    const expression = attr.value;

    const handler = directiveHandlers[name];
    if (handler) {
      handler(el, expression, modifiers, componentManager, eventName);
    } else if (eventName) {
      // Generic event binding (ml:click, ml:submit, ml:keydown, etc.)
      handleEventDirective(el, expression, modifiers, componentManager, eventName);
    } else if (name.startsWith('on:')) {
      // Browser CustomEvent listener: ml:on:custom-event
      handleBrowserEventDirective(el, name.slice(3), expression, componentManager);
    }
  }
}

/**
 * Directive handlers — one per directive name.
 */
const directiveHandlers = {
  /**
   * ml:model — Two-way bind an input to a #[State] property.
   *
   * Modifiers:
   * - .live — sync on every input event (default)
   * - .blur — sync on blur
   * - .lazy — sync on change
   * - .debounce.300ms — debounced live sync
   * - .throttle.500ms — throttled live sync
   */
  model(el, expression, modifiers, componentManager) {
    const componentRoot = findComponentRoot(el);
    if (!componentRoot) return;
    const componentId = getComponentId(componentRoot);

    const isLive = modifiers.includes('live') || (!modifiers.includes('blur') && !modifiers.includes('lazy'));
    const isBlur = modifiers.includes('blur');
    const isLazy = modifiers.includes('lazy');

    // Determine the event to listen for
    let eventType = 'input';
    if (isBlur) eventType = 'blur';
    if (isLazy) eventType = 'change';

    // Build the handler
    let handler = () => {
      let value;
      if (el.type === 'checkbox') {
        value = el.checked;
      } else if (el.type === 'radio') {
        value = el.value;
      } else if (el.tagName === 'SELECT' && el.multiple) {
        value = Array.from(el.selectedOptions).map(o => o.value);
      } else {
        value = el.value;
      }

      // Apply number modifier
      if (modifiers.includes('number')) {
        value = parseFloat(value) || 0;
      }
      if (modifiers.includes('trim') && typeof value === 'string') {
        value = value.trim();
      }

      componentManager.updateProperty(componentId, expression, value);
    };

    // Apply debounce/throttle modifiers
    const debounceIdx = modifiers.indexOf('debounce');
    const throttleIdx = modifiers.indexOf('throttle');

    if (debounceIdx !== -1) {
      const delay = modifiers[debounceIdx + 1] ? parseDuration(modifiers[debounceIdx + 1]) : 300;
      handler = debounce(handler, delay);
    } else if (throttleIdx !== -1) {
      const limit = modifiers[throttleIdx + 1] ? parseDuration(modifiers[throttleIdx + 1]) : 300;
      handler = throttle(handler, limit);
    }

    el.addEventListener(eventType, handler);

    // Mark element for dirty tracking
    el.setAttribute('data-ml-model', expression);
  },

  /**
   * ml:loading — Show/hide during round-trip.
   *
   * Modifiers:
   * - .remove — hide during loading (inverse)
   * - .attr.disabled — set attribute during loading
   * - .class.opacity-50 — add class during loading
   * - .delay.200ms — delayed loading indicator
   */
  loading(el, expression, modifiers, componentManager) {
    const componentRoot = findComponentRoot(el);
    if (!componentRoot) return;
    const componentId = getComponentId(componentRoot);
    const isRemove = modifiers.includes('remove');
    const targetAction = expression || null;

    // Determine delay
    const delayIdx = modifiers.indexOf('delay');
    const delay = delayIdx !== -1 && modifiers[delayIdx + 1]
      ? parseDuration(modifiers[delayIdx + 1])
      : 0;

    // Listen for loading events
    let delayTimer = null;

    document.addEventListener('ml:loading', (e) => {
      if (e.detail.componentId !== componentId) return;
      if (targetAction && e.detail.action !== targetAction) return;

      const isLoading = e.detail.loading;

      if (delay > 0 && isLoading) {
        delayTimer = setTimeout(() => applyLoading(el, isLoading, isRemove, modifiers), delay);
      } else {
        if (delayTimer) { clearTimeout(delayTimer); delayTimer = null; }
        applyLoading(el, isLoading, isRemove, modifiers);
      }
    });
  },

  /**
   * ml:dirty — Reflect unsynced changes.
   */
  dirty(el, expression, modifiers, componentManager) {
    const componentRoot = findComponentRoot(el);
    if (!componentRoot) return;
    const componentId = getComponentId(componentRoot);
    const targetProp = expression || null;

    document.addEventListener('ml:dirty', (e) => {
      if (e.detail.componentId !== componentId) return;
      if (targetProp && e.detail.property !== targetProp) return;

      el.classList.toggle('ml-live-dirty', e.detail.dirty);
    });
  },

  /**
   * ml:poll — Re-render on interval.
   *
   * Modifiers:
   * - .5s — poll every 5 seconds
   * - .keep-alive — continue polling when tab is hidden
   */
  poll(el, expression, modifiers, componentManager) {
    const componentRoot = findComponentRoot(el);
    if (!componentRoot) return;
    const componentId = getComponentId(componentRoot);
    const keepAlive = modifiers.includes('keep-alive');

    // Parse interval from modifiers
    const intervalMod = modifiers.find(m => /^\d/.test(m));
    const interval = intervalMod ? parseDuration(intervalMod) : 2000;

    let timer = setInterval(() => {
      if (!keepAlive && document.hidden) return;
      if (!document.contains(componentRoot)) {
        clearInterval(timer);
        return;
      }
      componentManager.refresh(componentId);
    }, interval);

    // Store timer for cleanup
    el.__mlPollTimer = timer;
  },

  /**
   * ml:offline — Show when offline.
   */
  offline(el) {
    const update = () => {
      el.style.display = navigator.onLine ? 'none' : '';
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
  },

  /**
   * ml:online — Show when online.
   */
  online(el) {
    const update = () => {
      el.style.display = navigator.onLine ? '' : 'none';
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
  },

  /**
   * ml:show — Conditional display based on state.
   */
  show(el, expression) {
    // Expression is evaluated by the server; client just reads the attr
    // This is a server-controlled visibility toggle
  },

  /**
   * ml:transition — CSS enter/leave transitions.
   */
  transition(el, expression, modifiers) {
    const name = expression || 'ml-transition';
    el.dataset.mlTransition = name;
  },

  /**
   * ml:stream — Target for streamed content.
   */
  stream(el, expression) {
    el.dataset.mlStream = expression;
  },
};

/**
 * Handle a generic event directive (ml:click, ml:submit, etc.)
 */
function handleEventDirective(el, expression, modifiers, componentManager, eventName) {
  const componentRoot = findComponentRoot(el);
  if (!componentRoot) return;
  const componentId = getComponentId(componentRoot);

  let handler = (event) => {
    // Apply event modifiers
    if (modifiers.includes('prevent')) event.preventDefault();
    if (modifiers.includes('stop')) event.stopPropagation();
    if (modifiers.includes('self') && event.target !== el) return;

    // Parse action and arguments from expression
    const { method, args } = parseActionExpression(expression);
    componentManager.callAction(componentId, method, args);
  };

  // Debounce/throttle
  const debounceIdx = modifiers.indexOf('debounce');
  const throttleIdx = modifiers.indexOf('throttle');

  if (debounceIdx !== -1) {
    const delay = modifiers[debounceIdx + 1] ? parseDuration(modifiers[debounceIdx + 1]) : 300;
    handler = debounce(handler, delay);
  } else if (throttleIdx !== -1) {
    const limit = modifiers[throttleIdx + 1] ? parseDuration(modifiers[throttleIdx + 1]) : 300;
    handler = throttle(handler, limit);
  }

  // Outside modifier — trigger when clicking outside the element
  if (modifiers.includes('outside')) {
    document.addEventListener(eventName, (event) => {
      if (!el.contains(event.target)) {
        handler(event);
      }
    });
    return;
  }

  // Window modifier
  if (modifiers.includes('window')) {
    window.addEventListener(eventName, handler, { once: modifiers.includes('once') });
    return;
  }

  el.addEventListener(eventName, handler, {
    once: modifiers.includes('once'),
    passive: modifiers.includes('passive'),
    capture: modifiers.includes('capture'),
  });
}

/**
 * Handle browser CustomEvent listener: ml:on:custom-event="method"
 */
function handleBrowserEventDirective(el, eventName, expression, componentManager) {
  el.addEventListener(eventName, (event) => {
    const componentRoot = findComponentRoot(el);
    if (!componentRoot) return;
    const componentId = getComponentId(componentRoot);

    const { method, args } = parseActionExpression(expression);
    componentManager.callAction(componentId, method, [...args, event.detail]);
  });
}

/**
 * Parse an action expression like "increment" or "save(1, 'hello')".
 *
 * @param {string} expression
 * @returns {{ method: string, args: Array }}
 */
function parseActionExpression(expression) {
  const match = expression.match(/^(\w+)(?:\((.+)\))?$/);
  if (!match) return { method: expression, args: [] };

  const method = match[1];
  let args = [];

  if (match[2]) {
    try {
      // Safely parse arguments
      args = Function(`"use strict"; return [${match[2]}]`)();
    } catch (e) {
      args = [match[2]]; // Fallback: treat as a single string arg
    }
  }

  return { method, args };
}

/**
 * Apply loading state to an element.
 */
function applyLoading(el, isLoading, isRemove, modifiers) {
  if (isRemove) {
    el.style.display = isLoading ? 'none' : '';
  } else {
    el.style.display = isLoading ? '' : 'none';
  }

  // Attribute modifier: ml:loading.attr.disabled
  const attrIdx = modifiers.indexOf('attr');
  if (attrIdx !== -1 && modifiers[attrIdx + 1]) {
    const attrName = modifiers[attrIdx + 1];
    if (isLoading) {
      el.setAttribute(attrName, '');
    } else {
      el.removeAttribute(attrName);
    }
  }

  // Class modifier: ml:loading.class.opacity-50
  const classIdx = modifiers.indexOf('class');
  if (classIdx !== -1 && modifiers[classIdx + 1]) {
    el.classList.toggle(modifiers[classIdx + 1], isLoading);
  }

  // Generic loading class on the component root
  const root = findComponentRoot(el);
  if (root) {
    root.classList.toggle('ml-live-loading', isLoading);
  }
}
