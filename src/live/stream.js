/**
 * MonkeysJS Live — Streaming Handler
 *
 * Handles SSE (Server-Sent Events) and chunked responses for
 * real-time content streaming. This is the client-side counterpart
 * of the `Streams` PHP concern.
 *
 * Used primarily for AI/LLM token streaming via Apex integration.
 *
 * @module monkeysjs/live/stream
 */

/**
 * Stream client for SSE connections.
 */
export class StreamClient {
  /**
   * @param {string} endpoint The SSE endpoint URL.
   * @param {object} [options] Stream options.
   */
  constructor(endpoint, options = {}) {
    /** @type {string} */
    this.endpoint = endpoint;

    /** @type {EventSource|null} */
    this.source = null;

    /** @type {boolean} */
    this.connected = false;

    /** @type {number} Reconnection delay in ms. */
    this.reconnectDelay = options.reconnectDelay || 1000;

    /** @type {number} Max reconnection attempts. */
    this.maxReconnects = options.maxReconnects || 5;

    /** @type {number} Current reconnection attempt. */
    this.reconnectAttempts = 0;

    /** @type {Map<string, Function[]>} Event listeners. */
    this.listeners = new Map();
  }

  /**
   * Connect to the SSE endpoint.
   *
   * @param {string} componentId The component to stream to.
   * @param {string} target The stream target name.
   * @returns {StreamClient}
   */
  connect(componentId, target) {
    const url = `${this.endpoint}?component=${encodeURIComponent(componentId)}&target=${encodeURIComponent(target)}`;

    this.source = new EventSource(url);

    this.source.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this._emit('open', { componentId, target });
    };

    this.source.onmessage = (event) => {
      this._emit('chunk', {
        componentId,
        target,
        content: event.data,
      });
    };

    this.source.addEventListener('done', () => {
      this._emit('done', { componentId, target });
      this.disconnect();
    });

    this.source.onerror = (error) => {
      this.connected = false;
      this._emit('error', { componentId, target, error });

      if (this.reconnectAttempts < this.maxReconnects) {
        this.reconnectAttempts++;
        setTimeout(() => this.connect(componentId, target), this.reconnectDelay);
      } else {
        this._emit('failed', { componentId, target });
        this.disconnect();
      }
    };

    return this;
  }

  /**
   * Disconnect from the SSE endpoint.
   */
  disconnect() {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    this.connected = false;
  }

  /**
   * Register an event listener.
   *
   * @param {string} event Event name ('chunk', 'done', 'error', 'open', 'failed').
   * @param {Function} callback
   * @returns {StreamClient}
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return this;
  }

  /**
   * Remove an event listener.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    const cbs = this.listeners.get(event);
    if (cbs) {
      const idx = cbs.indexOf(callback);
      if (idx !== -1) cbs.splice(idx, 1);
    }
  }

  /**
   * Emit an event to registered listeners.
   * @param {string} event
   * @param {object} data
   */
  _emit(event, data) {
    const cbs = this.listeners.get(event) || [];
    for (const cb of cbs) {
      try {
        cb(data);
      } catch (e) {
        console.error(`[ML Live Stream] Error in ${event} listener:`, e);
      }
    }
  }
}

/**
 * Create a fetch-based stream for chunked responses.
 *
 * Uses the Fetch API with ReadableStream for environments where
 * SSE is not suitable (e.g., POST-based streaming).
 *
 * @param {string} url The endpoint URL.
 * @param {object} body The request body.
 * @param {Function} onChunk Called with each text chunk.
 * @param {Function} [onDone] Called when the stream completes.
 * @returns {Promise<void>}
 */
export async function fetchStream(url, body, onChunk, onDone) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Stream failed: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      onChunk(text);
    }
  } finally {
    reader.releaseLock();
  }

  if (onDone) onDone();
}
