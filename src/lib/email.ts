import nodemailer, { type Transporter } from "nodemailer";
import { requireEnv } from "@/lib/runtime";

let cachedTransporter: Transporter | null = null;
let cachedTransporterKey: string | null = null;

function getTransporter(opts: {
  host: string;
  port: number;
  user: string;
  pass: string;
}): Transporter {
  const key = `${opts.host}:${opts.port}:${opts.user}`;
  if (cachedTransporter && cachedTransporterKey === key) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.port === 465,
    auth: { user: opts.user, pass: opts.pass },
    pool: true,
  });
  cachedTransporterKey = key;
  return cachedTransporter;
}

export async function sendRealEmail(opts: {
  to: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: string | Buffer }>;
}) {
  const host = requireEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = requireEnv("SMTP_USER");
  const pass = requireEnv("SMTP_PASS");
  const from = requireEnv("SMTP_FROM");

  const transporter = getTransporter({ host, port, user, pass });

  const info = await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments,
  });

  return { messageId: info.messageId };
}
