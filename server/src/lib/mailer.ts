// 이메일 발송 — nodemailer 기반 SMTP
// 환경변수 필요:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
// SMTP_HOST 미설정 시 콘솔 로그로 대체 (개발용 폴백)

import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    console.warn('[mailer] SMTP not configured — logging instead');
    console.log(`[mailer] To: ${to}\nSubject: ${subject}\n${text}`);
    return false;
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || 'noreply@laststory.game',
      to, subject, text, html,
    });
    return true;
  } catch (e) {
    console.error('[mailer] send error', e);
    return false;
  }
}

export function isMailerReady(): boolean {
  return !!process.env.SMTP_HOST;
}
