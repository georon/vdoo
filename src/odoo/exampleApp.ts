// A small but complete app: purchase requests with lines and an approval flow. Opened from Studio › Example app, and used by the tests.
import {
  type OdooApp, addModel, addView, buttonNode, defaultForm, defaultList, fieldNode, groupNode, kanbanCardField, listColumn, newApp, newField, notebookNode, pageNode,
  replaceModel, replaceView, searchFilter, viewOf,
} from "./studioModel";

export function exampleApp(): OdooApp {
  let app = newApp("Purchase Requests", "Purchase Request");
  app = { ...app, technicalName: "x_purchase_request", summary: "Request, approve and track purchases", author: "vdoo" };
  const request = app.models[0];
  app = replaceModel(app, { ...request, name: "x_purchase_request.request" });
  const lineAdded = addModel(app, "Request Line", "x_purchase_request.line");
  app = lineAdded.app;
  // Lines open from the request, not from a menu of their own.
  const lineAction = app.actions.find((a) => a.modelId === lineAdded.model.id)!;
  app = { ...app, menus: app.menus.filter((m) => m.actionId !== lineAction.id) };

  const f = {
    name: request.fields[0],
    partner: newField({ name: "partner_id", string: "Vendor", ttype: "many2one", comodel: "res.partner", tracking: true }),
    user: newField({ name: "user_id", string: "Requested by", ttype: "many2one", comodel: "res.users", default: "user" }),
    date: newField({ name: "request_date", string: "Request date", ttype: "date", default: "today" }),
    currency: newField({ name: "currency_id", string: "Currency", ttype: "many2one", comodel: "res.currency", default: "currency" }),
    amount: newField({ name: "amount", string: "Amount", ttype: "monetary", tracking: true }),
    state: newField({ name: "state", string: "Status", ttype: "selection", default: "draft", tracking: true,
      selection: [["draft", "Draft"], ["submitted", "Submitted"], ["approved", "Approved"], ["rejected", "Rejected"]] }),
    reason: newField({ name: "reject_reason", string: "Reason for rejection", ttype: "text" }),
    lines: newField({ name: "line_ids", string: "Lines", ttype: "one2many", comodel: "x_purchase_request.line", inverseName: "request_id" }),
    notes: newField({ name: "notes", string: "Notes", ttype: "html" }),
  };
  const model = { ...app.models[0], chatter: true, order: "request_date desc, id desc", fields: Object.values(f) };
  app = replaceModel(app, model);

  const l = {
    request: newField({ name: "request_id", string: "Request", ttype: "many2one", comodel: "x_purchase_request.request", required: true, ondelete: "cascade" }),
    name: { ...lineAdded.model.fields[0], string: "Description" },
    qty: newField({ name: "quantity", string: "Quantity", ttype: "float", default: "1" }),
    price: newField({ name: "price_unit", string: "Unit price", ttype: "float" }),
  };
  const line = { ...app.models.find((m) => m.id === lineAdded.model.id)!, fields: Object.values(l) };
  app = replaceModel(app, line);

  const form = viewOf(app, model.id, "form")!;
  app = replaceView(app, { ...form, arch: {
    statusbarFieldId: f.state.id, titleFieldId: f.name.id,
    buttons: [
      buttonNode({ string: "Submit", method: "action_submit", invisible: "state != 'draft'", setField: { fieldId: f.state.id, value: "submitted" } }),
      buttonNode({ string: "Approve", method: "action_approve", invisible: "state != 'submitted'", setField: { fieldId: f.state.id, value: "approved" } }),
      buttonNode({ string: "Reject", method: "action_reject", primary: false, invisible: "state != 'submitted'", setField: { fieldId: f.state.id, value: "rejected" } }),
      buttonNode({ string: "Reset to draft", method: "action_draft", primary: false, invisible: "state not in ['rejected']", setField: { fieldId: f.state.id, value: "draft" } }),
    ],
    smartButtons: [{ id: "sb_lines", string: "Lines", icon: "fa-list", fieldId: f.lines.id }],
    body: [
      groupNode([
        groupNode([fieldNode(f.partner.id, { required: "state == 'submitted'", readonly: "state != 'draft'" }), fieldNode(f.user.id, { readonly: "True" })]),
        groupNode([fieldNode(f.date.id, { readonly: "state != 'draft'" }), fieldNode(f.amount.id, { readonly: "state != 'draft'" }), fieldNode(f.currency.id, { invisible: "True" })]),
      ]),
      { ...groupNode([fieldNode(f.reason.id, { required: "state == 'rejected'" })], "Rejection"), invisible: "state != 'rejected'" },
      notebookNode([pageNode("Lines", [fieldNode(f.lines.id, { nolabel: true, readonly: "state != 'draft'" })]), pageNode("Notes", [fieldNode(f.notes.id, { nolabel: true })])]),
    ],
  } });
  const list = viewOf(app, model.id, "list")!;
  app = replaceView(app, { ...list, arch: {
    editable: "", decorations: { success: "state == 'approved'", danger: "state == 'rejected'", muted: "state == 'draft'" },
    columns: [listColumn(f.name.id), listColumn(f.partner.id), listColumn(f.date.id), listColumn(f.user.id, { optional: "show" }),
      listColumn(f.amount.id, { sum: true }), listColumn(f.currency.id, { optional: "hide" }), listColumn(f.state.id, { widget: "badge" })],
  } });
  app = replaceView(app, { ...viewOf(app, line.id, "form")!, arch: defaultForm(line) });
  const lineList = viewOf(app, line.id, "list")!;
  app = replaceView(app, { ...lineList, arch: { ...defaultList(line), editable: "bottom", columns: [listColumn(l.name.id), listColumn(l.qty.id), listColumn(l.price.id)] } });
  // Kanban by status (every column shown), a calendar of request dates, spending by vendor, and filters for the search bar.
  for (const type of ["kanban", "calendar", "pivot", "graph", "search"] as const) app = addView(app, model.id, type);
  app = replaceView(app, { ...viewOf(app, model.id, "kanban")!, arch: { groupByFieldId: f.state.id, expandGroups: true, titleFieldId: f.name.id,
    cardFields: [kanbanCardField(f.partner.id), kanbanCardField(f.amount.id, "monetary")], tagsFieldId: "", avatarFieldId: f.user.id, priorityFieldId: "", quickCreate: false } });
  app = replaceView(app, { ...viewOf(app, model.id, "calendar")!, arch: { dateStartFieldId: f.date.id, dateStopFieldId: "", allDayFieldId: "", colorFieldId: f.user.id,
    mode: "month", quickCreate: false, popoverFieldIds: [f.partner.id, f.amount.id, f.state.id] } });
  app = replaceView(app, { ...viewOf(app, model.id, "pivot")!, arch: { rowFieldIds: [f.partner.id], colFieldIds: [f.state.id], measureFieldIds: [f.amount.id] } });
  app = replaceView(app, { ...viewOf(app, model.id, "graph")!, arch: { chart: "bar", stacked: true, groupFieldIds: [f.partner.id, f.state.id], measureFieldId: f.amount.id } });
  app = replaceView(app, { ...viewOf(app, model.id, "search")!, arch: { fieldIds: [f.name.id, f.partner.id, f.user.id],
    filters: [searchFilter({ label: "My requests", expr: "user_id == uid" }), searchFilter({ label: "To approve", expr: "state == 'submitted'" }),
      searchFilter({ label: "Request date", kind: "date", dateFieldId: f.date.id })],
    groupByFieldIds: [f.state.id, f.partner.id, f.user.id] } });
  return app;
}
