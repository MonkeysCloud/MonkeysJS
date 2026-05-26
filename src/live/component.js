/**
 * MonkeysJS Live — Component Manager
 *
 * Manages the lifecycle of live components on the client side:
 * hydration from snapshots, state tracking, action dispatch,
 * and DOM morphing after server responses.
 *
 * @module monkeysjs/live/component
 */

import { Wire } from './wire.js';
import { morph } from './morph.js';
import { processDirectives } from './directives.js';
import { deepEqual, findComponentRoot } from './utils.js';

/**
 * Client-side component manager.
 */
export class ComponentManager {
  /**
   * @param {Wire} wire The wire protocol client.
   */
  constructor(wire) {
    /** @type {Wire} */
    this.wire = wire;

    /** @type {Map<string, ComponentInstance>} */
    this.components = new Map();

    /** @type {Set<string>} Component IDs that are initializing. */
    this.initializing = new Set();
  }

  /**
   * Initialize a component from a DOM element with `data-ml-id`.
   *
   * @param {Element} root The component root element.
   */
  mount(root) {
    const id = root.getAttribute('data-ml-id');
    if (!id || this.components.has(id)) return;
    this.initializing.add(id);

    // Parse snapshot from data attribute
    const snapshotJson = root.getAttribute('data-ml-snapshot');
    if (!snapshotJson) {
      console.warn(`[ML Live] No snapshot found for component ${id}`);
      this.initializing.delete(id);
      return;
    }

    let snapshot;
    try {
      snapshot = JSON.parse(snapshotJson);
    } catch (e) {
      console.error(`[ML Live] Invalid snapshot JSON for ${id}:`, e);
      this.initializing.delete(id);
      return;
    }

    // Create component instance
    const instance = new ComponentInstance(id, root, snapshot, this);
    this.components.set(id, instance);

    // Register wire callback
    this.wire.onResponse(id, (data) => instance.handleResponse(data));

    // Process directives on the component tree
    processDirectives(root, this);

    // Handle lazy components
    if (root.hasAttribute('data-ml-lazy')) {
      this._fetchLazy(id, instance);
    }

    this.initializing.delete(id);

    // Dispatch mounted event
    root.dispatchEvent(new CustomEvent('ml:mounted', {
      detail: { componentId: id },
      bubbles: true,
    }));
  }

  /**
   * Destroy a component instance.
   *
   * @param {string} componentId
   */
  destroy(componentId) {
    const instance = this.components.get(componentId);
    if (!instance) return;

    instance.cleanup();
    this.wire.offResponse(componentId);
    this.components.delete(componentId);
  }

  /**
   * Destroy all components.
   */
  destroyAll() {
    for (const [id] of this.components) {
      this.destroy(id);
    }
  }

  /**
   * Update a state property on a component.
   * Called by directives (e.g., ml:model).
   *
   * @param {string} componentId
   * @param {string} property
   * @param {*} value
   */
  updateProperty(componentId, property, value) {
    const instance = this.components.get(componentId);
    if (!instance) return;

    instance.setDirty(property, value);
    this.wire.queueUpdate(componentId, property, value, instance.snapshot);

    // Dispatch dirty event
    document.dispatchEvent(new CustomEvent('ml:dirty', {
      detail: { componentId, property, dirty: true },
    }));
  }

  /**
   * Call an action on a component.
   * Called by directives (e.g., ml:click).
   *
   * @param {string} componentId
   * @param {string} method
   * @param {Array} args
   */
  callAction(componentId, method, args = []) {
    const instance = this.components.get(componentId);
    if (!instance) return;

    // Check for confirm attribute
    const confirmMsg = instance.root.querySelector(
      `[ml\\:click="${method}"]`
    )?.getAttribute('ml:confirm');

    if (confirmMsg && !window.confirm(confirmMsg)) return;

    this.wire.queueAction(componentId, method, args, instance.snapshot);
  }

  /**
   * Force a refresh of a component (no state changes).
   * @param {string} componentId
   */
  refresh(componentId) {
    const instance = this.components.get(componentId);
    if (!instance) return;

    // Send an empty action to trigger re-render
    this.wire.queueAction(componentId, '$refresh', [], instance.snapshot);
  }

  /**
   * Get a component instance by ID.
   * @param {string} componentId
   * @returns {ComponentInstance|undefined}
   */
  get(componentId) {
    return this.components.get(componentId);
  }

  /**
   * Fetch lazy component content.
   * @param {string} id
   * @param {ComponentInstance} instance
   */
  _fetchLazy(id, instance) {
    // Use requestIdleCallback or setTimeout for lazy loading
    const load = () => {
      this.wire.queueAction(id, '$refresh', [], instance.snapshot);
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(load);
    } else {
      setTimeout(load, 100);
    }
  }
}

/**
 * Represents a single live component on the client side.
 */
class ComponentInstance {
  /**
   * @param {string} id The component instance ID.
   * @param {Element} root The component root DOM element.
   * @param {object} snapshot The initial snapshot from the server.
   * @param {ComponentManager} manager The parent component manager.
   */
  constructor(id, root, snapshot, manager) {
    this.id = id;
    this.root = root;
    this.snapshot = snapshot;
    this.manager = manager;

    /** @type {object} The current state. */
    this.state = { ...snapshot.state };

    /** @type {object} Dirty state (unsynced changes). */
    this.dirtyState = {};

    /** @type {boolean} Whether the component is currently loading. */
    this.loading = false;
  }

  /**
   * Handle a wire response from the server.
   *
   * @param {object} data The response data.
   */
  handleResponse(data) {
    // Update snapshot
    if (data.checksum) {
      this.snapshot = {
        component: this.snapshot.component,
        id: data.id,
        state: data.state,
        checksum: data.checksum,
        meta: this.snapshot.meta,
      };
    }

    // Update state
    if (data.state) {
      this.state = { ...data.state };
    }

    // Clear dirty state (server has latest)
    this.dirtyState = {};
    document.dispatchEvent(new CustomEvent('ml:dirty', {
      detail: { componentId: this.id, property: null, dirty: false },
    }));

    // Apply HTML diff
    if (data.type === 'full' && data.html) {
      morph(this.root, data.html, { childrenOnly: true });
      // Re-process directives after morph
      processDirectives(this.root, this.manager);
    } else if (data.type === 'patch' && data.html) {
      morph(this.root, data.html, { childrenOnly: true });
      processDirectives(this.root, this.manager);
    }

    // Handle streamed content
    if (data.effects?.streams) {
      for (const stream of data.effects.streams) {
        this._applyStream(stream);
      }
    }

    // Handle effects
    if (data.effects) {
      this._processEffects(data.effects);
    }

    // Update the snapshot data attribute
    this.root.setAttribute('data-ml-snapshot',
      JSON.stringify(this.snapshot));

    // Remove lazy flag after first load
    this.root.removeAttribute('data-ml-lazy');

    // Dispatch updated event
    this.root.dispatchEvent(new CustomEvent('ml:updated', {
      detail: { componentId: this.id },
      bubbles: true,
    }));
  }

  /**
   * Mark a property as dirty (unsynced).
   * @param {string} property
   * @param {*} value
   */
  setDirty(property, value) {
    this.dirtyState[property] = value;
  }

  /**
   * Clean up resources (timers, observers, etc.)
   */
  cleanup() {
    // Clean up poll timers
    const pollEls = this.root.querySelectorAll('[__mlPollTimer]');
    for (const el of pollEls) {
      if (el.__mlPollTimer) {
        clearInterval(el.__mlPollTimer);
      }
    }

    // Dispatch destroyed event
    this.root.dispatchEvent(new CustomEvent('ml:destroyed', {
      detail: { componentId: this.id },
      bubbles: true,
    }));
  }

  /**
   * Process effects from the wire response.
   * @param {object} effects
   */
  _processEffects(effects) {
    // Browser dispatches
    if (effects.dispatch) {
      for (const d of effects.dispatch) {
        this.root.dispatchEvent(new CustomEvent(d.event, {
          detail: d.detail || {},
          bubbles: true,
        }));
      }
    }

    // Emits (inter-component events)
    if (effects.emits) {
      for (const emit of effects.emits) {
        document.dispatchEvent(new CustomEvent('ml:emit', {
          detail: emit,
        }));
      }
    }

    // Redirect
    if (effects.redirect) {
      window.location.href = effects.redirect.url;
    }

    // Validation errors
    if (effects.errors && Object.keys(effects.errors).length > 0) {
      for (const [field, messages] of Object.entries(effects.errors)) {
        // Find error display elements
        const errorEls = this.root.querySelectorAll(`[data-ml-error="${field}"]`);
        for (const el of errorEls) {
          el.textContent = messages.join(', ');
          el.style.display = '';
        }
      }
    }
  }

  /**
   * Apply streamed content to a target element.
   * @param {object} stream
   */
  _applyStream(stream) {
    const target = this.root.querySelector(`[data-ml-stream="${stream.target}"], [ml\\:stream="${stream.target}"]`);
    if (!target) return;

    if (stream.mode === 'replace') {
      target.innerHTML = stream.content;
    } else {
      // Append mode — add each chunk
      for (const chunk of stream.chunks) {
        target.insertAdjacentHTML('beforeend', chunk);
      }
    }
  }
}
