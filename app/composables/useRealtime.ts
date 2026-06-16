
const state = reactive<RealtimeState>({
  connected: false,
  activeSessions: 0,
  onlineWorkers: 0,
  queueSize: 0,
  campaignStats: {},
  workerStats: [],
  proxyHealth: [],
  queueStats: {},
  queueEvents: [],
})

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000

// ── Store composable ─────────────────────────────────────────
export function useRealtimeStore() {
  return {
    wsConnected: computed(() => state.connected),
    activeSessions: computed(() => state.activeSessions),
    onlineWorkers: computed(() => state.onlineWorkers),
    queueSize: computed(() => state.queueSize),
    campaignStats: computed(() => state.campaignStats),
    workerStats: computed(() => state.workerStats),
    proxyHealth: computed(() => state.proxyHealth),
    queueStats: computed(() => state.queueStats),
    queueEvents: computed(() => state.queueEvents),
  }
}

// ── Main composable ──────────────────────────────────────────
export function useRealtime() {
  function connect() {
    // Jangan buat socket baru kalau sudah OPEN atau sedang CONNECTING
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    // Pakai referensi lokal `socket` di semua handler — hindari race saat
    // `ws` module-level di-reassign oleh reconnect/mount ganda (penyebab
    // error "send on WebSocket: Still in CONNECTING state").
    const socket = new WebSocket(`${proto}//${location.host}/_ws`)
    ws = socket

    socket.onopen = () => {
      if (socket.readyState !== WebSocket.OPEN) return
      state.connected = true
      reconnectDelay = 1000
      socket.send(JSON.stringify({
        type: 'subscribe',
        channels: ['analytics:update', 'campaign:update', 'worker:update', 'queue:update'],
      }))
    }

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        handleMessage(msg)
      } catch { /* ignore malformed */ }
    }

    socket.onclose = () => {
      if (ws === socket) ws = null
      state.connected = false
      scheduleReconnect()
    }

    socket.onerror = () => {
      socket.close()
    }
  }

  function handleMessage(msg: { type: string; data: any }) {
    switch (msg.type) {
      case 'analytics:update':
        state.activeSessions = msg.data.activeSessions ?? state.activeSessions
        state.queueSize = msg.data.queueSize ?? state.queueSize
        Object.assign(state.campaignStats, msg.data.campaigns ?? {})
        break

      case 'worker:update':
        state.onlineWorkers = msg.data.onlineWorkers ?? state.onlineWorkers
        if (msg.data.workers) state.workerStats = msg.data.workers
        break

      case 'queue:update':
        state.queueSize = msg.data.size ?? state.queueSize
        if (msg.data.queue && msg.data.stats) {
          state.queueStats[msg.data.queue as QueueName] = msg.data.stats as QueueRealtimeStats
        }
        if (msg.data.queue) {
          state.queueEvents = [
            msg.data as QueueRealtimeEvent,
            ...state.queueEvents.filter((item) =>
              !(item.jobId === msg.data.jobId && item.queue === msg.data.queue && item.status === msg.data.status),
            ),
          ].slice(0, 20)
        }
        break

      case 'proxy:update':
        if (msg.data.proxies) state.proxyHealth = msg.data.proxies
        break

      case 'ping':
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }))
        }
        break
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 30000)
      connect()
    }, reconnectDelay)
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws?.close()
    ws = null
  }

  // Auto connect on mount, disconnect on unmount
  onMounted(connect)
  onUnmounted(disconnect)

  return {
    ...useRealtimeStore(),
    connect,
    disconnect,
  }
}
