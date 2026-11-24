// The condition builder's rows <-> an Odoo 17+ modifier expression such as `state != 'draft' and amount > 1000`.
// Only flat AND or OR lists of simple comparisons round-trip; anything else stays editable as raw code.
import type { OdooField } from "./studioModel";

export type Operator = "==" | "!=" | ">" | "<" | ">=" | "<=" | "set" | "not set" | "in" | "not in";
export const OPERATORS: { op: Operator; label: string }[] = [
  { op: "==", label: "is" }, { op: "!=", label: "is not" }, { op: ">", label: ">" }, { op: "<", label: "<" }, { op: ">=", label: "≥" }, { op: "<=", label: "≤" },
  { op: "set", label: "is set" }, { op: "not set", label: "is not set" }, { op: "in", label: "is one of" }, { op: "not in", label: "is none of" },
];
export const takesValue = (op: Operator) => op !== "set" && op !== "not set";

export interface ConditionRow { field: string; op: Operator; value: string }
export interface Condition { join: "and" | "or"; rows: ConditionRow[] }

const pyString = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** A value typed in the builder as a Python literal, using the field's type. */
export function literal(value: string, field: OdooField | undefined): string {
  const v = value.trim();
  if (field?.ttype === "boolean") return /^(true|1|yes)$/i.test(v) ? "True" : "False";
  if (field && ["integer", "float", "monetary"].includes(field.ttype) && /^-?\d+(\.\d+)?$/.test(v)) return v;
  if (field?.ttype === "many2one" && (/^\d+$/.test(v) || v === "uid")) return v;
  if (/^(True|False|None)$/.test(v)) return v;
  return pyString(v);
}

export function formatCondition(cond: Condition, fields: OdooField[]): string {
  const parts = cond.rows.filter((r) => r.field).map((r) => {
    const field = fields.find((f) => f.name === r.field);
    if (r.op === "set") return r.field;
    if (r.op === "not set") return `not ${r.field}`;
    if (r.op === "in" || r.op === "not in") {
      const items = r.value.split(",").map((s) => s.trim()).filter(Boolean).map((s) => literal(s, field));
      return `${r.field} ${r.op} [${items.join(", ")}]`;
    }
    return `${r.field} ${r.op} ${literal(r.value, field)}`;
  });
  return parts.join(` ${cond.join} `);
}

const unquote = (lit: string) => {
  const m = /^'((?:\\.|[^'\\])*)'$|^"((?:\\.|[^"\\])*)"$/.exec(lit.trim());
  return m ? (m[1] ?? m[2]).replace(/\\(.)/g, "$1") : lit.trim();
};

const COMPARISON = /^([a-z_]\w*)\s*(==|!=|>=|<=|>|<|not in|in)\s*(.+)$/;
/** Splits on a top-level ` and ` / ` or ` that is not inside a string or brackets. */
function splitTop(expr: string, word: "and" | "or"): string[] {
  const out: string[] = [];
  let depth = 0, quote = "", start = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; continue; }
    if (c === "'" || c === '"') quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && expr.startsWith(` ${word} `, i)) { out.push(expr.slice(start, i)); start = i + word.length + 2; i = start - 1; }
  }
  out.push(expr.slice(start));
  return out.map((s) => s.trim());
}

/** Reads an expression back into rows, or null when it is more than the builder can show. */
export function parseCondition(expr: string): Condition | null {
  const text = expr.trim();
  if (!text) return { join: "and", rows: [] };
  const ands = splitTop(text, "and"), ors = splitTop(text, "or");
  if (ands.length > 1 && ors.length > 1) return null;
  const join = ors.length > 1 ? "or" : "and";
  const rows: ConditionRow[] = [];
  for (const part of join === "or" ? ors : ands) {
    let m: RegExpExecArray | null;
    if (/^[a-z_]\w*$/.test(part)) rows.push({ field: part, op: "set", value: "" });
    else if ((m = /^not\s+([a-z_]\w*)$/.exec(part))) rows.push({ field: m[1], op: "not set", value: "" });
    else if ((m = COMPARISON.exec(part))) {
      const [, field, op, raw] = m;
      if (op === "in" || op === "not in") {
        const list = /^[[(](.*)[\])]$/.exec(raw.trim());
        if (!list) return null;
        rows.push({ field, op, value: list[1].split(",").map((s) => unquote(s)).filter(Boolean).join(", ") });
      } else if (/^('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|-?\d+(\.\d+)?|True|False|None|uid)$/.test(raw.trim()))
        rows.push({ field, op: op as Operator, value: unquote(raw) });
      else return null;
    } else return null;
  }
  return { join, rows };
}

/** "" → never, "True"/"1" → always, else a condition. */
export type ModifierMode = "never" | "always" | "when";
export const modifierMode = (expr: string): ModifierMode => (!expr.trim() || /^(False|0)$/.test(expr.trim()) ? "never" : /^(True|1)$/.test(expr.trim()) ? "always" : "when");

const DOMAIN_OP: Record<Operator, string> = { "==": "=", "!=": "!=", ">": ">", "<": "<", ">=": ">=", "<=": "<=", set: "!=", "not set": "=", in: "in", "not in": "not in" };

/**
 * The domain for a filter written as a condition, e.g. `state == 'draft' or user_id == uid` →
 * `['|', ('state', '=', 'draft'), ('user_id', '=', uid)]`. Null when the condition is more than the builder can read.
 */
export function conditionToDomain(expr: string, fields: OdooField[]): string | null {
  const cond = parseCondition(expr);
  if (!cond || !cond.rows.length) return null;
  const terms = cond.rows.map((r) => {
    const field = fields.find((f) => f.name === r.field);
    const value = !takesValue(r.op) ? "False"
      : r.op === "in" || r.op === "not in" ? `[${r.value.split(",").map((x) => x.trim()).filter(Boolean).map((x) => literal(x, field)).join(", ")}]`
        : literal(r.value, field);
    return `(${pyString(r.field)}, ${pyString(DOMAIN_OP[r.op])}, ${value})`;
  });
  const prefix = cond.join === "or" ? Array(terms.length - 1).fill("'|'") : [];
  return `[${[...prefix, ...terms].join(", ")}]`;
}
