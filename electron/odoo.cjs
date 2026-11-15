// The Odoo server vdoo connects to: its address, the user to sign in as and, optionally, the database.
// The password is never saved. The page asks for it each time a connection is made and passes it to
// connect(), which uses it for that one sign-in.
//
// Requests go through the same guarded fetch as custom AI endpoints (ai.cjs): https, or plain http only
// on this computer or the local network, and a local address only after the person approved it.
const fs = require("node:fs");
const { endpointAddress } = require("./custom-endpoint.cjs");
const { serial } = require("./chat-completions.cjs");

const CONFIG_FILE = "odoo.json";
const DEFAULT_USER = "admin";
const HTTPS_ONLY = "Use an https:// address. Plain http works only for this computer or your local network.";
const validUser = (user) => user.length <= 256 && !/[\x00-\x1f\x7f]/.test(user);
const validDatabase = (name) => /^[\w.-]{0,63}$/.test(name);
const validApproval = (local, url) => local === null || (typeof local?.origin === "string" && local.origin === new URL(url).origin
  && Array.isArray(local.addresses) && local.addresses.length > 0 && local.addresses.length <= 64
  && local.addresses.every((a) => typeof a === "string" && a.length <= 64));

/**
 * `fetch(url, options, approvedLocal)` makes the request, reaching a local address only if it is in
 * `approvedLocal`. `resolve(url)` returns { origin, addresses, local, allLocal }. `confirmLocal(url, addresses)`
 * asks the person and resolves to true if they allow it. `file(name)` is where a settings file lives.
 */
function createOdoo({ fetch, resolve, confirmLocal, file, writeAtomic }) {
  function config() {
    try {
      const saved = JSON.parse(fs.readFileSync(file(CONFIG_FILE), "utf8"));
      const url = endpointAddress(saved?.url);
      const user = typeof saved?.user === "string" && saved.user && validUser(saved.user) ? saved.user : DEFAULT_USER;
      const database = typeof saved?.database === "string" && validDatabase(saved.database) ? saved.database : "";
      const local = saved?.local ?? null;
      if (!url) return null;
      return { url, user, database, local: validApproval(local, url) ? local : null };
    } catch { return null; }
  }
  const status = () => {
    const saved = config();
    return saved ? { configured: true, url: saved.url, user: saved.user, database: saved.database }
      : { configured: false, url: "", user: DEFAULT_USER, database: "" };
  };
  const nameOf = (url) => new URL(url).host;

  /** Where requests may go: asks before the first connection to an address on this computer or the local network. */
  async function destination(saved) {
    const url = new URL(saved.url);
    let found;
    try { found = await resolve(url); } catch { throw new Error(`Couldn't find ${url.host}. Check the Odoo URL in Settings.`); }
    if (url.protocol === "http:" && !found.allLocal) throw new Error(HTTPS_ONLY);
    if (!found.local) return { url: saved.url, local: null };
    const approved = saved.local?.origin === found.origin && found.addresses.every((ip) => saved.local.addresses.includes(ip));
    if (approved) return { url: saved.url, local: saved.local };
    if (!(await confirmLocal(url, found.addresses))) throw new Error(`vdoo didn't connect to ${url.host}.`);
    const local = { origin: found.origin, addresses: found.addresses };
    writeAtomic(CONFIG_FILE, JSON.stringify({ url: saved.url, user: saved.user, database: saved.database, local }));
    return { url: saved.url, local };
  }

  /** Calls one of Odoo's JSON-RPC routes. An error Odoo reports is thrown with its exception name in `odoo`. */
  async function rpc({ url, local }, route, params) {
    const name = nameOf(url);
    let response;
    try {
      response = await fetch(url + route, {
        method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method: "call", params, id: 1 }),
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20_000), credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
      }, local);
    } catch (error) {
      if (error?.code === "local_refused") {
        throw new Error(`${name} now leads to an address on this computer or your network that you haven't approved. Test the connection again.`);
      }
      if (error?.code === "public_refused") {
        throw new Error(`${name} now leads to an address outside this computer and your local network, so vdoo sent nothing over plain http. Use an https:// address.`);
      }
      throw new Error(`Couldn't reach ${name}. Check the Odoo URL and your connection, and that Odoo is running.`);
    }
    const body = response.ok ? await response.json().catch(() => null) : (await response.body?.cancel().catch(() => {}), null);
    if (!body || typeof body !== "object" || (!("result" in body) && !body.error)) {
      throw new Error(`${name} didn't answer like an Odoo server${response.ok ? "" : ` (HTTP ${response.status})`}. Check the Odoo URL in Settings.`);
    }
    if (body.error) {
      throw Object.assign(new Error(`${name} couldn't complete the request. Try again.`),
        { odoo: String(body.error?.data?.name ?? ""), detail: String(body.error?.data?.message ?? "") });
    }
    return body.result;
  }

  /** The database to sign in to when none is set: the only one the server has. */
  async function onlyDatabase(server) {
    const name = nameOf(server.url);
    let list;
    try { list = await rpc(server, "/web/database/list", {}); }
    catch (error) {
      if (!error.odoo) throw error;
      throw new Error(`${name} doesn't list its databases. Enter the database name in Settings.`);
    }
    const names = Array.isArray(list) ? list.filter((n) => typeof n === "string" && n) : [];
    if (names.length === 1) return names[0];
    if (!names.length) throw new Error(`${name} doesn't list a database. Enter the database name in Settings.`);
    const shown = names.slice(0, 8).join(", ") + (names.length > 8 ? ", …" : "");
    throw new Error(`${name} has several databases (${shown}). Enter the one to use in Settings.`);
  }

  const change = serial();
  return {
    status,
    save: (input) => change(() => {
      const url = endpointAddress(input?.url);
      if (!url) throw new Error("Enter the Odoo URL, such as https://mycompany.odoo.com or http://localhost:8069.");
      const user = typeof input?.user === "string" ? input.user.trim() : "";
      if (!validUser(user)) throw new Error("Enter a valid user name, or leave it empty to use admin.");
      const database = typeof input?.database === "string" ? input.database.trim() : "";
      if (!validDatabase(database)) throw new Error("Enter a valid database name, or leave it empty.");
      // An approval belongs to one address: a new URL is asked about again.
      const previous = config();
      const local = previous?.url === url ? previous.local : null;
      writeAtomic(CONFIG_FILE, JSON.stringify({ url, user: user || DEFAULT_USER, database, local }));
    }),
    /** Signs in with the saved user and this password. Returns what the server reports; keeps nothing. */
    connect: (password) => change(async () => {
      const saved = config();
      if (!saved) throw new Error("Enter your Odoo URL in Settings first.");
      if (typeof password !== "string" || !password || password.length > 1024) throw new Error("Enter the password.");
      const server = await destination(saved);
      const name = nameOf(saved.url);
      const database = saved.database || await onlyDatabase(server);
      let info;
      try { info = await rpc(server, "/web/session/authenticate", { db: database, login: saved.user, password }); }
      catch (error) {
        if (error.odoo?.endsWith("AccessDenied")) throw new Error(`${name} rejected this user name or password.`);
        if (error.odoo?.endsWith("AccessError") || /database/i.test(error.detail ?? "")) {
          throw new Error(`${name} has no database named ${database}. Check the database name in Settings.`);
        }
        throw error;
      }
      if (!Number.isSafeInteger(info?.uid) || info.uid <= 0) {
        throw new Error(`${name} didn't sign ${saved.user} in. An account with two-factor authentication can't connect with a password.`);
      }
      const text = (value, fallback) => typeof value === "string" && value ? value.slice(0, 200) : fallback;
      return { version: text(info.server_version, ""), database: text(info.db, database), user: text(info.name, saved.user),
        login: saved.user, uid: info.uid, isAdmin: info.is_admin === true };
    }),
  };
}

function register(handle, deps) {
  const odoo = createOdoo(deps);
  handle("vdoo:odoo-status", () => odoo.status());
  handle("vdoo:odoo-save", async (_event, input) => {
    try { await odoo.save(input); return { ok: true, status: odoo.status() }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  handle("vdoo:odoo-connect", async (_event, password) => {
    try { return { ok: true, connection: await odoo.connect(password) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  return odoo;
}

module.exports = { createOdoo, register, DEFAULT_USER };
