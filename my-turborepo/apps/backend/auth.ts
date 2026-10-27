import { config } from "dotenv";
import jwt from "jsonwebtoken";
import { join } from "node:path";

config({ path: join(import.meta.dir, ".env"), override: true });

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}


export function isAdminEmail(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

export function createEmailToken(userId: string): string {
  return jwt.sign({ userId }, requiredEnv("EMAIL_JWT_PASSWORD"), {
    expiresIn: "15m",
  });
}

export function verifyEmailToken(token: string, secret: string) {
  return jwt.verify(token, secret);
}

export function createUserToken(userId: string): string {
  return jwt.sign({ userId }, requiredEnv("USER_JWT_PASSWORD"), {
    expiresIn: "7d",
  });
}
