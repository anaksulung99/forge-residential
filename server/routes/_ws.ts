import type { RedisValue } from "ioredis";

const clients = new Set<any>();

export default defineWebSocketHandler({
  open(peer) {
    clients.add(peer);
    peer.send(
      JSON.stringify({
        type: "connected",
        data: { timestamp: Date.now() },
      }),
    );
  },

  message(peer, message) {
    try {
      const msg = JSON.parse(message.text() as string);

      if (msg.type === "pong") return;

      if (msg.type === "subscribe") {
        (peer as any)._channels = msg.channels ?? [];
      }
    } catch {
      /* ignore malformed */
    }
  },

  close(peer) {
    clients.delete(peer);
  },

  error(peer) {
    clients.delete(peer);
  },
});

export function broadcastToClients(channel: string, data: any) {
  const payload = JSON.stringify({ type: channel, data });
  for (const peer of clients) {
    try {
      const channels = (peer as any)._channels as string[] | undefined;
      if (!channels || channels.includes(channel)) {
        peer.send(payload);
      }
    } catch {
      /* client disconnected */
    }
  }
}

export function getClientCount(): number {
  return clients.size;
}
