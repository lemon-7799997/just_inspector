import { WebSocketServer, WebSocket, type AddressInfo } from "ws";
import {
  errorResponse,
  Events,
  Methods,
  parseMessage,
  isCommand,
  PROTOCOL_VERSION,
  type Command,
} from "@just-inspector/protocol";
import { MockGame } from "./mock-game.js";

export interface GameServerHandle {
  port: number;
  game: MockGame;
  close(): Promise<void>;
}

export interface GameServerOptions {
  port?: number;
  /** Period (ms) of the simulated value mutations. 0 disables. */
  tickMs?: number;
  /** Period (ms) of simulated structure changes (enemies appear/disappear). 0 disables. */
  structureMs?: number;
}

/**
 * The mock game's inspector server. Behaves like a real game would:
 * serves the scene tree + node details over WebSocket, applies setValue,
 * and pushes `Runtime.nodeChanged` / `Runtime.treeChanged` events.
 */
export function createGameServer(options: GameServerOptions = {}): Promise<GameServerHandle> {
  const { port = 8765, tickMs = 1200, structureMs = 8000 } = options;
  const game = new MockGame();
  const clients = new Set<WebSocket>();

  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port }, () => {
      const address = wss.address() as AddressInfo;
      console.log(`[mock] inspector server listening on ws://127.0.0.1:${address.port}`);
      console.log(`[mock] game: ${game.info.gameName} (${game.info.engine})`);
    });

    wss.on("connection", (ws: WebSocket) => {
      clients.add(ws);
      send(ws, { method: Events.ready, params: game.info });
      console.log(`[mock] client connected (${clients.size} total)`);

      ws.on("message", (data) => {
        const text = data.toString();
        const message = parseMessage(text);
        if (!message || !isCommand(message)) {
          send(ws, errorResponse(-1, -32700, "Parse error: expected a command frame"));
          return;
        }
        handleCommand(ws, message);
      });

      ws.on("close", () => {
        clients.delete(ws);
        console.log(`[mock] client disconnected (${clients.size} total)`);
      });

      ws.on("error", (err) => {
        console.warn(`[mock] socket error: ${err.message}`);
      });
    });

    wss.on("error", reject);

    const broadcast = (frame: unknown): void => {
      const text = JSON.stringify(frame);
      for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(text);
      }
    };

    function handleCommand(ws: WebSocket, cmd: Command): void {
      const { id, method, params } = cmd;
      try {
        switch (method) {
          case Methods.hello:
            ok(ws, id, game.info);
            break;
          case Methods.ping:
            ok(ws, id, { pong: "pong" });
            break;
          case Methods.attach:
            ok(ws, id, { sessionId: `mock-session-${id}` });
            break;
          case Methods.detach:
            ok(ws, id, { ok: true });
            break;
          case Methods.getTree:
            ok(ws, id, { root: game.getTree() });
            break;
          case Methods.getNode: {
            const { nodeId } = (params ?? {}) as { nodeId?: string };
            const node = nodeId ? game.getNode(nodeId) : null;
            if (!node) throw domainError(4100, `Unknown node: ${nodeId}`);
            ok(ws, id, { node });
            break;
          }
          case Methods.setValue: {
            const { nodeId, property, value } = (params ?? {}) as {
              nodeId?: string;
              property?: string;
              value?: unknown;
            };
            if (!nodeId || !property || !value) {
              throw domainError(4102, "setValue requires { nodeId, property, value }");
            }
            const res = game.setValue(nodeId, property, value as never);
            if ("error" in res) throw domainError(res.error.code, res.error.message);
            ok(ws, id, { ok: true, value: res.value });
            broadcast({ method: Events.nodeChanged, params: { nodeId, property } });
            break;
          }
          default:
            throw domainError(-32601, `Method not found: ${method}`);
        }
      } catch (err) {
        const e = err as { code?: number; message: string };
        send(ws, errorResponse(id, e.code ?? -32603, e.message ?? String(err)));
      }
    }

    const tickTimer = tickMs > 0 ? setInterval(() => {
      const change = game.tick();
      if (change) {
        broadcast({ method: Events.nodeChanged, params: change });
      }
    }, tickMs) : null;

    const structureTimer = structureMs > 0 ? setInterval(() => {
      if (game.toggleEnemy()) {
        broadcast({ method: Events.treeChanged, params: { reason: "enemy spawned/despawned" } });
      }
    }, structureMs) : null;

    resolve({
      port: (wss.address() as AddressInfo).port,
      game,
      close: () =>
        new Promise<void>((done) => {
          if (tickTimer) clearInterval(tickTimer);
          if (structureTimer) clearInterval(structureTimer);
          for (const ws of clients) ws.terminate();
          wss.close(() => done());
        }),
    });
  });
}

function ok(ws: WebSocket, id: number, result: unknown): void {
  send(ws, { id, result });
}

function send(ws: WebSocket, frame: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(frame));
  }
}

function domainError(code: number, message: string): { code: number; message: string } {
  return { code, message };
}
