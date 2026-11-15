// @vitest-environment jsdom
// The Odoo diagrams in odoo_native_tables/ load cleanly, draw in Mermaid, and keep every key through the Mermaid text.
import { expect, test } from "vitest";
import mermaid from "mermaid";
import { deserialize, validate } from "./model";
import { fromMermaid, toMermaid } from "./mermaid";
const files = import.meta.glob<string>("../odoo_native_tables/*.vdoo", { query: "?raw", import: "default", eager: true });
for (const [file, source] of Object.entries(files)) {
  test(file.split("/").pop()!, async () => {
    const schema = deserialize(source);
    expect(validate(schema)).toEqual([]);
    const text = toMermaid(schema).text;
    await expect(mermaid.parse(text)).resolves.toBeTruthy();
    const keys = (s: typeof schema) => s.relations.map((r) => r.columns.map((p) => `${r.child}:${p.fk}->${p.ref}`).join()).sort();
    // with the previous schema (editing in the Mermaid tab) and without (pasting fresh text / an AI answer)
    expect(keys(fromMermaid(text, schema))).toEqual(keys(schema));
    const fresh = fromMermaid(text);
    const name = (s: typeof schema, tid: string, cid: string) => { const t = s.tables.find((x) => x.id === tid)!; return `${t.name}.${t.columns.find((c) => c.id === cid)?.name}`; };
    const named = (s: typeof schema) => s.relations.flatMap((r) => r.columns.map((p) => `${name(s, r.child, p.fk)}->${name(s, r.parent, p.ref)}`)).sort();
    expect(named(fresh)).toEqual(named(schema));
  });
}
