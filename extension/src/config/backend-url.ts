declare const __STUDYLENS_BACKEND_URL__: string | undefined;

// Use 127.0.0.1, not 'localhost': the browser may resolve localhost to IPv6 ::1
// while the Node server listens on IPv4 only, causing connection refused.
export const DEFAULT_BACKEND_BASE_URL: string =
  typeof __STUDYLENS_BACKEND_URL__ === 'string' && __STUDYLENS_BACKEND_URL__.length > 0
    ? __STUDYLENS_BACKEND_URL__
    : 'http://127.0.0.1:3000';