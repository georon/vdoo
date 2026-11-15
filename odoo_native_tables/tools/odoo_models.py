"""Static reader for Odoo model definitions (no Odoo runtime, no database).

Parses every addon's Python files with `ast` and collects, per model name, the class definitions that declare or
extend it, together with the module each one comes from. Field definitions are merged in module dependency order,
the way the ORM merges them, so a field's type, comodel and storage reflect the set of installed modules asked for.
"""
from __future__ import annotations

import ast
import os
from dataclasses import dataclass, field
from functools import lru_cache

FIELD_TYPES = {
    "Char", "Text", "Html", "Integer", "Float", "Monetary", "Boolean", "Date", "Datetime", "Selection", "Binary", "Image",
    "Many2one", "One2many", "Many2many", "Json", "Properties", "PropertiesDefinition", "Reference", "Many2oneReference",
}
# Positional arguments by field type, as the ORM reads them.
POSITIONAL = {
    "Many2one": ["comodel_name", "string"],
    "One2many": ["comodel_name", "inverse_name", "string"],
    "Many2many": ["comodel_name", "relation", "column1", "column2", "string"],
    "Selection": ["selection", "string"],
    "Reference": ["selection", "string"],
}


@dataclass
class FieldDef:
    name: str
    type: str
    module: str
    kwargs: dict = field(default_factory=dict)  # literal values only; anything else becomes True ("set")


@dataclass
class ModelClass:
    module: str
    name: str
    inherit: list[str]
    inherits: dict[str, str]
    table: str | None
    kind: str  # Model, AbstractModel, TransientModel
    auto: bool
    description: str | None
    fields: dict[str, FieldDef]


def _literal(node):
    try:
        return ast.literal_eval(node)
    except Exception:
        return True  # a lambda, a function name, a computed expression: "it is set"


def _class_attr(cls: ast.ClassDef, name: str):
    for stmt in cls.body:
        if isinstance(stmt, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in stmt.targets):
            return _literal(stmt.value)
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name) and stmt.target.id == name and stmt.value is not None:
            return _literal(stmt.value)
    return None


def _base_kind(cls: ast.ClassDef) -> str | None:
    for base in cls.bases:
        attr = base.attr if isinstance(base, ast.Attribute) else base.id if isinstance(base, ast.Name) else None
        if attr in ("Model", "AbstractModel", "TransientModel"):
            return attr
    return None


def _field_call(value: ast.AST):
    if not isinstance(value, ast.Call):
        return None
    func = value.func
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id == "fields" and func.attr in FIELD_TYPES:
        return func.attr
    return None


def _parse_field(name: str, ftype: str, call: ast.Call, module: str, constants: dict) -> FieldDef:
    # A selection is often a module-level constant (STATE = [...]); use its value when it is a literal.
    value = lambda node: constants[node.id] if isinstance(node, ast.Name) and node.id in constants else _literal(node)
    kwargs = {}
    names = POSITIONAL.get(ftype, ["string"])
    for i, arg in enumerate(call.args):
        if i < len(names):
            kwargs[names[i]] = value(arg)
    for kw in call.keywords:
        if kw.arg:
            kwargs[kw.arg] = value(kw.value)
    return FieldDef(name, ftype, module, kwargs)


def _constants(tree: ast.Module) -> dict:
    out = {}
    for stmt in tree.body:
        if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
            try:
                out[stmt.targets[0].id] = ast.literal_eval(stmt.value)
            except Exception:
                pass
    return out


def _parse_file(path: str, module: str) -> list[ModelClass]:
    try:
        tree = ast.parse(open(path, encoding="utf-8").read(), path)
    except (SyntaxError, UnicodeDecodeError):
        return []
    out = []
    constants = _constants(tree)
    local_kinds: dict[str, str] = {}  # a model class may subclass another model class of the same file
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        kind = _base_kind(node) or next((local_kinds[b.id] for b in node.bases if isinstance(b, ast.Name) and b.id in local_kinds), None)
        if not kind:
            continue
        local_kinds[node.name] = kind
        name, inherit = _class_attr(node, "_name"), _class_attr(node, "_inherit")
        inherit = [inherit] if isinstance(inherit, str) else list(inherit) if isinstance(inherit, (list, tuple)) else []
        if not isinstance(name, str):
            if len(inherit) == 1:
                name = inherit[0]
            else:
                continue
        fields_ = {}
        for stmt in node.body:
            # `name = fields.X(...)`, or annotated as Odoo 19 does for relational fields: `name: Model = fields.X(...)`
            if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
                target, value = stmt.targets[0], stmt.value
            elif isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name) and stmt.value is not None:
                target, value = stmt.target, stmt.value
            else:
                continue
            ftype = _field_call(value)
            if ftype:
                fields_[target.id] = _parse_field(target.id, ftype, value, module, constants)
        inherits = _class_attr(node, "_inherits")
        auto = _class_attr(node, "_auto")
        description = _class_attr(node, "_description")
        table = _class_attr(node, "_table")
        out.append(ModelClass(module, name, [i for i in inherit if i != name], inherits if isinstance(inherits, dict) else {},
                              table if isinstance(table, str) else None, kind, auto is not False,
                              description if isinstance(description, str) else None, fields_))
    return out


class Registry:
    """All model classes of the given addon roots, merged per model for a set of installed modules."""

    def __init__(self, roots: list[str]):
        self.manifests: dict[str, dict] = {}
        self.classes: dict[str, list[ModelClass]] = {}
        for root in roots:
            for module in sorted(os.listdir(root)):
                manifest = os.path.join(root, module, "__manifest__.py")
                if not os.path.isfile(manifest):
                    continue
                self.manifests[module] = ast.literal_eval(open(manifest, encoding="utf-8").read())
                for dirpath, _dirs, files in os.walk(os.path.join(root, module)):
                    if any(part in ("tests", "migrations", "upgrades", "static") for part in dirpath.split(os.sep)):
                        continue
                    for f in files:
                        if f.endswith(".py"):
                            for cls in _parse_file(os.path.join(dirpath, f), module):
                                self.classes.setdefault(cls.name, []).append(cls)

    @lru_cache(maxsize=None)
    def closure(self, modules: tuple[str, ...]) -> tuple[str, ...]:
        """The modules plus everything they depend on, dependencies first (the ORM's loading order)."""
        order: list[str] = []
        seen: set[str] = set()

        def visit(m: str):
            if m in seen:
                return
            seen.add(m)
            if m not in self.manifests:
                raise KeyError(f"Unknown module {m}")
            for dep in self.manifests[m].get("depends", []) or ["base"] if m != "base" else []:
                visit(dep)
            order.append(m)

        for m in modules:
            visit(m)
        return tuple(order)

    def model(self, name: str, installed: tuple[str, ...]) -> "Model":
        rank = {m: i for i, m in enumerate(installed)}
        classes = sorted((c for c in self.classes.get(name, []) if c.module in rank), key=lambda c: rank[c.module])
        if not classes:
            raise KeyError(f"Model {name} is not defined by the installed modules")
        return Model(self, name, classes, installed)


class Model:
    def __init__(self, registry: Registry, name: str, classes: list[ModelClass], installed: tuple[str, ...]):
        self.registry, self.name, self.classes, self.installed = registry, name, classes, installed
        first = classes[0]
        self.kind = first.kind
        self.auto = all(c.auto for c in classes)
        self.table = next((c.table for c in classes if c.table), None) or name.replace(".", "_")
        self.description = next((c.description for c in classes if c.description), None) or name
        self.module = first.module
        self.inherits: dict[str, str] = {}
        for c in classes:
            self.inherits.update(c.inherits)

    @property
    def parents(self) -> list[str]:
        out = []
        for c in self.classes:
            out += [p for p in c.inherit if p not in out]
        return out

    def field(self, fname: str) -> FieldDef | None:
        """The field merged over every definition: first the parents' (mixins), then this model's own classes."""
        merged: FieldDef | None = None
        for parent in self.parents:
            try:
                pf = self.registry.model(parent, self.installed).field(fname)
            except KeyError:
                pf = None
            if pf:
                merged = FieldDef(pf.name, pf.type, pf.module, dict(pf.kwargs))
        for c in self.classes:
            f = c.fields.get(fname)
            if f:
                if merged is None or f.type != merged.type:
                    merged = FieldDef(f.name, f.type, f.module, dict(f.kwargs))
                else:
                    added = f.kwargs.get("selection_add")
                    merged.kwargs.update(f.kwargs)
                    if isinstance(added, list):  # selection_add extends the values instead of replacing them
                        merged.kwargs["_selection_added"] = merged.kwargs.get("_selection_added", []) + added
        return merged
