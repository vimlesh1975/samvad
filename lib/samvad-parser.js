import { XMLParser } from 'fast-xml-parser';

const textDecoder = new TextDecoder();
const maxPreviewChars = 500;
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
});

export function parseSamvadFrame(data) {
  const bytes = normalizeBytes(data);
  const text = textDecoder.decode(bytes);
  const preview = text.slice(0, maxPreviewChars);
  const receivedAt = new Date().toISOString();

  if (bytes.byteLength === 0 || text.trim().length === 0) {
    return {
      receivedAt,
      transportType: 'text',
      format: 'empty',
      byteLength: bytes.byteLength,
      preview,
    };
  }

  const json = tryParseJson(text);
  if (json.ok) {
    return {
      receivedAt,
      transportType: 'text',
      format: 'json',
      byteLength: bytes.byteLength,
      preview,
      json: json.value,
      jsonShape: describeJson(json.value),
    };
  }

  const xml = tryParseXml(text);
  if (xml.ok) {
    return {
      receivedAt,
      transportType: 'text',
      format: 'xml',
      byteLength: bytes.byteLength,
      preview,
      xml: xml.value,
      xmlShape: describeXml(xml.value),
    };
  }

  if (looksBinary(bytes, text)) {
    return {
      receivedAt,
      transportType: 'binary',
      format: 'binary',
      byteLength: bytes.byteLength,
      preview: toHexPreview(bytes),
    };
  }

  return {
    receivedAt,
    transportType: 'text',
    format: 'text',
    byteLength: bytes.byteLength,
    preview,
  };
}

function normalizeBytes(data) {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }

  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return Buffer.from(String(data));
}

function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function tryParseXml(text) {
  const trimmed = text.trim();

  if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) {
    return { ok: false };
  }

  try {
    return { ok: true, value: xmlParser.parse(trimmed) };
  } catch {
    return { ok: false };
  }
}

function describeXml(value) {
  if (!value || typeof value !== 'object') {
    return {
      root: describeType(value),
      keys: [],
      summary: { value },
    };
  }

  const root = Object.keys(value)[0] ?? 'unknown';
  const body = value[root];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      root,
      keys: [],
      summary: { value: body },
    };
  }

  const keys = Object.keys(body);
  const event = keys.length === 1 && typeof body[keys[0]] === 'object' ? keys[0] : inferFlatXmlEvent(keys);
  const eventValue = event ? body[event] : undefined;

  return {
    root,
    event,
    keys,
    summary:
      eventValue && typeof eventValue === 'object' && !Array.isArray(eventValue)
        ? summarizeObject(eventValue)
        : summarizeObject(body),
  };
}

function inferFlatXmlEvent(keys) {
  if (keys.includes('messageID') && keys.includes('CurrentStoryId')) {
    return 'StoryStatus';
  }

  return keys[0];
}

function describeJson(value) {
  if (Array.isArray(value)) {
    return {
      rootType: 'array',
      summary: {
        length: value.length,
        firstItemType: value.length > 0 ? describeType(value[0]) : undefined,
      },
    };
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value);

    return {
      rootType: 'object',
      keys,
      likelyType: inferLikelyType(value),
      summary: summarizeObject(value),
    };
  }

  return {
    rootType: describeType(value),
    summary: { value },
  };
}

function inferLikelyType(record) {
  const stringFields = ['type', 'event', 'action', 'command', 'name', 'messageType'];

  for (const field of stringFields) {
    if (typeof record[field] === 'string') {
      return `${field}:${record[field]}`;
    }
  }

  return undefined;
}

function summarizeObject(record) {
  return Object.fromEntries(
    Object.keys(record).map((key) => [key, summarizeValue(record[key])]),
  );
}

function summarizeValue(value) {
  if (typeof value === 'string') {
    return value.length > 80 ? `${value.slice(0, 80)}...` : value;
  }

  if (Array.isArray(value)) {
    return { type: 'array', length: value.length };
  }

  if (value && typeof value === 'object') {
    return { type: 'object', keys: Object.keys(value) };
  }

  return value;
}

function describeType(value) {
  if (Array.isArray(value)) {
    return 'array';
  }

  return value === null ? 'null' : typeof value;
}

function looksBinary(bytes, text) {
  if (text.includes('\u0000')) {
    return true;
  }

  const replacementChars = [...text].filter((char) => char === '\uFFFD').length;
  return replacementChars > Math.max(2, text.length * 0.05);
}

function toHexPreview(bytes) {
  return [...bytes.slice(0, 80)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');
}
