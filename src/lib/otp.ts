import crypto from 'node:crypto';
import argon2 from 'argon2';

export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function hashCode(code: string): Promise<string> {
  return argon2.hash(code + process.env.OTP_PEPPER!, { type: argon2.argon2id });
}

export async function verifyCode(hash: string, code: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, code + process.env.OTP_PEPPER!);
  } catch {
    return false;
  }
}
