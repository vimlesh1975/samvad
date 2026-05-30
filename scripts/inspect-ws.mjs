import WebSocket from 'ws';
import { parseSamvadFrame } from '../lib/samvad-parser.js';

const url = getSamvadWsUrl();
const durationMs = Number(process.env.INSPECT_MS ?? 20000);

console.log(`Connecting to ${url}`);

const ws = new WebSocket(url);
let count = 0;

ws.on('open', () => {
  console.log(`Connected. Listening for ${durationMs}ms...`);
});

ws.on('message', (data) => {
  count += 1;
  console.log(`\n--- message ${count} ---`);
  console.log(JSON.stringify(parseSamvadFrame(data), null, 2));
});

ws.on('error', (error) => {
  console.error(`WebSocket error: ${error.message}`);
});

ws.on('close', (code, reason) => {
  console.log(`Closed: ${code} ${reason.toString()}`);
});

setTimeout(() => {
  console.log(`Finished. Messages received: ${count}`);
  ws.close();
}, durationMs);

function getSamvadWsUrl() {
  if (process.env.SAMVAD_WS_URL) {
    return process.env.SAMVAD_WS_URL;
  }

  const host = process.env.SAMVAD_HOST;
  const port = process.env.SAMVAD_WS_PORT;

  if (host && port) {
    return `ws://${host}:${port}`;
  }

  throw new Error('Set SAMVAD_WS_URL or SAMVAD_HOST and SAMVAD_WS_PORT');
}
