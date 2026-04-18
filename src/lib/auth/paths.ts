/**
 * Canonical auth route paths.
 *
 * Hard-coding these strings in five different forms was the kind of
 * duplication that bites the day someone renames `/auth/callback` to
 * `/auth/cb` and misses one call site. Central constants keep every
 * email redirect, login link, and router push pointing at the same
 * route names.
 */
export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";
export const FORGOT_PASSWORD_PATH = "/auth/forgot-password";
export const RESET_PASSWORD_PATH = "/auth/reset-password";
export const AUTH_CALLBACK_PATH = "/auth/callback";
