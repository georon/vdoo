// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import mermaid from "mermaid";
import { connect, deserialize, emptySchema, foreignKeysOf, newColumn, newTable, removeTable, replaceTable, serialize, validate, type Schema } from "./model";
import { fromMermaid, toMermaid } from "./mermaid";
import { toSql } from "./sql";

function shop(): Schema {
  let schema = emptySchema("Shop");
  const customer = { ...newTable(schema, "customer") };
  customer.columns.push(newColumn({ name: "email", type: "varchar(255)", unique: true, nullable: false, comment: "login \"name\"" }));
  schema = { ...schema, tables: [customer] };
  const order = newTable(schema, "orders");
  order.columns.push(newColumn({ name: "total", type: "decimal(10,2)", nullable: false }));
  schema = { ...schema, tables: [customer, order] };
  return connect(schema, customer.id, order.id).schema;
}

describe("model", () => {
  it("connect adds a foreign key column that references the primary key", () => {
    const schema = shop();
    const orders = schema.tables[1];
    const fk = orders.columns.find((c) => c.name === "customer_id");
    expect(fk).toMatchObject({ type: "int", nullable: false, pk: false });
    expect(schema.relations[0].columns).toEqual([{ fk: fk!.id, ref: schema.tables[0].columns[0].id }]);
    expect(foreignKeysOf(schema, orders).get(fk!.id)?.[0].parent?.name).toBe("customer");
    expect(validate(schema)).toEqual([]);
  });

  it("deleting a column or table drops what referenced it", () => {
    const schema = shop();
    const orders = schema.tables[1];
    const without = replaceTable(schema, { ...orders, columns: orders.columns.filter((c) => c.name !== "customer_id") });
    expect(without.relations[0].columns).toEqual([]);
    expect(removeTable(schema, schema.tables[0].id).relations).toEqual([]);
  });

  it("reports names, duplicates and mismatched key types", () => {
    const schema = shop();
    const orders = schema.tables[1];
    const bad = replaceTable(schema, { ...orders, name: "order items", columns: orders.columns.map((c) => (c.name === "customer_id" ? { ...c, type: "uuid" } : c)) });
    const problems = validate({ ...bad, tables: [...bad.tables, { ...bad.tables[0], id: "x" }] });
    expect(problems.join("\n")).toMatch(/order items/);
    expect(problems.join("\n")).toMatch(/more than one table named "customer"/);
    expect(problems.join("\n")).toMatch(/types differ/);
  });

  it("files round-trip and reject other JSON", () => {
    const schema = shop();
    expect(deserialize(serialize(schema))).toEqual(schema);
    expect(() => deserialize('{"tables":[]}')).toThrow(/isn't a vdoo schema/);
  });
});

describe("mermaid", () => {
  it("writes keys, comments, decimal types and relationship cardinality", () => {
    const { text, relationOrder } = toMermaid(shop());
    expect(text).toContain("int id PK");
    expect(text).toContain('varchar(255) email UK "login  name"');
    expect(text).toContain("decimal(10,2) total");
    expect(fromMermaid("erDiagram\n  A {\n    decimal(10-2) total\n  }\n").tables[0].columns[0].type).toBe("decimal(10,2)");
    expect(text).toContain("int customer_id FK");
    expect(text).toContain('customer ||..o{ orders : "has"');
    expect(relationOrder).toHaveLength(1);
  });

  it("Mermaid's own parser accepts the text vdoo writes", async () => {
    mermaid.initialize({ startOnLoad: false });
    await expect(mermaid.parse(toMermaid(shop()).text)).resolves.toBeTruthy();
  });

  it("reads its own output back with the same tables, keys and ids", () => {
    const schema = shop();
    const back = fromMermaid(toMermaid(schema).text, schema);
    expect(back.tables.map((t) => t.id)).toEqual(schema.tables.map((t) => t.id));
    expect(back.tables[1].columns.find((c) => c.name === "total")?.type).toBe("decimal(10,2)");
    expect(back.relations).toEqual(schema.relations);
  });

  it("reads hand-written diagrams: many side first, comments, identifying lines, entities without attributes", () => {
    const schema = fromMermaid(`---
title: Library
---
erDiagram
  %% books and loans
  BOOK {
    int id PK
    string title "Full title"
  }
  LOAN {
    int id PK
    int book_id FK
  }
  MEMBER
  LOAN }o--|| BOOK : "borrows"
  MEMBER ||--o{ LOAN : makes
`);
    expect(schema.tables.map((t) => t.name)).toEqual(["BOOK", "LOAN", "MEMBER"]);
    const [borrows, makes] = schema.relations;
    expect(borrows).toMatchObject({ parentCard: "one", childCard: "zeroOrMany", identifying: true, label: "borrows" });
    expect(schema.tables.find((t) => t.id === borrows.parent)?.name).toBe("BOOK");
    expect(borrows.columns).toHaveLength(1);
    expect(makes.columns).toEqual([]); // MEMBER has no key to match
    expect(schema.tables[0].columns[1].comment).toBe("Full title");
  });

  it("matches Odoo-style keys: prefixed table names, and labels that name the column", () => {
    const schema = fromMermaid(`erDiagram
  res_partner {
    serial id PK
  }
  res_users {
    serial id PK
  }
  sale_order {
    serial id PK
    int partner_id FK
    int partner_invoice_id FK
    int user_id FK
  }
  sale_order_line {
    serial id PK
    int order_id FK
  }
  res_partner ||..o{ sale_order : partner_id
  res_partner ||..o{ sale_order : "invoice address (partner_invoice_id)"
  res_users |o..o{ sale_order : salesperson
  sale_order ||--o{ sale_order_line : lines
`);
    const col = (table: string, id: string) => schema.tables.find((t) => t.name === table)!.columns.find((c) => c.id === id)!.name;
    const keys = schema.relations.map((r) => r.columns.map((p) => col(schema.tables.find((t) => t.id === r.child)!.name, p.fk)));
    expect(keys).toEqual([["partner_id"], ["partner_invoice_id"], ["user_id"], ["order_id"]]);
  });

  it("keeps keys it can't infer when the text is applied again", () => {
    let schema = emptySchema("Odd");
    const account = { ...newTable(schema, "ledger") };
    const entry = { ...newTable(schema, "entry"), columns: [...newTable(schema, "entry").columns, newColumn({ name: "debit_account", type: "int" }), newColumn({ name: "credit_account", type: "int" })] };
    schema = { ...schema, tables: [account, entry], relations: [
      { id: "r1", parent: account.id, child: entry.id, parentCard: "one", childCard: "zeroOrMany", identifying: false, label: "debit", columns: [{ fk: entry.columns[1].id, ref: account.columns[0].id }] },
      { id: "r2", parent: account.id, child: entry.id, parentCard: "one", childCard: "zeroOrMany", identifying: false, label: "credit", columns: [{ fk: entry.columns[2].id, ref: account.columns[0].id }] },
    ] };
    const again = fromMermaid(toMermaid(schema).text, schema);
    expect(again.relations.map((r) => [r.id, r.label, r.columns])).toEqual(schema.relations.map((r) => [r.id, r.label, r.columns]));
  });

  it("keeps table highlights through files and Mermaid text", async () => {
    const base = shop();
    const schema = { ...base, tables: base.tables.map((t, i) => (i === 0 ? { ...t, color: "#4dabf7" } : t)) };
    expect(deserialize(serialize(schema)).tables.map((t) => t.color)).toEqual(["#4dabf7", ""]);
    expect(deserialize(serialize(schema).replace("#4dabf7", "javascript:x")).tables[0].color).toBe("");
    const { text } = toMermaid(schema);
    expect(text).toContain("style customer fill:#4dabf747");
    await expect(mermaid.parse(text)).resolves.toBeTruthy();
    expect(fromMermaid(text).tables.map((t) => t.color)).toEqual(["#4dabf7", ""]);
    // text without any style line (an AI answer) keeps the highlights; text with style lines decides them
    const plain = toMermaid(base).text;
    expect(fromMermaid(plain, schema).tables.map((t) => t.color)).toEqual(["#4dabf7", ""]);
    expect(fromMermaid(plain + "  style orders fill:#40c05747\n", schema).tables.map((t) => t.color)).toEqual(["", "#40c057"]);
  });

  it("points at the line it can't read", () => {
    expect(() => fromMermaid("erDiagram\n  A {\n    not valid at all here\n  }")).toThrow(/Line 3/);
    expect(() => fromMermaid("graph TD\n A-->B")).toThrow(/starts with erDiagram/);
  });
});

describe("sql", () => {
  it("creates tables with keys and the foreign key constraint", () => {
    const sql = toSql(shop());
    expect(sql).toContain('CREATE TABLE "customer"');
    expect(sql).toContain('"email" varchar(255) NOT NULL UNIQUE');
    expect(sql).toContain('PRIMARY KEY ("id")');
    expect(sql).toMatch(/FOREIGN KEY \("customer_id"\) REFERENCES "customer" \("id"\);/);
  });
});
