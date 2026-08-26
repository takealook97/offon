import crypto from 'node:crypto';
import argon2 from 'argon2';
import { requireSecret } from './env';

/**
 * Unset, this used to concatenate as the literal "undefined" — so hashing carried on working
 * with a pepper an attacker can guess, which is the one thing a pepper exists to prevent.
 */
const pepper = () => requireSecret('OTP_PEPPER');

export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function hashCode(code: string): Promise<string> {
  return argon2.hash(code + pepper(), { type: argon2.argon2id });
}

export async function verifyCode(hash: string, code: string): Promise<boolean> {
  // Read outside the catch on purpose. The catch is there to turn a malformed stored hash
  // into a rejected code; a missing pepper is a misconfiguration, and swallowing it here
  // would reject every login with no clue as to why.
  const peppered = code + pepper();
  try {
    return await argon2.verify(hash, peppered);
  } catch {
    return false;
  }
}
