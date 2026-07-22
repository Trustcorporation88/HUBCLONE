import nodemailer from "nodemailer";
import { requireEnv } from "@/lib/runtime";

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

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments,
  });

  return { messageId: info.messageId };
}
