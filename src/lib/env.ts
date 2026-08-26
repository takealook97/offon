/**
 * Required secrets, checked rather than asserted.
 *
 * These used to be read as `process.env.X!`, which tells the type checker they are present
 * and does nothing at runtime. The two failures that produced were not equally visible:
 * an unset SESSION_SECRET became a zero-length key that jose refuses, so signing in broke
 * with an opaque 500 at the moment someone tried; an unset OTP_PEPPER became the literal
 * string "undefined" through concatenation, so everything kept working while every login
 * code in the database was hashed with a pepper anyone can guess.
 *
 * The check is deliberately lazy rather than done at import. Throwing at module scope would
 * mean `next build` needing production secrets to compile, which they are not for.
 */

/** The value shell interpolation of an unset variable leaves in a .env file. */
const INTERPOLATED_NOTHING = 'undefined';

/**
 * Reads a required secret, or throws saying which one is missing and how to make one.
 *
 * How good the value is, is not judged here: a deployment running on a short secret is
 * working, and refusing to start it on upgrade would be a worse outcome than the weak secret.
 * The docs are where that argument belongs.
 */
export function requireSecret(
  name: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env[name]?.trim();
  if (!value || value === INTERPOLATED_NOTHING) {
    throw new Error(
      `${name} is not set. offon will not sign or hash without it. ` +
        `Generate one with: openssl rand -base64 32`,
    );
  }
  return value;
}
