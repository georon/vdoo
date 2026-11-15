"""Builds the vdoo ER diagrams (.vdoo) and their Markdown docs from spec.py and the Odoo source.

    python3 tools/generate.py                       # Odoo source in ~/projects/odoo
    ODOO_SRC=/path/to/odoo python3 tools/generate.py

Every table and column comes from the model definitions in the Odoo source, merged over the modules each app
installs. A field named in spec.py that does not exist, or is not stored as a column, stops the build.
"""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from columns import is_stored, m2m_table, sql_type  # noqa: E402
from odoo_models import FieldDef, Model, Registry  # noqa: E402
import spec  # noqa: E402

ODOO = os.environ.get("ODOO_SRC", os.path.expanduser("~/projects/odoo"))
OUT = os.path.dirname(HERE)


class SpecError(Exception):
    pass


def release(odoo: str) -> str:
    text = open(os.path.join(odoo, "odoo", "release.py"), encoding="utf-8").read()
    match = re.search(r"version_info = \((\d+), (\d+), (\d+), (\w+)", text)
    return f"{match.group(1)}.{match.group(2)}" if match else "unknown"


def comodel_of(registry: Registry, model: Model, f: FieldDef) -> str | None:
    """The comodel of a relational field, following `related` paths for related fields that don't name it."""
    name = f.kwargs.get("comodel_name")
    if isinstance(name, str):
        return name
    related = f.kwargs.get("related")
    if not isinstance(related, str):
        return None
    current = model
    for step in related.split("."):
        rf = current.field(step)
        if rf is None:
            return None
        target = comodel_of(registry, current, rf)
        if target is None:
            return None
        current = registry.model(target, model.installed)
    return current.name


def selection_keys(f: FieldDef) -> list[str]:
    keys = []
    for source in (f.kwargs.get("selection"), f.kwargs.get("_selection_added"), f.kwargs.get("selection_add")):
        if isinstance(source, list):
            keys += [str(item[0]) for item in source if isinstance(item, (list, tuple)) and item and str(item[0]) not in keys]
    return keys


def label_of(f: FieldDef) -> str:
    s = f.kwargs.get("string")
    return s if isinstance(s, str) else f.name.replace("_id", "").replace("_", " ").strip().capitalize()


def m2m_is_table(f: FieldDef) -> bool:
    k = f.kwargs
    return not ((k.get("compute") or k.get("related")) and k.get("store") is not True) and k.get("store") is not False


class Diagram:
    def __init__(self, registry: Registry, app: dict):
        self.registry, self.app = registry, app
        self.installed = registry.closure(tuple(app["modules"]))
        self.tables: list[dict] = []
        self.relations: list[dict] = []
        self.by_table: dict[str, dict] = {}
        self.docs: list[dict] = []  # per table, for the Markdown
        self.pending_fks: list[tuple] = []

    def model(self, name: str) -> Model:
        try:
            return self.registry.model(name, self.installed)
        except KeyError as e:
            raise SpecError(f"{self.app['slug']}: {e}") from None

    def field(self, model: Model, fname: str) -> FieldDef:
        f = model.field(fname)
        if f is None:
            raise SpecError(f"{self.app['slug']}: {model.name}.{fname} does not exist with modules {self.app['modules']}")
        return f

    def add_model(self, name: str, fields: list[str], reference: bool):
        model = self.model(name)
        if not model.auto:
            raise SpecError(f"{name} is an SQL view (_auto = False)")
        table = {"id": f"t_{model.table}", "name": model.table, "columns": [], "comment": ""}
        notes = [f"{model.name} — {model.description}"]
        if model.inherits:
            notes.append("delegates to " + ", ".join(f"{p} via {c}" for p, c in model.inherits.items()))
        if reference:
            notes.append(f"reference copy, details in {spec.HOME[name]}" if name in spec.HOME else "reference copy")
        table["comment"] = "; ".join(notes)
        table["columns"].append(self.column(table, "id", "serial", False, True, "Record id"))
        doc = {"table": model.table, "model": model.name, "description": model.description, "module": model.module,
               "inherits": model.inherits, "reference": reference, "columns": [{"name": "id", "type": "serial", "null": False, "ref": "", "meaning": "Record id"}]}
        for fname in fields:
            f = self.field(model, fname)
            if f.type == "Many2many" or f.type == "One2many":
                raise SpecError(f"{name}.{fname} is a {f.type}; list it under m2m (or leave it out)")
            if not is_stored(f):
                raise SpecError(f"{name}.{fname} is not stored in the database")
            ctype = sql_type(f)
            required = f.kwargs.get("required") is True
            notes = []
            target = None
            if f.type == "Many2one":
                target = comodel_of(self.registry, model, f)
                if target is None:
                    raise SpecError(f"{name}.{fname}: can't tell which model it points to")
                if ctype == "jsonb":
                    notes.append(f"one {target} id per company (company-dependent)")
                    target = None
            elif f.type in ("Char", "Text", "Html") and f.kwargs.get("translate"):
                notes.append("translated: one value per language")
            elif f.kwargs.get("company_dependent"):
                notes.append("company-dependent: one value per company")
            if f.type in ("Selection", "Reference"):
                keys = selection_keys(f)
                if keys:
                    notes.append(" | ".join(keys))
            if (f.kwargs.get("compute") or f.kwargs.get("related")) and f.kwargs.get("store") is True:
                notes.append("computed, stored")
            meaning = spec.LABELS.get(f"{name}.{fname}", label_of(f)) + (f" ({'; '.join(notes)})" if notes else "")
            col = self.column(table, fname, ctype, not required, False, meaning)
            table["columns"].append(col)
            doc["columns"].append({"name": fname, "type": ctype, "null": not required, "ref": "", "meaning": meaning,
                                   "target": target, "required": required, "ondelete": f.kwargs.get("ondelete"), "col": col})
            if target:
                self.pending_fks.append((table, col, target, required, f.kwargs.get("ondelete"), fname, doc["columns"][-1]))
        self.tables.append(table)
        self.by_table[model.name] = table
        self.docs.append(doc)

    def add_m2m(self, name: str, fname: str):
        model = self.model(name)
        f = self.field(model, fname)
        if f.type != "Many2many":
            raise SpecError(f"{name}.{fname} is not a Many2many")
        if not m2m_is_table(f):
            raise SpecError(f"{name}.{fname} is computed and not stored: there is no relation table")
        comodel = self.model(comodel_of(self.registry, model, f))
        rel, col1, col2 = m2m_table(model, f, comodel)
        if any(t["name"] == rel for t in self.tables):
            return  # the relation table is a model's own table, already in the diagram
        table = {"id": f"t_{rel}", "name": rel, "comment": f"many2many {name}.{fname} ↔ {comodel.name} ({label_of(f)})", "columns": []}
        c1 = self.column(table, col1, "int", False, True, f"{model.name} id")
        c2 = self.column(table, col2, "int", False, True, f"{comodel.name} id")
        table["columns"] += [c1, c2]
        self.tables.append(table)
        doc = {"table": rel, "model": None, "m2m": f"{name}.{fname}", "comodel": comodel.name, "description": label_of(f), "module": f.module,
               "inherits": {}, "reference": False, "columns": [
                   {"name": col1, "type": "int", "null": False, "ref": "", "meaning": f"{model.name} id", "col": c1, "target": name},
                   {"name": col2, "type": "int", "null": False, "ref": "", "meaning": f"{comodel.name} id", "col": c2, "target": comodel.name}]}
        self.docs.append(doc)
        self.pending_fks.append((table, c1, name, True, "cascade", col1, doc["columns"][0]))
        self.pending_fks.append((table, c2, comodel.name, True, "cascade", col2, doc["columns"][1]))

    @staticmethod
    def column(table: dict, name: str, ctype: str, nullable: bool, pk: bool, comment: str) -> dict:
        return {"id": f"{table['name']}.{name}", "name": name, "type": ctype, "pk": pk, "nullable": nullable and not pk, "unique": False, "comment": comment}

    def link(self):
        for table, col, target, required, ondelete, label, doc_col in self.pending_fks:
            parent = self.by_table.get(target)
            target_table = parent["name"] if parent else self.model(target).table
            doc_col["ref"] = f"{target_table}.id"
            if not parent:
                col["comment"] += f" → {target_table} (not in this diagram)"
                doc_col["ref"] += " ¹"
                continue
            self.relations.append({
                "id": f"r_{table['name']}_{col['name']}", "parent": parent["id"], "child": table["id"],
                "parentCard": "one" if required else "zeroOrOne", "childCard": "zeroOrMany",
                "identifying": bool(required and ondelete == "cascade"), "label": label,
                "columns": [{"fk": col["id"], "ref": f"{parent['name']}.id"}],
            })

    def build(self) -> dict:
        for name, fields in self.app["tables"].items():
            self.add_model(name, fields, reference=False)
        for name, fields in self.app.get("refs", {}).items():
            self.add_model(name, fields, reference=True)
        for name, fname in self.app.get("m2m", []):
            self.add_m2m(name, fname)
        self.link()
        return {"format": "vdoo", "version": 1, "name": self.app["title"], "tables": self.tables, "relations": self.relations}


def md_escape(text: str) -> str:
    return str(text).replace("|", "\\|").replace("\n", " ")


def markdown(app: dict, diagram: Diagram, version: str) -> str:
    d = diagram
    own = [doc for doc in d.docs if not doc["reference"] and doc["model"]]
    rels = [doc for doc in d.docs if doc.get("m2m")]
    refs = [doc for doc in d.docs if doc["reference"]]
    lines = [f"# {app['title']}", "", app["summary"].strip(), "",
             f"- **Diagram:** [{app['slug']}.vdoo]({app['slug']}.vdoo) (open it in vdoo)",
             f"- **Install:** {', '.join(f'`{m}`' for m in app['modules'])}",
             f"- **Source:** Odoo {version} Community, read from the model definitions with these modules and their dependencies installed",
             f"- **Size:** {len(own)} tables, {len(rels)} many2many tables, {len(refs)} reference tables, {len(d.relations)} relationships", ""]
    if app.get("flows"):
        lines += ["## How the data flows", ""] + [f"{i}. {flow}" for i, flow in enumerate(app["flows"], 1)] + [""]
    if app.get("notes"):
        lines += ["## Things to know", ""] + [f"- {note}" for note in app["notes"]] + [""]
    lines += ["## Tables", ""]
    lines += ["| Table | Model | What it holds | Defined in |", "|---|---|---|---|"]
    for doc in own:
        lines.append(f"| [`{doc['table']}`](#{doc['table']}) | `{doc['model']}` | {md_escape(doc['description'])} | `{doc['module']}` |")
    for doc in rels:
        lines.append(f"| [`{doc['table']}`](#{doc['table']}) | many2many | `{doc['m2m']}` ↔ `{doc['comodel']}` | `{doc['module']}` |")
    if refs:
        lines += ["", "Reference tables (only the columns this app uses; see their own diagrams): "
                  + ", ".join(f"`{doc['table']}`" for doc in refs) + "."]
    lines.append("")
    for doc in own + rels:
        lines += [f"### {doc['table']}", ""]
        if doc["model"]:
            lines.append(f"`{doc['model']}` — {doc['description']}." + (
                " Delegation inheritance: " + ", ".join(f"every row has a `{p}` row through `{c}`" for p, c in doc["inherits"].items()) + "." if doc["inherits"] else ""))
        else:
            lines.append(f"Many2many table of `{doc['m2m']}` ({doc['description']}). Both columns form the primary key.")
        extra = spec.TABLE_NOTES.get(doc["table"])
        if extra:
            lines += ["", extra]
        lines += ["", "| Column | Type | Null | References | Meaning |", "|---|---|---|---|---|"]
        for c in doc["columns"]:
            lines.append(f"| `{c['name']}` | {c['type']} | {'yes' if c['null'] else 'no'} | {('`' + c['ref'].replace(' ¹', '') + '`' + (' ¹' if c['ref'].endswith('¹') else '')) if c['ref'] else ''} | {md_escape(c['meaning'])} |")
        lines.append("")
    lines += ["¹ The referenced table is not drawn in this diagram.", ""]
    return "\n".join(lines)


def main():
    version = release(ODOO)
    registry = Registry([os.path.join(ODOO, "odoo", "addons"), os.path.join(ODOO, "addons")])
    index = []
    errors = []
    for app in spec.APPS:
        try:
            diagram = Diagram(registry, app)
            data = diagram.build()
        except SpecError as e:
            errors.append(str(e))
            continue
        with open(os.path.join(OUT, f"{app['slug']}.vdoo"), "w", encoding="utf-8") as fh:
            fh.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        with open(os.path.join(OUT, f"{app['slug']}.md"), "w", encoding="utf-8") as fh:
            fh.write(markdown(app, diagram, version))
        own = sum(1 for doc in diagram.docs if not doc["reference"])
        index.append((app, own, len(diagram.relations)))
        print(f"{app['slug']}: {len(data['tables'])} tables ({own} own), {len(data['relations'])} relationships")
    if errors:
        print("\n".join(["", "Spec errors:"] + errors), file=sys.stderr)
        sys.exit(1)
    with open(os.path.join(OUT, "README.md"), "w", encoding="utf-8") as fh:
        fh.write(spec.readme(version, index))


if __name__ == "__main__":
    main()
