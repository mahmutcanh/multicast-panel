export interface M3uEntry {
  name: string;
  url: string;
  logo?: string;
  group?: string;
  epgId?: string;
}

const ATTR_REGEX = /([a-zA-Z0-9-]+)="([^"]*)"/g;

/** Parses an extended M3U playlist into entries. Pure function (unit-tested). */
export function parseM3u(content: string): M3uEntry[] {
  const lines = content.split(/\r?\n/);
  const entries: M3uEntry[] = [];
  let pending: Partial<M3uEntry> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === '#EXTM3U') continue;

    if (line.startsWith('#EXTINF')) {
      const attrs: Record<string, string> = {};
      for (const match of line.matchAll(ATTR_REGEX)) attrs[match[1].toLowerCase()] = match[2];
      const name = line.includes(',') ? line.slice(line.lastIndexOf(',') + 1).trim() : '';
      pending = {
        name: name || attrs['tvg-name'] || 'Unnamed',
        logo: attrs['tvg-logo'],
        group: attrs['group-title'],
        epgId: attrs['tvg-id'],
      };
    } else if (!line.startsWith('#') && pending) {
      entries.push({ ...pending, url: line } as M3uEntry);
      pending = null;
    } else if (!line.startsWith('#')) {
      // bare URL without EXTINF
      entries.push({ name: line, url: line });
    }
  }
  return entries;
}

export function sourceTypeForUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.startsWith('rtsp://')) return 'rtsp';
  if (lower.startsWith('rtmp://')) return 'rtmp';
  if (lower.startsWith('udp://')) return 'udp';
  if (lower.includes('.m3u8')) return 'm3u8';
  if (lower.startsWith('http://') || lower.startsWith('https://')) return 'http';
  return 'file';
}
