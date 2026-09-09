import { parseM3u, sourceTypeForUrl } from './m3u-parser';

const SAMPLE = `#EXTM3U
#EXTINF:-1 tvg-id="trt1.tr" tvg-logo="http://logo/trt1.png" group-title="Ulusal",TRT 1
http://example.com/trt1.m3u8
#EXTINF:-1 group-title="Spor",Sport HD
udp://230.1.1.1:1234
# a comment
http://bare-url.example.com/stream.ts
`;

describe('parseM3u', () => {
  test('parses entries with attributes', () => {
    const entries = parseM3u(SAMPLE);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      name: 'TRT 1',
      url: 'http://example.com/trt1.m3u8',
      logo: 'http://logo/trt1.png',
      group: 'Ulusal',
      epgId: 'trt1.tr',
    });
    expect(entries[1].group).toBe('Spor');
    expect(entries[1].url).toBe('udp://230.1.1.1:1234');
  });

  test('handles bare URLs without EXTINF', () => {
    const entries = parseM3u(SAMPLE);
    expect(entries[2].url).toBe('http://bare-url.example.com/stream.ts');
  });

  test('empty content gives empty list', () => {
    expect(parseM3u('')).toEqual([]);
  });
});

describe('sourceTypeForUrl', () => {
  test.each([
    ['rtsp://cam/1', 'rtsp'],
    ['rtmp://x/app', 'rtmp'],
    ['udp://230.0.0.1:1234', 'udp'],
    ['https://a/x.m3u8', 'm3u8'],
    ['http://a/x.ts', 'http'],
    ['/data/media/a.mp4', 'file'],
  ])('%s → %s', (url, expected) => {
    expect(sourceTypeForUrl(url)).toBe(expected);
  });
});
