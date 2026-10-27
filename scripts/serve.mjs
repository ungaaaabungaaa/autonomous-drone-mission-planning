import { createViewerServer } from "./server-lib.mjs";
const index = process.argv.indexOf("--port");
const port = index === -1 ? 8793 : Number(process.argv[index + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Use a port from 1 to 65535.");
const server = createViewerServer();
server.listen(port, "127.0.0.1", () =>
  console.log(`http://127.0.0.1:${port}/`),
);
