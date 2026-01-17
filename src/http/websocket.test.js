import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWebSocket, WebSocketState } from './websocket';

describe('WebSocket Client', () => {
  let mockWebSocket;
  
  beforeEach(() => {
    mockWebSocket = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 0, // CONNECTING
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
    };
    global.WebSocket = vi.fn(() => mockWebSocket);
    global.WebSocket.OPEN = 1;
    global.WebSocket.CONNECTING = 0;
    global.WebSocket.CLOSING = 2;
    global.WebSocket.CLOSED = 3;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize and connect', () => {
    const { status } = useWebSocket('ws://test', { immediate: false });
    expect(status.value).toBe(WebSocketState.CLOSED);
    
    // Test immediate logic manually or via option
    const wsState = useWebSocket('ws://test', { immediate: true });
    expect(global.WebSocket).toHaveBeenCalledWith('ws://test', expect.any(Array));
    expect(wsState.status.value).toBe(WebSocketState.CONNECTING);
  });

  it('should handle open event', () => {
    const { status } = useWebSocket('ws://test');
    
    // Simulate open
    mockWebSocket.readyState = WebSocket.OPEN;
    if (mockWebSocket.onopen) {
        mockWebSocket.onopen({});
    }
    
    expect(status.value).toBe(WebSocketState.OPEN);
  });

  it('should handle incoming messages', () => {
    const { data } = useWebSocket('ws://test');
    
    // Open first
    if (mockWebSocket.onopen) mockWebSocket.onopen({});

    // Simulate message
    const msg = { foo: 'bar' };
    if (mockWebSocket.onmessage) {
        mockWebSocket.onmessage({ data: JSON.stringify(msg) });
    }
    
    expect(data.value).toEqual(msg);
  });

  it('should send messages', () => {
    const { send } = useWebSocket('ws://test');
    
    // Open first
    mockWebSocket.readyState = WebSocket.OPEN;
    if (mockWebSocket.onopen) mockWebSocket.onopen({});

    send({ test: 1 });
    expect(mockWebSocket.send).toHaveBeenCalledWith('{"test":1}');
  });
});
