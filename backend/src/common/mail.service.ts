import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  private transporter(): nodemailer.Transporter | null {
    const smtp = this.config.get<{
      host: string; port: number; user: string; password: string; from: string; secure: boolean;
    }>('smtp');
    if (!smtp?.host) return null;
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    });
  }

  async send(to: string, subject: string, html: string): Promise<boolean> {
    const t = this.transporter();
    if (!t) {
      this.logger.warn(`SMTP not configured — mail to ${to} ("${subject}") skipped.`);
      return false;
    }
    try {
      await t.sendMail({ from: this.config.get('smtp.from'), to, subject, html });
      return true;
    } catch (err) {
      this.logger.error(`Mail to ${to} failed: ${(err as Error).message}`);
      return false;
    }
  }
}
