import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import * as si from 'systeminformation';
import { CH_ALERT, CH_METRICS } from '../common/events.service';
import { REDIS } from '../common/redis.module';

const SAMPLE_INTERVAL_MS = 5_000;
const ALERT_COOLDOWN_MS = 15 * 60_000;

export interface SystemMetrics {
  cpuPercent: number;
  ramPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  diskPercent: number;
  diskFreeGb: number;
  netRxMbps: number;
  netTxMbps: number;
  uptimeSeconds: number;
  ts: number;
}

/** Samples host metrics and publishes them; raises threshold alerts. */
@Injectable()
export class MetricsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MetricsService.name);
  private timer?: NodeJS.Timeout;
  private lastAlertAt: Record<string, number> = {};

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sample().catch((e) => this.logger.error(e.message)), SAMPLE_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async sample(): Promise<void> {
    const [load, mem, fsList, net, time] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      Promise.resolve(si.time()),
    ]);
    const rootFs = fsList.find((f) => f.mount === '/') ?? fsList[0];
    const totalNet = net.reduce(
      (acc, n) => ({ rx: acc.rx + (n.rx_sec ?? 0), tx: acc.tx + (n.tx_sec ?? 0) }),
      { rx: 0, tx: 0 },
    );

    const metrics: SystemMetrics = {
      cpuPercent: Math.round(load.currentLoad * 10) / 10,
      ramPercent: Math.round(((mem.total - mem.available) / mem.total) * 1000) / 10,
      ramUsedMb: Math.round((mem.total - mem.available) / 1048576),
      ramTotalMb: Math.round(mem.total / 1048576),
      diskPercent: rootFs ? Math.round(rootFs.use * 10) / 10 : 0,
      diskFreeGb: rootFs ? Math.round(((rootFs.size - rootFs.used) / 1073741824) * 10) / 10 : 0,
      netRxMbps: Math.round((totalNet.rx * 8) / 1e5) / 10,
      netTxMbps: Math.round((totalNet.tx * 8) / 1e5) / 10,
      uptimeSeconds: time.uptime,
      ts: Date.now(),
    };

    await this.redis.publish(CH_METRICS, JSON.stringify(metrics));
    await this.redis.set('mcp:metrics:last', JSON.stringify(metrics), 'EX', 60);
    await this.checkThresholds(metrics);
  }

  private async checkThresholds(m: SystemMetrics): Promise<void> {
    const checks: { event: string; value: number; over: boolean; message: string }[] = [
      { event: 'high_cpu', value: m.cpuPercent, over: m.cpuPercent >= 90, message: `CPU usage at ${m.cpuPercent}%` },
      { event: 'high_ram', value: m.ramPercent, over: m.ramPercent >= 90, message: `RAM usage at ${m.ramPercent}%` },
      { event: 'low_disk', value: m.diskFreeGb, over: m.diskPercent >= 90, message: `Disk ${m.diskPercent}% full (${m.diskFreeGb} GB free)` },
    ];
    for (const check of checks) {
      if (!check.over) continue;
      const last = this.lastAlertAt[check.event] ?? 0;
      if (Date.now() - last < ALERT_COOLDOWN_MS) continue;
      this.lastAlertAt[check.event] = Date.now();
      await this.redis.publish(
        CH_ALERT,
        JSON.stringify({
          event: check.event,
          title: 'Resource threshold exceeded',
          message: check.message,
          severity: 'warning',
          meta: { value: check.value },
        }),
      );
    }
  }
}
