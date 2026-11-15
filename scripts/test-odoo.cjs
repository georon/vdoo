// Tests for the Odoo connection (electron/odoo.cjs) against a stand-in server. Run with: node --test scripts/test-odoo.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createOdoo } = require("../electron/odoo.cjs");

/** An Odoo stand-in: `server` answers each JSON-RPC route; `where` is what the address resolves to. */
function setup({ server = {}, where = { local: false, allLocal: false, addresses: ["203.0.113.9"] }, allowLocal = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vdoo-odoo-"));
  const file = (name) => path.join(dir, name);
  const calls = [], asked = [];
  const odoo = createOdoo({
    file,
    writeAtomic: (name, contents) => fs.writeFileSync(file(name), contents),
    resolve: async (url) => { if (where === null) throw new Error("no such host"); return { origin: url.origin, ...where }; },
    confirmLocal: async (url, addresses) => { asked.push({ host: url.host, addresses }); return allowLocal; },
    fetch: async (url, options, local) => {
      const route = new URL(url).pathname, params = JSON.parse(options.body).params;
      calls.push({ url, route, params, local, options });
      const answer = server[route];
      if (answer === undefined) return new Response("<html>Not found</html>", { status: 404 });
      const body = typeof answer === "function" ? answer(params) : answer;
      if (body instanceof Error) throw body;
      return typeof body === "string" ? new Response(body) : Response.json({ jsonrpc: "2.0", id: 1, ...body });
    },
  });
  return { odoo, calls, asked, saved: () => JSON.parse(fs.readFileSync(file("odoo.json"), "utf8")), done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const denied = { error: { code: 200, message: "Odoo Server Error", data: { name: "odoo.exceptions.AccessDenied", message: "Access Denied" } } };
const session = (params) => params.password === "secret"
  ? { result: { uid: 2, is_admin: true, db: params.db, name: "Mitchell Admin", username: params.login, server_version: "19.0" } } : denied;
const fails = (promise, pattern) => assert.rejects(promise, (error) => { assert.match(error.message, pattern); return true; });

test("settings default to admin and are saved without a password", async () => {
  const t = setup();
  try {
    assert.deepEqual(t.odoo.status(), { configured: false, url: "", user: "admin", database: "" });
    await t.odoo.save({ url: " https://erp.example.com/ ", user: "", database: "" });
    assert.deepEqual(t.odoo.status(), { configured: true, url: "https://erp.example.com", user: "admin", database: "" });
    await t.odoo.save({ url: "https://erp.example.com", user: "ops@example.com", database: "prod" });
    assert.deepEqual(t.odoo.status(), { configured: true, url: "https://erp.example.com", user: "ops@example.com", database: "prod" });
    assert.deepEqual(Object.keys(t.saved()).sort(), ["database", "local", "url", "user"]);
    assert.equal(t.calls.length, 0, "saving sends nothing");
  } finally { t.done(); }
});

test("an address or name that can't be used is refused", async () => {
  const t = setup();
  try {
    for (const url of ["", "erp.example.com", "ftp://erp.example.com", "https://user:pw@erp.example.com", "https://erp.example.com/?db=x"]) {
      await fails(t.odoo.save({ url, user: "admin", database: "" }), /Enter the Odoo URL/);
    }
    await fails(t.odoo.save({ url: "https://erp.example.com", user: "a\nb", database: "" }), /user name/);
    await fails(t.odoo.save({ url: "https://erp.example.com", user: "admin", database: "my db" }), /database name/);
    assert.equal(t.odoo.status().configured, false);
    await fails(t.odoo.connect("secret"), /Odoo URL in Settings/);
  } finally { t.done(); }
});

test("connecting signs in with the saved user and the server's only database", async () => {
  const t = setup({ server: { "/web/database/list": { result: ["odoo"] }, "/web/session/authenticate": session } });
  try {
    await t.odoo.save({ url: "https://erp.example.com", user: "", database: "" });
    assert.deepEqual(await t.odoo.connect("secret"),
      { version: "19.0", database: "odoo", user: "Mitchell Admin", login: "admin", uid: 2, isAdmin: true });
    assert.deepEqual(t.calls.map((c) => c.route), ["/web/database/list", "/web/session/authenticate"]);
    assert.deepEqual(t.calls[1].params, { db: "odoo", login: "admin", password: "secret" });
    assert.equal(t.calls[1].url, "https://erp.example.com/web/session/authenticate");
    assert.equal(t.calls[1].options.credentials, "omit");
    assert.equal(t.calls[1].options.redirect, "error");
    assert.equal(JSON.stringify(t.saved()).includes("secret"), false, "the password is not written to the settings file");
    assert.deepEqual(t.asked, [], "a public address needs no approval");
  } finally { t.done(); }
});

test("a set database is used without listing; a wrong password and an unknown database are explained", async () => {
  const t = setup({ server: { "/web/session/authenticate": (params) => params.db === "prod" ? session(params)
    : { error: { data: { name: "odoo.exceptions.AccessError", message: "Database not found." } } } } });
  try {
    await t.odoo.save({ url: "https://erp.example.com", user: "ops", database: "prod" });
    assert.equal((await t.odoo.connect("secret")).database, "prod");
    assert.deepEqual(t.calls.map((c) => c.route), ["/web/session/authenticate"]);
    await fails(t.odoo.connect("wrong"), /erp\.example\.com rejected this user name or password/);
    await fails(t.odoo.connect(""), /Enter the password/);
    await t.odoo.save({ url: "https://erp.example.com", user: "ops", database: "gone" });
    await fails(t.odoo.connect("secret"), /no database named gone/);
  } finally { t.done(); }
});

test("several databases, a hidden list and two-factor accounts are explained", async () => {
  const many = setup({ server: { "/web/database/list": { result: ["live", "test"] } } });
  const hidden = setup({ server: { "/web/database/list": denied } });
  const twoFactor = setup({ server: { "/web/database/list": { result: ["odoo"] }, "/web/session/authenticate": { result: { uid: null } } } });
  try {
    for (const t of [many, hidden, twoFactor]) await t.odoo.save({ url: "https://erp.example.com", user: "", database: "" });
    await fails(many.odoo.connect("secret"), /several databases \(live, test\)/);
    await fails(hidden.odoo.connect("secret"), /doesn't list its databases/);
    await fails(twoFactor.odoo.connect("secret"), /two-factor/);
  } finally { many.done(); hidden.done(); twoFactor.done(); }
});

test("a server that is down, missing or not Odoo is reported as such", async () => {
  const down = setup({ server: { "/web/session/authenticate": new Error("ECONNREFUSED") } });
  const other = setup({ server: { "/web/session/authenticate": "<html>Welcome to nginx</html>" } });
  const missing = setup();
  const unknown = setup({ where: null });
  try {
    for (const t of [down, other, missing, unknown]) await t.odoo.save({ url: "https://erp.example.com", user: "", database: "db" });
    await fails(down.odoo.connect("secret"), /Couldn't reach erp\.example\.com/);
    await fails(other.odoo.connect("secret"), /didn't answer like an Odoo server\./);
    await fails(missing.odoo.connect("secret"), /didn't answer like an Odoo server \(HTTP 404\)/);
    await fails(unknown.odoo.connect("secret"), /Couldn't find erp\.example\.com/);
    assert.equal(unknown.calls.length, 0);
  } finally { down.done(); other.done(); missing.done(); unknown.done(); }
});

test("a local server is asked about once, and plain http never leaves the local network", async () => {
  const local = { local: true, allLocal: true, addresses: ["127.0.0.1"] };
  const t = setup({ where: local, server: { "/web/session/authenticate": session } });
  const refused = setup({ where: local, allowLocal: false });
  const remote = setup();
  try {
    await t.odoo.save({ url: "http://localhost:8069", user: "", database: "odoo" });
    await t.odoo.connect("secret");
    await t.odoo.connect("secret");
    assert.deepEqual(t.asked, [{ host: "localhost:8069", addresses: ["127.0.0.1"] }], "asked on the first connection only");
    assert.deepEqual(t.calls[0].local, { origin: "http://localhost:8069", addresses: ["127.0.0.1"] });
    await t.odoo.save({ url: "http://localhost:8070", user: "", database: "odoo" });
    assert.equal(t.saved().local, null, "a new address needs a new approval");

    await refused.odoo.save({ url: "http://localhost:8069", user: "", database: "odoo" });
    await fails(refused.odoo.connect("secret"), /didn't connect to localhost:8069/);
    assert.equal(refused.calls.length, 0, "nothing is sent without approval");

    await remote.odoo.save({ url: "http://erp.example.com", user: "", database: "odoo" });
    await fails(remote.odoo.connect("secret"), /Use an https:\/\/ address/);
    assert.equal(remote.calls.length, 0, "the password is not sent over plain http to a public address");
  } finally { t.done(); refused.done(); remote.done(); }
});
