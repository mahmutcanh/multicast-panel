import { Channel, ChannelOutput } from '../../database/entities/streaming.entities';
import { BuilderEnv, buildFfmpegArgs, buildUdpUrl } from './ffmpeg-builder';

const env: BuilderEnv = {
  ffmpegPath: '/usr/bin/ffmpeg',
  hlsDir: '/data/hls',
  defaultInterfaceIp: '',
};

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'ch-1',
    name: 'Test',
    sourceType: 'test_pattern',
    sourceUrl: null,
    udpIp: '230.120.5.98',
    udpPort: 1234,
    ttl: 64,
    pktSize: 1316,
    iface: '',
    copyMode: false,
    videoCodec: 'libx264',
    audioCodec: 'aac',
    videoBitrate: '3000k',
    audioBitrate: '128k',
    resolution: '1280x720',
    fps: 25,
    gop: 50,
    preset: 'veryfast',
    threads: 0,
    bufsize: '',
    muxrate: '',
    mpegtsOpts: null,
    hwaccel: '',
    probeSize: '',
    analyzeDuration: '',
    reconnectOpts: null,
    extraFfmpegArgs: '',
    loopMode: true,
    outputs: [{ type: 'udp', enabled: true, url: '', config: {} } as ChannelOutput],
    ...overrides,
  } as Channel;
}

describe('buildUdpUrl', () => {
  test('builds multicast url with pkt_size and ttl', () => {
    const url = buildUdpUrl(makeChannel(), env);
    expect(url).toBe('udp://230.120.5.98:1234?pkt_size=1316&ttl=64');
  });

  test('adds localaddr when interface is set', () => {
    const url = buildUdpUrl(makeChannel({ iface: '192.168.1.10' }), env);
    expect(url).toContain('localaddr=192.168.1.10');
  });

  test('falls back to env default interface', () => {
    const url = buildUdpUrl(makeChannel(), { ...env, defaultInterfaceIp: '10.0.0.5' });
    expect(url).toContain('localaddr=10.0.0.5');
  });
});

describe('buildFfmpegArgs', () => {
  test('test pattern source uses lavfi and forces encode', () => {
    const args = buildFfmpegArgs(makeChannel(), env);
    expect(args).toContain('lavfi');
    expect(args.join(' ')).toContain('testsrc2=size=1280x720:rate=25');
    expect(args).toContain('-c:v');
    expect(args).not.toContain('copy');
  });

  test('copy mode uses -c copy for file source', () => {
    const args = buildFfmpegArgs(
      makeChannel({ sourceType: 'file', sourceUrl: '/data/media/a.mp4', copyMode: true }),
      env,
    );
    expect(args.join(' ')).toContain('-c copy');
    expect(args).toContain('-stream_loop');
  });

  test('single udp output avoids tee muxer', () => {
    const args = buildFfmpegArgs(makeChannel(), env);
    expect(args).toContain('mpegts');
    expect(args).not.toContain('tee');
    expect(args[args.length - 1]).toContain('udp://230.120.5.98:1234');
  });

  test('multiple outputs use tee with branches', () => {
    const channel = makeChannel({
      outputs: [
        { type: 'udp', enabled: true, url: '', config: {} } as ChannelOutput,
        { type: 'hls', enabled: true, url: '', config: {} } as ChannelOutput,
        { type: 'rtmp', enabled: true, url: 'rtmp://live.example.com/app/key', config: {} } as ChannelOutput,
      ],
    });
    const args = buildFfmpegArgs(channel, env);
    expect(args).toContain('tee');
    const teeArg = args[args.indexOf('tee') + 1];
    expect(teeArg.split('|')).toHaveLength(3);
    expect(teeArg).toContain('udp://230.120.5.98:1234');
    expect(teeArg).toContain('/data/hls/ch-1/index.m3u8');
    expect(teeArg).toContain('[f=flv:onfail=ignore]rtmp://live.example.com/app/key');
  });

  test('rtsp source uses tcp transport', () => {
    const args = buildFfmpegArgs(
      makeChannel({ sourceType: 'rtsp', sourceUrl: 'rtsp://cam/stream' }),
      env,
    );
    expect(args.join(' ')).toContain('-rtsp_transport tcp');
  });

  test('http source adds reconnect flags', () => {
    const args = buildFfmpegArgs(
      makeChannel({ sourceType: 'http', sourceUrl: 'https://example.com/s.ts' }),
      env,
    );
    expect(args).toContain('-reconnect');
  });

  test('disabled outputs are skipped', () => {
    const channel = makeChannel({
      outputs: [
        { type: 'udp', enabled: true, url: '', config: {} } as ChannelOutput,
        { type: 'hls', enabled: false, url: '', config: {} } as ChannelOutput,
      ],
    });
    const args = buildFfmpegArgs(channel, env);
    expect(args).not.toContain('tee');
  });

  test('mpegts options are filtered to a safe allowlist', () => {
    const channel = makeChannel({
      mpegtsOpts: { mpegts_service_id: '7', 'bad;opt': 'x', muxrate: '5000k' },
    });
    const args = buildFfmpegArgs(channel, env);
    const joined = args.join(' ');
    expect(joined).toContain('-mpegts_service_id 7');
    expect(joined).not.toContain('bad;opt');
  });
});
