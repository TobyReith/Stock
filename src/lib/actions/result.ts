/**
 * Shared server-action result type.
 *
 * Every action returns this discriminated union so call sites can
 * pattern-match with `if (res.ok)` without importing per-file types.
 * `T = void` is the default for actions that only indicate success/failure.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}
