/**
 * MonkeysJS Live — Wire Protocol Client
 *
 * Handles communication between the client and the PHP server via
 * the `/_live` endpoint. Batches multiple operations (state updates
 * and action calls) into a single HTTP request.
 *
 * @module monkeysjs/live/wire
 */

import { getCsrfToken, deepEqual } from './utils.js';

/**
 * Wire protocol client for live component communication.
 */
export class Wire {
  /**
   * @param {string} endpoint The server endpoint (default: '/_live').
   */
  constructor(endpoint = '/_live') {
    /** @type {string} */
    this.endpoint = endpoint;

    /** @type {Map<string, { updates: object, calls: Array, snapshot: object }>} */
    this.queue = new Map();

    /** @type {AbortController|null} */
    this.pendingController = null;

    /** @type {number|null} */
    this.flushTimer = null;

    /** @type {number} Batch window in ms. */
    this.batchDelay = 5;

    /** @type {Map<string, Function>} Callbacks indexed by component ID. */
    this.callbacks = new Map();

    /** @type {Map<string, boolean>} Loading state per component. */
    this.loading = new Map();
  }

  /**
   * Queue a state update for a component.
   *
   * @param {string} componentId The component instance ID.
   * @param {string} property The state property name.
   * @param {*} value The new value.
   * @param {object} snapshot The current snapshot.
   */
  queueUpdate(componentId, property, value, snapshot) {
    const entry = this._getOrCreateEntry(componentId, snapshot);
    entry.updates[property] = value;
    this._scheduleFlush();
  }

  /**
   * Queue an action call for a component.
   *
   * @param {string} componentId The component instance ID.
   * @param {string} method The action method name.
   * @param {Array} args The method arguments.
   * @param {object} snapshot The current snapshot.
   */
  queueAction(componentId, method, args, snapshot) {
    const entry = this._getOrCreateEntry(componentId, snapshot);
    entry.calls.push({ method, args });
    this._scheduleFlush();
  }

  /**
   * Register a callback for when a component receives a response.
   *
   * @param {string} componentId
   * @param {Function} callback Called with the wire response data.
   */
  onResponse(componentId, callback) {
    this.callbacks.set(componentId, callback);
  }

  /**
   * Remove a response callback.
   * @param {string} componentId
   */
  offResponse(componentId) {
    this.callbacks.delete(componentId);
  }

  /**
   * Check if a component has a pending request.
   * @param {string} componentId
   * @returns {boolean}
   */
  isLoading(componentId) {
    return this.loading.get(componentId) || false;
  }

  /**
   * Flush all queued operations immediately.
   *
   * Batches all pending updates and action calls for all components
   * into individual requests (one per component).
   *
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const entries = new Map(this.queue);
    this.queue.clear();

    // Send one request per component (batched within that component)
    const promises = [];
    for (const [componentId, entry] of entries) {
      promises.push(this._sendRequest(componentId, entry));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Cancel all pending requests.
   */
  cancel() {
    if (this.pendingController) {
      this.pendingController.abort();
      this.pendingController = null;
    }
    this.queue.clear();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ── Private ───────────────────────────────────────────────

  _getOrCreateEntry(componentId, snapshot) {
    if (!this.queue.has(componentId)) {
      this.queue.set(componentId, {
        updates: {},
        calls: [],
        snapshot: snapshot,
      });
    }
    return this.queue.get(componentId);
  }

  _scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), this.batchDelay);
  }

  /**
   * Send a single component request to the server.
   *
   * @param {string} componentId
   * @param {{ updates: object, calls: Array, snapshot: object }} entry
   * @returns {Promise<void>}
   */
  async _sendRequest(componentId, entry) {
    const controller = new AbortController();
    this.pendingController = controller;
    this.loading.set(componentId, true);

    // Dispatch loading event
    this._dispatchLoadingEvent(componentId, true);

    try {
      const body = {
        component: entry.snapshot.component,
        id: entry.snapshot.id,
        state: entry.snapshot.state,
        checksum: entry.snapshot.checksum,
        meta: entry.snapshot.meta || {},
        updates: entry.updates,
        calls: entry.calls,
      };

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
          'X-ML-Live': '1.0',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // Invoke the component callback
      const callback = this.callbacks.get(componentId);
      if (callback) {
        callback(data);
      }

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error(`[ML Live] Wire error for ${componentId}:`, error);

        // Dispatch error event
        document.dispatchEvent(new CustomEvent('ml:wire-error', {
          detail: { componentId, error: error.message },
        }));
      }
    } finally {
      this.loading.set(componentId, false);
      this._dispatchLoadingEvent(componentId, false);
      if (this.pendingController === controller) {
        this.pendingController = null;
      }
    }
  }

  /**
   * Dispatch a loading state change event.
   * @param {string} componentId
   * @param {boolean} isLoading
   */
  _dispatchLoadingEvent(componentId, isLoading) {
    document.dispatchEvent(new CustomEvent('ml:loading', {
      detail: { componentId, loading: isLoading },
    }));
  }
}
