export function toUTF16BE(value) {
  const utf16le = Buffer.from(String(value ?? ''), 'utf16le');
  const utf16be = Buffer.alloc(utf16le.length);

  for (let index = 0; index < utf16le.length; index += 2) {
    utf16be[index] = utf16le[index + 1];
    utf16be[index + 1] = utf16le[index];
  }

  return utf16be;
}

export function fromUTF16BE(buffer) {
  const utf16le = Buffer.alloc(buffer.length);

  for (let index = 0; index < buffer.length; index += 2) {
    utf16le[index] = buffer[index + 1];
    utf16le[index + 1] = buffer[index];
  }

  return utf16le.toString('utf16le');
}

export function compressed(value) {
  return String(value ?? '')
    .replace(/\s*\n\s*/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export const mosStart = '<mos>';
export const mosEnd = '</mos>';
