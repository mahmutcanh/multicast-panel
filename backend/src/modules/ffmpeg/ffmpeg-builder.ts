import { Channel, ChannelOutput } from '../../database/entities/streaming.entities';

export interface BuilderEnv {
  ffmpegPath: string;
  hlsDir: string; // e.g. /data/hls
  defaultInterfaceIp: string; // '' = OS default
  concatFilePath?: string; // set for playlist/folder sources
}

const HLS_DEFAULTS = { segmentTime: 4, listSize: 6 };

/** Options embedded into a tee branch: [k=v:k=v]target */
function teeBranch(options: Record<string, string>, target: string): string {
  const opts = Object.entries(options)
    .map(([k, v]) => `${k}=${v}`)
    .join(':');
  return opts ? `[${opts}]${target}` : target;
}

export function buildUdpUrl(channel: Channel, env: BuilderEnv): string {
  const params = new URLSearchParams();
  params.set('pkt_size', String(channel.pktSize || 1316));
  params.set('ttl', String(channel.ttl || 64));
  const localAddr = channel.iface || env.defaultInterfaceIp;
  if (localAddr) params.set('localaddr', localAddr);
  return `udp://${channel.udpIp}:${channel.udpPort}?${params.toString()}`;
}

function inputArgs(channel: Channel, env: BuilderEnv): string[] {
  const args: string[] = [];
  if (channel.probeSize) args.push('-probesize', channel.probeSize);
  if (channel.analyzeDuration) args.push('-analyzeduration', channel.analyzeDuration);
  if (channel.hwaccel) args.push('-hwaccel', channel.hwaccel);

  const url = channel.sourceUrl ?? '';
  switch (channel.sourceType) {
    case 'test_pattern': {
      const size = channel.resolution || '1280x720';
      const rate = channel.fps || 25;
      args.push(
        '-re',
        '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=${rate}`,
        '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000',
      );
      break;
    }
    case 'file':
      args.push('-re');
      if (channel.loopMode) args.push('-stream_loop', '-1');
      args.push('-i', url);
      break;
    case 'playlist':
    case 'folder':
      args.push('-re', '-thread_queue_size', '512', '-f', 'concat', '-safe', '0');
      if (channel.loopMode) args.push('-stream_loop', '-1');
      args.push('-i', env.concatFilePath ?? '');
      break;
    case 'rtsp':
      args.push('-rtsp_transport', 'tcp', '-i', url);
      break;
    case 'camera':
      if (url.startsWith('/dev/')) args.push('-f', 'v4l2', '-i', url);
      else args.push('-rtsp_transport', 'tcp', '-i', url);
      break;
    case 'screen': {
      const size = channel.resolution || '1920x1080';
      const rate = channel.fps || 30;
      args.push(
        '-f', 'x11grab',
        '-draw_mouse', '1',
        '-video_size', size,
        '-framerate', String(rate),
        '-i', url || ':0.0',
      );
      break;
    }
    case 'youtube':
    case 'http':
    case 'm3u8':
    case 'm3u_link': {
      args.push('-re');
      const rc = channel.reconnectOpts;
      if (rc?.enabled !== false) {
        args.push(
          '-reconnect', '1',
          '-reconnect_streamed', '1',
          '-reconnect_at_eof', '1',
          '-reconnect_delay_max', String(rc?.delayMax ?? 10),
        );
      }
      args.push('-i', url);
      break;
    }
    case 'rtmp':
    case 'udp':
    default:
      args.push('-i', url);
      break;
  }
  return args;
}

function codecArgs(channel: Channel): string[] {
  // test pattern is raw lavfi — always needs encoding
  const mustEncode = channel.sourceType === 'test_pattern';
  if (channel.copyMode && !mustEncode) return ['-c', 'copy'];

  const args: string[] = ['-c:v', channel.videoCodec || 'libx264'];
  const vb = channel.videoBitrate || '4000k';
  args.push('-b:v', vb, '-maxrate', vb, '-bufsize', channel.bufsize || bufsizeFor(vb));
  if (channel.preset) args.push('-preset', channel.preset);
  if (channel.gop > 0) args.push('-g', String(channel.gop));
  if (channel.fps > 0) args.push('-r', String(channel.fps));
  if (channel.resolution) args.push('-s', channel.resolution);
  if (channel.threads > 0) args.push('-threads', String(channel.threads));
  args.push('-c:a', channel.audioCodec || 'aac', '-b:a', channel.audioBitrate || '128k');
  if (channel.sourceType === 'test_pattern') args.push('-shortest');
  return args;
}

function bufsizeFor(bitrate: string): string {
  const match = /^(\d+)([kKmM]?)$/.exec(bitrate);
  if (!match) return '8000k';
  return `${parseInt(match[1], 10) * 2}${match[2] || ''}`;
}

function mpegtsBranchOpts(channel: Channel): Record<string, string> {
  const opts: Record<string, string> = { f: 'mpegts' };
  for (const [k, v] of Object.entries(channel.mpegtsOpts ?? {})) {
    // only allow known-safe mpegts muxer keys
    if (/^(mpegts_|muxrate|pes_payload_size|pcr_period|sdt_period|pat_period)/.test(k)) {
      opts[k] = String(v);
    }
  }
  if (channel.muxrate && !opts.muxrate) opts.muxrate = channel.muxrate;
  return opts;
}

function hlsBranch(channel: Channel, output: ChannelOutput, env: BuilderEnv): string {
  const cfg = output.config as { segmentTime?: number; listSize?: number };
  const dir = `${env.hlsDir}/${channel.id}`;
  return teeBranch(
    {
      f: 'hls',
      hls_time: String(cfg.segmentTime ?? HLS_DEFAULTS.segmentTime),
      hls_list_size: String(cfg.listSize ?? HLS_DEFAULTS.listSize),
      hls_flags: 'delete_segments+independent_segments',
      hls_segment_filename: `${dir}/seg_%05d.ts`,
      onfail: 'ignore',
    },
    `${dir}/index.m3u8`,
  );
}

/**
 * Builds the complete ffmpeg argv for a channel.
 * Multiple enabled outputs are fanned out with the tee muxer so a single
 * encode feeds UDP + HLS + SRT + RTMP simultaneously.
 */
export function buildFfmpegArgs(channel: Channel, env: BuilderEnv): string[] {
  const outputs = (channel.outputs ?? []).filter((o) => o.enabled);
  if (outputs.length === 0) {
    outputs.push({ type: 'udp', enabled: true, url: '', config: {} } as ChannelOutput);
  }

  const args: string[] = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-nostdin',
    '-progress', 'pipe:1',
    ...inputArgs(channel, env),
    ...codecArgs(channel),
  ];

  if (channel.extraFfmpegArgs) {
    args.push(...channel.extraFfmpegArgs.split(/\s+/).filter(Boolean));
  }

  const branches = outputs.map((o) => {
    switch (o.type) {
      case 'udp':
        return teeBranch({ ...mpegtsBranchOpts(channel), onfail: 'ignore' }, buildUdpUrl(channel, env));
      case 'hls':
        return hlsBranch(channel, o, env);
      case 'srt':
        return teeBranch({ f: 'mpegts', onfail: 'ignore' }, o.url);
      case 'http':
        return teeBranch({ f: 'mpegts', onfail: 'ignore' }, o.url);
      case 'rtmp':
        return teeBranch({ f: 'flv', onfail: 'ignore' }, o.url);
      default:
        return '';
    }
  }).filter(Boolean);

  if (branches.length === 1 && outputs[0].type === 'udp') {
    // simple case: direct mpegts output, no tee overhead
    args.push('-f', 'mpegts');
    if (channel.muxrate) args.push('-muxrate', channel.muxrate);
    for (const [k, v] of Object.entries(channel.mpegtsOpts ?? {})) {
      if (/^(mpegts_|pes_payload_size|pcr_period|sdt_period|pat_period)/.test(k)) {
        args.push(`-${k}`, String(v));
      }
    }
    args.push(buildUdpUrl(channel, env));
  } else {
    args.push('-map', '0:v?', '-map', channel.sourceType === 'test_pattern' ? '1:a?' : '0:a?');
    args.push('-f', 'tee', branches.join('|'));
  }
  return args;
}

/** Minimal VLC fallback command (testing only). */
export function buildVlcArgs(channel: Channel, env: BuilderEnv): string[] {
  const dst = `${channel.udpIp}:${channel.udpPort}`;
  const input =
    channel.sourceType === 'test_pattern'
      ? 'fake://'
      : (env.concatFilePath ?? channel.sourceUrl ?? '');
  const args = ['-I', 'dummy', input, `--sout=#standard{access=udp,mux=ts,dst=${dst}}`, `--ttl=${channel.ttl || 64}`];
  if (channel.loopMode) args.push('--loop');
  return args;
}
