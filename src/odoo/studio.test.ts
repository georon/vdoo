// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deserialize, emptySchema, isAppSchema, serialize } from "../model";
import { fromMermaid } from "../mermaid";
import { EXAMPLE } from "../example";
import { exampleApp } from "./exampleApp";
import { dependencies, fieldLine, generateAddon } from "./generateAddon";
import { validateApp } from "./validateApp";
import { conditionToDomain, formatCondition, parseCondition } from "./conditions";
import { appToSchema, schemaToApp } from "./convert";
import {
  type FormNode, addModel, addView, removeView, expressionNames, fieldNode, groupNode, insertNode, modelByName, moveNode, newApp, newField, removeField, renameInExpression, replaceField, viewOf, BODY,
} from "./studioModel";

const file = (app: ReturnType<typeof exampleApp>, path: string) => generateAddon(app).find((f) => f.path === path)?.content ?? "";

const python = (() => { try { execFileSync("python3", ["--version"]); return true; } catch { return false; } })();

describe("example app", () => {
  it("has no problems", () => expect(validateApp(exampleApp()).map((p) => p.message)).toEqual([]));

  it("generates the addon files in load order", () => {
    const paths = generateAddon(exampleApp()).map((f) => f.path);
    expect(paths).toEqual(["__manifest__.py", "__init__.py", "models/__init__.py", "models/x_purchase_request_line.py", "models/x_purchase_request_request.py",
      "security/ir.model.access.csv", "views/x_purchase_request_line_views.xml", "views/x_purchase_request_request_views.xml", "views/menus.xml"]);
    expect(file(exampleApp(), "__manifest__.py")).toContain('"depends": ["base", "mail"]');
    expect(file(exampleApp(), "__manifest__.py")).toContain('"version": "19.0.1.0"');
  });

  it("writes models with fields, smart button and button methods", () => {
    const code = file(exampleApp(), "models/x_purchase_request_request.py");
    expect(code).toContain('_name = "x_purchase_request.request"');
    expect(code).toContain('_inherit = ["mail.thread", "mail.activity.mixin"]');
    expect(code).toContain('state = fields.Selection([("draft", "Draft"), ("submitted", "Submitted"), ("approved", "Approved"), ("rejected", "Rejected")], string="Status", tracking=True, group_expand=True, default="draft")');
    expect(code).toContain('line_ids = fields.One2many("x_purchase_request.line", "request_id", string="Lines")');
    expect(code).toContain("user_id = fields.Many2one(\"res.users\", string=\"Requested by\", default=lambda self: self.env.user)");
    expect(code).toContain("request_date = fields.Date(string=\"Request date\", default=fields.Date.context_today)");
    expect(code).toContain("line_count = fields.Integer(");
    expect(code).toContain('def action_view_line(self):');
    expect(code).toContain('self.write({"state": "approved"})');
  });

  it("writes Odoo 17+ modifiers and adds fields the conditions need", () => {
    const xml = file(exampleApp(), "views/x_purchase_request_request_views.xml");
    expect(xml).toContain(`<button name="action_approve" type="object" string="Approve" class="btn-primary" invisible="state != 'submitted'"/>`);
    expect(xml).toContain(`<field name="partner_id" readonly="state != 'draft'" required="state == 'submitted'"/>`);
    expect(xml).toContain('<field name="state" widget="statusbar"');
    expect(xml).toContain("<chatter/>");
    expect(xml).toContain(`<list string="Purchase Request" decoration-danger="state == 'rejected'" decoration-success="state == 'approved'" decoration-muted="state == 'draft'">`);
    expect(xml).not.toContain("attrs=");
    expect(file(exampleApp(), "views/x_purchase_request_line_views.xml")).toContain('<list string="Request Line" editable="bottom">');
  });

  it("writes well-formed XML", () => {
    for (const f of generateAddon(exampleApp()).filter((x) => x.path.endsWith(".xml"))) {
      const doc = new DOMParser().parseFromString(f.content, "application/xml");
      expect(doc.querySelector("parsererror"), f.path).toBeNull();
    }
  });

  it.skipIf(!python)("writes Python that compiles", () => {
    const dir = mkdtempSync(join(tmpdir(), "vdoo-addon-"));
    try {
      for (const f of generateAddon(exampleApp())) { mkdirSync(dirname(join(dir, f.path)), { recursive: true }); writeFileSync(join(dir, f.path), f.content); }
      execFileSync("python3", ["-I", "-c", "import ast,sys,pathlib\nfor p in pathlib.Path(sys.argv[1]).rglob('*.py'): ast.parse(p.read_text(), str(p))", dir]);
      execFileSync("python3", ["-I", "-c", "import ast,sys; m=ast.literal_eval(open(sys.argv[1]).read()); assert m['data']", join(dir, "__manifest__.py")]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("uses tree and the old chatter for Odoo 17", () => {
    const app = { ...exampleApp(), odooVersion: "17.0" as const };
    const xml = file(app, "views/x_purchase_request_request_views.xml");
    expect(xml).toContain("<tree string=");
    expect(xml).toContain('<div class="oe_chatter">');
    expect(file(app, "views/menus.xml")).toContain("<field name=\"view_mode\">tree,form</field>");
  });

  it("writes menus parents first, and access rules", () => {
    const xml = file(exampleApp(), "views/menus.xml");
    expect(xml.indexOf('id="menu_root"')).toBeLessThan(xml.indexOf('parent="menu_root"'));
    expect(xml).toContain('model="ir.actions.act_window"');
    expect(file(exampleApp(), "security/ir.model.access.csv")).toContain("access_x_purchase_request_request_user,x_purchase_request.request.user,model_x_purchase_request_request,base.group_user,1,1,1,1");
  });

  it("round-trips through a .vdoo file", () => {
    const app = exampleApp();
    const schema = { ...emptySchema("Requests"), ...appToSchema(app), odoo: app };
    const text = serialize(schema);
    expect(JSON.parse(text).version).toBe(2);
    expect(deserialize(text)).toEqual(schema);
    expect(JSON.parse(serialize(emptySchema())).version).toBe(1);
  });

  it("still reads an app saved in a .vdoo file before .vdooapp existed", () => {
    const app = exampleApp();
    const legacy = JSON.stringify({ format: "vdoo", version: 2, name: "Requests", tables: [], relations: [], odoo: app });
    const read = deserialize(legacy);
    expect(isAppSchema(read)).toBe(true);
    expect(read.odoo?.technicalName).toBe(app.technicalName);
    expect(isAppSchema(emptySchema())).toBe(false);
  });
});

describe("kanban, calendar, pivot, graph and search views", () => {
  const views = () => file(exampleApp(), "views/x_purchase_request_request_views.xml");

  it("writes a kanban card for Odoo 19", () => {
    const xml = views();
    expect(xml).toContain('<kanban string="Purchase Request" default_group_by="state" quick_create="false" sample="1">');
    expect(xml).toContain('<field name="currency_id"/>');
    expect(xml).toContain('<t t-name="card">');
    expect(xml).toContain('<field name="name" class="fw-bold fs-5"/>');
    expect(xml).toContain('<field name="amount" widget="monetary"/>');
    expect(xml).toContain('<field name="user_id" widget="many2one_avatar_user" class="ms-auto"/>');
  });

  it("writes calendar, pivot and graph views", () => {
    const xml = views();
    expect(xml).toContain('<calendar string="Purchase Request" date_start="request_date" color="user_id" mode="month" quick_create="0">');
    expect(xml).toContain('<field name="partner_id" type="row"/>');
    expect(xml).toContain('<field name="state" type="col"/>');
    expect(xml).toContain('<field name="amount" type="measure"/>');
    expect(xml).toContain('<graph string="Purchase Request" type="bar" stacked="1" sample="1">');
  });

  it("writes the search view's filters as domains, each in its own group", () => {
    const xml = views();
    expect(xml).toContain(`<filter name="filter_my_requests" string="My requests" domain="[('user_id', '=', uid)]"/>`);
    expect(xml).toContain(`<filter name="filter_to_approve" string="To approve" domain="[('state', '=', 'submitted')]"/>`);
    expect(xml).toContain('<filter name="filter_request_date" string="Request date" date="request_date"/>');
    expect(xml.match(/<separator\/>/g)?.length).toBe(3);
    expect(xml).toContain(`<filter name="groupby_state" string="Status" context="{'group_by': 'state'}"/>`);
  });

  it("writes the views in a fixed order and lets the action open them", () => {
    const ids = [...views().matchAll(/<record id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["list", "form", "kanban", "calendar", "pivot", "graph", "search"].map((k) => `x_purchase_request_request_view_${k}`));
    expect(file(exampleApp(), "views/menus.xml")).toContain("<field name=\"view_mode\">list,form,kanban,calendar,pivot,graph</field>");
  });

  it("adds and removes views together with the action's view modes", () => {
    const app = exampleApp(), line = modelByName(app, "x_purchase_request.line")!;
    const added = addView(app, line.id, "kanban");
    expect(addView(added, line.id, "kanban")).toBe(added);
    const action = (a: typeof app) => a.actions.find((x) => x.modelId === line.id)!;
    expect(action(added).viewModes).toEqual(["list", "form", "kanban"]);
    const removed = removeView(added, viewOf(added, line.id, "kanban")!.id);
    expect(action(removed).viewModes).toEqual(["list", "form"]);
    expect(viewOf(removed, line.id, "kanban")).toBeUndefined();
  });

  it("clears a deleted field from every view", () => {
    const app = exampleApp(), m = modelByName(app, "x_purchase_request.request")!;
    const state = m.fields.find((f) => f.name === "state")!, date = m.fields.find((f) => f.name === "request_date")!;
    const next = removeField(removeField(app, m.id, state.id), m.id, date.id);
    expect(viewOf(next, m.id, "kanban")!.arch.groupByFieldId).toBe("");
    expect(viewOf(next, m.id, "kanban")!.arch.expandGroups).toBe(false);
    expect(viewOf(next, m.id, "calendar")!.arch.dateStartFieldId).toBe("");
    expect(viewOf(next, m.id, "pivot")!.arch.colFieldIds).toEqual([]);
    expect(viewOf(next, m.id, "search")!.arch.filters.map((f) => f.label)).toEqual(["My requests", "To approve"]);
    const messages = validateApp(next).map((p) => p.message);
    expect(messages).toContain("The calendar view of x_purchase_request.request needs a start date field.");
    expect(messages.some((x) => x.includes('filter "To approve" uses "state"'))).toBe(true);
  });

  it("carries a field rename into search filters", () => {
    const app = exampleApp(), m = modelByName(app, "x_purchase_request.request")!;
    const user = m.fields.find((f) => f.name === "user_id")!;
    const next = replaceField(app, m.id, { ...user, name: "requester_id" });
    expect(viewOf(next, m.id, "search")!.arch.filters[0].expr).toBe("requester_id == uid");
  });

  it("flags views Odoo can't default, wrong field types and older Odoo versions", () => {
    let app = exampleApp();
    const m = modelByName(app, "x_purchase_request.request")!;
    const name = m.fields.find((f) => f.name === "name")!;
    app = removeView(app, viewOf(app, m.id, "calendar")!.id);
    app = { ...app, actions: app.actions.map((a) => (a.modelId === m.id ? { ...a, viewModes: [...a.viewModes, "calendar" as const] } : a)) };
    const pivot = viewOf(app, m.id, "pivot")!;
    app = { ...app, views: app.views.map((v) => (v.id === pivot.id ? { ...pivot, arch: { ...pivot.arch, measureFieldIds: [name.id] } } : v)) };
    const messages = validateApp({ ...app, odooVersion: "17.0" }).map((p) => p.message);
    expect(messages.some((x) => x.startsWith('Action "Purchase Request" opens a calendar view'))).toBe(true);
    expect(messages).toContain("The pivot view of x_purchase_request.request: the measure must be a number, but name is char.");
    expect(messages).toContain("The kanban view of x_purchase_request.request is written for Odoo 19 and later. Set the app's Odoo version to 19.0.");
  });

  it("keeps an older app without the new views as it was", () => {
    const app = newApp("Old");
    const v1 = generateAddon(app).find((f) => f.path.endsWith("_views.xml"))!.content;
    const old = { ...app, views: app.views.filter((v) => v.type === "form" || v.type === "list") };
    expect(deserialize(serialize({ ...emptySchema("Old"), odoo: old })).odoo).toEqual(old);
    expect(v1).toContain("<search");
    expect(v1).not.toContain("<separator");
  });
});

describe("filter domains", () => {
  const fields = exampleApp().models[0].fields;
  it("joins with and by default and writes or in prefix notation", () => {
    expect(conditionToDomain("state == 'draft' and amount > 100", fields)).toBe("[('state', '=', 'draft'), ('amount', '>', 100)]");
    expect(conditionToDomain("state == 'draft' or state == 'submitted' or not partner_id", fields))
      .toBe("['|', '|', ('state', '=', 'draft'), ('state', '=', 'submitted'), ('partner_id', '=', False)]");
  });
  it("writes lists, set, uid and quotes", () => {
    expect(conditionToDomain("state in ['draft', 'submitted']", fields)).toBe("[('state', 'in', ['draft', 'submitted'])]");
    expect(conditionToDomain("partner_id", fields)).toBe("[('partner_id', '!=', False)]");
    expect(conditionToDomain("user_id == uid", fields)).toBe("[('user_id', '=', uid)]");
    expect(conditionToDomain(`name == "O'Brien"`, fields)).toBe("[('name', '=', 'O\\'Brien')]");
    expect(conditionToDomain("(a and b) or c", fields)).toBeNull();
    expect(conditionToDomain("", fields)).toBeNull();
  });
});

describe("editing", () => {
  it("carries a field rename into conditions and inverse names", () => {
    let app = exampleApp();
    const req = modelByName(app, "x_purchase_request.request")!, line = modelByName(app, "x_purchase_request.line")!;
    const state = req.fields.find((f) => f.name === "state")!;
    app = replaceField(app, req.id, { ...state, name: "stage" });
    expect(file(app, "views/x_purchase_request_request_views.xml")).toContain(`invisible="stage != 'submitted'"`);
    expect(validateApp(app)).toEqual([]);
    const back = line.fields.find((f) => f.name === "request_id")!;
    app = replaceField(app, line.id, { ...back, name: "parent_id" });
    expect(modelByName(app, req.name)!.fields.find((f) => f.name === "line_ids")!.inverseName).toBe("parent_id");
  });

  it("removes a field from every view", () => {
    let app = exampleApp();
    const req = modelByName(app, "x_purchase_request.request")!;
    app = removeField(app, req.id, req.fields.find((f) => f.name === "line_ids")!.id);
    expect(viewOf(app, req.id, "form")!.arch.smartButtons).toEqual([]);
    expect(validateApp(app)).toEqual([]);
  });

  it("finds problems", () => {
    let app = newApp("Shop");
    const m = app.models[0];
    app = { ...app, models: [{ ...m, fields: [...m.fields, newField({ name: "line_ids", ttype: "one2many", comodel: "x_shop.line" }), newField({ name: "create_date" })] }] };
    const messages = validateApp(app).map((p) => p.message).join("\n");
    expect(messages).toContain("needs the many2one field");
    expect(messages).toContain("Odoo adds");
  });

  it("moves form nodes without losing them", () => {
    const a = fieldNode("a"), b = fieldNode("b"), g = groupNode([]);
    let body: FormNode[] = [a, b, g];
    body = moveNode(body, a.id, g.id, 0);
    expect(body.map((n) => n.id)).toEqual([b.id, g.id]);
    body = moveNode(body, g.id, g.id, 0); // into itself: ignored
    expect(body.map((n) => n.id)).toEqual([b.id, g.id]);
    body = moveNode(body, b.id, BODY, 2);
    expect(body.map((n) => n.id)).toEqual([g.id, b.id]);
    expect(insertNode([], BODY, 5, a)).toEqual([a]);
  });

  it("names new models uniquely", () => {
    const app = addModel(addModel(newApp("Shop"), "Order").app, "Order").app;
    expect(app.models.map((m) => m.name)).toEqual(["x_shop.shop", "x_shop.order", "x_shop.order_2"]);
  });
});

describe("conditions", () => {
  const fields = exampleApp().models[0].fields;
  it("formats and parses rows", () => {
    const expr = formatCondition({ join: "and", rows: [{ field: "state", op: "!=", value: "draft" }, { field: "amount", op: ">", value: "1000" }] }, fields);
    expect(expr).toBe("state != 'draft' and amount > 1000");
    expect(parseCondition(expr)).toEqual({ join: "and", rows: [{ field: "state", op: "!=", value: "draft" }, { field: "amount", op: ">", value: "1000" }] });
    expect(parseCondition("state in ['a', 'b'] or not partner_id")).toEqual({ join: "or",
      rows: [{ field: "state", op: "in", value: "a, b" }, { field: "partner_id", op: "not set", value: "" }] });
    expect(parseCondition("(a and b) or c")).toBeNull();
  });
  it("finds and renames field names outside strings", () => {
    expect(expressionNames("state != 'draft and amount' and parent.x and amount > 0")).toEqual(["state", "amount"]);
    expect(renameInExpression("state == 'state' and states", "state", "stage")).toBe("stage == 'state' and states");
  });
});

describe("fields", () => {
  it("escapes strings", () => {
    expect(fieldLine(newField({ name: "x", string: 'Say "hi"\\', help: "a\nb" }))).toBe('x = fields.Char(string="Say \\"hi\\"\\\\", help="a\\nb")');
  });
  it("depends on the modules of comodels", () => {
    let app = newApp("Shop");
    app = { ...app, models: [{ ...app.models[0], fields: [newField({ name: "product_id", ttype: "many2one", comodel: "product.product" })] }], depends: ["web"] };
    expect(dependencies(app)).toEqual(["base", "product", "web"]);
  });
});

describe("diagram conversion", () => {
  it("derives tables, foreign keys and many2many tables", () => {
    const { tables, relations } = appToSchema(exampleApp());
    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(["x_purchase_request_request", "x_purchase_request_line", "res_partner", "res_users", "res_currency"]));
    const req = tables.find((t) => t.name === "x_purchase_request_request")!;
    expect(req.columns.map((c) => c.name)).not.toContain("line_ids");
    expect(relations.some((r) => r.label === "request_id")).toBe(true);
  });

  it("turns the example diagram into a valid app", () => {
    const app = schemaToApp({ ...fromMermaid(EXAMPLE), name: "Example shop" });
    expect(app.models.length).toBeGreaterThan(2);
    expect(app.models.some((m) => m.fields.some((f) => f.ttype === "many2one"))).toBe(true);
    expect(app.models.some((m) => m.fields.some((f) => f.ttype === "one2many"))).toBe(true);
    expect(validateApp(app).map((p) => p.message)).toEqual([]);
  });
});
