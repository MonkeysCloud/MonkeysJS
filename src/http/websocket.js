/**
 * MonkeysJS - WebSocket Client
 * Full-featured WebSocket with auto-reconnect, heartbeat, and reactive state
 */

import { reactive, ref } from '../core/reactive.js';

// Connection states
export const WebSocketState = {
  CONNECTING: 'connecting',
  OPEN: 'open',
  CLOSING: 'closing',
  CLOSED: 'closed'
};

// Default options
const defaultOptions = {
  reconnect: true,
  reconnectAttempts: Infinity,
  reconnectDelay: 1000,
  reconnectDelayMax: 30000,
  reconnectBackoff: 'exponential',
  heartbeat: false,
  heartbeatInterval: 30000,
  heartbeatMessage: 'ping',
  heartbeatTimeout: 10000,
  protocols: [],
  immediate: true
};

/**
 * Creates a reactive WebSocket connection
 */
export function useWebSocket(url, options = {}) {
  const config = { ...defaultOptions, ...options };
  
  // Reactive state
  const status = ref(WebSocketState.CLOSED);
  const data = ref(null);
  const error = ref(null);
  const lastMessage = ref(null);
  const lastMessageTime = ref(null);
  const reconnectCount = ref(0);

  // Refs
  const ws = ref(null);
  const heartbeatTimer = ref(null);
  const heartbeatTimeoutTimer = ref(null);
  const reconnectTimer = ref(null);
  const manualClose = ref(false);
  const messageQueue = ref([]);

  // Event handlers
  const eventHandlers = {
    open: new Set(),
    message: new Set(),
    error: new Set(),
    close: new Set()
  };

  /**
   * Calculate reconnect delay
   */
  function getReconnectDelay() {
    const { reconnectDelay, reconnectDelayMax, reconnectBackoff } = config;
    let delay;

    if (reconnectBackoff === 'exponential') {
      delay = reconnectDelay * Math.pow(2, reconnectCount.value);
    } else {
      delay = reconnectDelay * (reconnectCount.value + 1);
    }

    return Math.min(delay, reconnectDelayMax);
  }

  /**
   * Start heartbeat
   */
  function startHeartbeat() {
    if (!config.heartbeat) return;

    stopHeartbeat();

    heartbeatTimer.value = setInterval(() => {
      if (ws.value?.readyState === WebSocket.OPEN) {
        send(config.heartbeatMessage);
        
        // Set timeout for heartbeat response
        heartbeatTimeoutTimer.value = setTimeout(() => {
          console.warn('WebSocket heartbeat timeout');
          ws.value?.close();
        }, config.heartbeatTimeout);
      }
    }, config.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  function stopHeartbeat() {
    if (heartbeatTimer.value) {
      clearInterval(heartbeatTimer.value);
      heartbeatTimer.value = null;
    }
    if (heartbeatTimeoutTimer.value) {
      clearTimeout(heartbeatTimeoutTimer.value);
      heartbeatTimeoutTimer.value = null;
    }
  }

  /**
   * Reset heartbeat timeout
   */
  function resetHeartbeatTimeout() {
    if (heartbeatTimeoutTimer.value) {
      clearTimeout(heartbeatTimeoutTimer.value);
      heartbeatTimeoutTimer.value = null;
    }
  }

  /**
   * Open WebSocket connection
   */
  function open() {
    if (ws.value?.readyState === WebSocket.OPEN) return;
    
    manualClose.value = false;
    status.value = WebSocketState.CONNECTING;

    try {
      ws.value = new WebSocket(url, config.protocols);

      ws.value.onopen = (event) => {
        status.value = WebSocketState.OPEN;
        error.value = null;
        reconnectCount.value = 0;

        // Send queued messages
        while (messageQueue.value.length > 0) {
          const msg = messageQueue.value.shift();
          doSend(msg);
        }

        startHeartbeat();
        eventHandlers.open.forEach(handler => handler(event));
      };

      ws.value.onmessage = (event) => {
        resetHeartbeatTimeout();
        
        let msgData = event.data;
        
        // Try to parse JSON
        try {
          msgData = JSON.parse(event.data);
        } catch {
          // Keep as string
        }

        data.value = msgData;
        lastMessage.value = event.data;
        lastMessageTime.value = Date.now();

        eventHandlers.message.forEach(handler => handler(msgData, event));
      };

      ws.value.onerror = (event) => {
        error.value = event;
        eventHandlers.error.forEach(handler => handler(event));
      };

      ws.value.onclose = (event) => {
        status.value = WebSocketState.CLOSED;
        stopHeartbeat();

        eventHandlers.close.forEach(handler => handler(event));

        // Attempt reconnection
        if (!manualClose.value && config.reconnect && reconnectCount.value < config.reconnectAttempts) {
          const delay = getReconnectDelay();
          reconnectCount.value++;

          reconnectTimer.value = setTimeout(() => {
            open();
          }, delay);
        }
      };
    } catch (err) {
      error.value = err;
      status.value = WebSocketState.CLOSED;
    }
  }

  /**
   * Close WebSocket connection
   */
  function close(code = 1000, reason = '') {
    manualClose.value = true;
    status.value = WebSocketState.CLOSING;

    if (reconnectTimer.value) {
      clearTimeout(reconnectTimer.value);
      reconnectTimer.value = null;
    }

    stopHeartbeat();

    if (ws.value) {
      ws.value.close(code, reason);
      ws.value = null;
    }

    status.value = WebSocketState.CLOSED;
  }

  /**
   * Internal send function
   */
  function doSend(dataToSend) {
    if (ws.value?.readyState === WebSocket.OPEN) {
      const message = typeof dataToSend === 'object' ? JSON.stringify(dataToSend) : dataToSend;
      ws.value.send(message);
      return true;
    }
    return false;
  }

  /**
   * Send message
   */
  function send(dataToSend, options = {}) {
    const { queue = true } = options;

    if (ws.value?.readyState === WebSocket.OPEN) {
      return doSend(dataToSend);
    } else if (queue) {
      messageQueue.value.push(dataToSend);
      return true;
    }
    return false;
  }

  /**
   * Send and wait for response
   */
  function sendAsync(dataToSend, options = {}) {
    const { timeout = 10000, matcher } = options;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        off('message', handler);
        reject(new Error('WebSocket response timeout'));
      }, timeout);

      const handler = (responseData, event) => {
        const matches = matcher ? matcher(responseData, dataToSend) : true;
        
        if (matches) {
          clearTimeout(timeoutId);
          off('message', handler);
          resolve(responseData);
        }
      };

      on('message', handler);
      
      if (!send(dataToSend)) {
        clearTimeout(timeoutId);
        off('message', handler);
        reject(new Error('Failed to send message'));
      }
    });
  }

  /**
   * Add event handler
   */
  function on(event, handler) {
    if (eventHandlers[event]) {
      eventHandlers[event].add(handler);
    }
    return () => off(event, handler);
  }

  /**
   * Remove event handler
   */
  function off(event, handler) {
    if (eventHandlers[event]) {
      eventHandlers[event].delete(handler);
    }
  }

  /**
   * Add one-time event handler
   */
  function once(event, handler) {
    const wrappedHandler = (...args) => {
      off(event, wrappedHandler);
      handler(...args);
    };
    on(event, wrappedHandler);
    return () => off(event, wrappedHandler);
  }

  // Auto-connect if immediate
  if (config.immediate) {
    open();
  }

  return {
    // Refs
    status,
    data,
    error,
    lastMessage,
    lastMessageTime,
    reconnectCount,
    
    // Computed (as getters for convenience, but users should prefer refs)
    get isConnected() {
      return status.value === WebSocketState.OPEN;
    },
    get isConnecting() {
      return status.value === WebSocketState.CONNECTING;
    },
    
    // Methods
    open,
    close,
    send,
    sendAsync,
    on,
    off,
    once,
    
    // WebSocket instance
    ws
  };
}

/**
 * WebSocket client factory for multiple connections
 */
export function createWebSocketClient(baseUrl, options = {}) {
  const connections = new Map();
  const globalHandlers = {
    open: new Set(),
    message: new Set(),
    error: new Set(),
    close: new Set()
  };

  function connect(path = '', pathOptions = {}) {
    const url = path ? `${baseUrl}${path}` : baseUrl;
    const key = url;

    if (connections.has(key)) {
      return connections.get(key);
    }

    const connection = useWebSocket(url, { ...options, ...pathOptions });

    // Add global handlers
    Object.keys(globalHandlers).forEach(event => {
      globalHandlers[event].forEach(handler => {
        connection.on(event, handler);
      });
    });

    connections.set(key, connection);
    return connection;
  }

  function disconnect(path = '') {
    const url = path ? `${baseUrl}${path}` : baseUrl;
    const connection = connections.get(url);
    
    if (connection) {
      connection.close();
      connections.delete(url);
    }
  }

  function disconnectAll() {
    connections.forEach(connection => connection.close());
    connections.clear();
  }

  function on(event, handler) {
    globalHandlers[event]?.add(handler);
    connections.forEach(connection => {
      connection.on(event, handler);
    });
    return () => off(event, handler);
  }

  function off(event, handler) {
    globalHandlers[event]?.delete(handler);
    connections.forEach(connection => {
      connection.off(event, handler);
    });
  }

  function broadcast(data) {
    connections.forEach(connection => {
      connection.send(data);
    });
  }

  return {
    connect,
    disconnect,
    disconnectAll,
    on,
    off,
    broadcast,
    connections
  };
}

export default {
  useWebSocket,
  createWebSocketClient,
  WebSocketState
};
