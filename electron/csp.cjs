// The page only loads its own bundled code and never reaches the network: AI requests run in the main process.
// Mermaid styles its SVG with inline <style>, so inline styles are allowed; scripts are not.
// The desktop app sends this as a header on app:// (main.cjs); the browser build gets it as a meta tag (vite.config.ts).
function csp({ connect = "'self'" } = {}) {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

module.exports = { csp };
