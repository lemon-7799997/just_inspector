import { createGameServer } from "./server.js";

const port = Number(process.env.JI_PORT ?? 8765);

const handle = await createGameServer({ port });
const close = (): void => {
  void handle.close().then(() => process.exit(0));
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

// keep the process alive (top-level await keeps it alive anyway)
