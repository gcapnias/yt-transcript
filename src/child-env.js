import path from 'node:path';

/**
 * Defence in depth: strip any `fnm_multishells` entry from the child process
 * PATH before spawning `yt-dlp`. The root cause is fixed on the development
 * machine; the guard is what keeps the tool portable.
 *
 * Pure, and case-insensitive on the variable name, because Windows spells it
 * `Path` while POSIX spells it `PATH` — rewriting a second key would leave the
 * original stale one in place.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {NodeJS.ProcessEnv} a copy; the input is never mutated
 */
export function sanitizeChildEnv(env = process.env) {
  const sanitized = { ...env };

  for (const key of Object.keys(sanitized)) {
    if (key.toLowerCase() !== 'path') continue;
    const value = sanitized[key];
    if (typeof value !== 'string') continue;

    sanitized[key] = value
      .split(path.delimiter)
      .filter((entry) => entry && !entry.toLowerCase().includes('fnm_multishells'))
      .join(path.delimiter);
  }

  return sanitized;
}
