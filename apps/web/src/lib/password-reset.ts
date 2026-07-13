import { createHash, randomBytes } from "node:crypto";

import nodemailer from "nodemailer";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function createPasswordResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function sendPasswordResetEmail({
  recipient,
  resetUrl,
}: {
  recipient: string;
  resetUrl: string;
}): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP_HOST is not configured.");

  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    ...(user && password ? { auth: { user, pass: password } } : {}),
  });

  const fromEmail = process.env.SMTP_FROM_EMAIL ?? "no-reply@example.com";
  const fromName = process.env.SMTP_FROM_NAME ?? "Slide Agent";
  await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: recipient,
    subject: "Reset your Slide Agent password",
    text: [
      "We received a request to reset your Slide Agent password.",
      "",
      `Reset it within one hour: ${resetUrl}`,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
  });
}
