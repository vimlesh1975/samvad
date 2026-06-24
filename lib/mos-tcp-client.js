import net from 'node:net';
import { fromUTF16BE } from './mos-common';

let client = null;
let connectingPromise = null;
let latestMosMessage = null;
const mosMessageHistory = [];

function rememberMosMessage(xml) {
  latestMosMessage = {
    xml,
    receivedAt: new Date().toISOString(),
  };
  mosMessageHistory.push(latestMosMessage);

  if (mosMessageHistory.length > 50) {
    mosMessageHistory.shift();
  }
}

export function getLatestMosMessage() {
  return latestMosMessage;
}

export function getMosMessageHistory() {
  return [...mosMessageHistory];
}

export async function getMosTcpClient() {
  const host = process.env.MOS_IP || process.env.SAMVAD_HOST;
  const port = Number(process.env.MOS_PORT);

  if (!host || !Number.isFinite(port)) {
    throw new Error('Set MOS_PORT and either MOS_IP or SAMVAD_HOST in .env');
  }

  if (client && !client.destroyed && client.readyState === 'open') {
    return client;
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = new Promise((resolve, reject) => {
    client = new net.Socket();
    client.setKeepAlive(true, 5000);
    client.setNoDelay(true);
    client.setTimeout(10000);

    client.connect(port, host, () => {
      connectingPromise = null;
      resolve(client);
    });

    client.on('data', (data) => {
      rememberMosMessage(fromUTF16BE(data).trim());
    });

    client.on('error', (error) => {
      client?.destroy();
      client = null;
      connectingPromise = null;
      reject(error);
    });

    client.on('timeout', () => {
      client?.destroy();
      client = null;
      connectingPromise = null;
    });

    client.on('close', () => {
      client = null;
      connectingPromise = null;
    });
  });

  return connectingPromise;
}
