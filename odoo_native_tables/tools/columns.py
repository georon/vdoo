"""How a merged Odoo field becomes a PostgreSQL column (or a many2many relation table), following the ORM's rules."""
from __future__ import annotations

from odoo_models import FieldDef, Model

SQL_TYPES = {
    "Char": "varchar", "Text": "text", "Html": "text", "Integer": "int", "Float": "numeric", "Monetary": "numeric",
    "Boolean": "boolean", "Date": "date", "Datetime": "timestamp", "Selection": "varchar", "Many2one": "int",
    "Json": "jsonb", "Properties": "jsonb", "PropertiesDefinition": "jsonb", "Reference": "varchar",
    "Many2oneReference": "int", "Binary": "bytea", "Image": "bytea",
}


def is_stored(f: FieldDef) -> bool:
    k = f.kwargs
    if f.type in ("One2many", "Many2many"):
        return False
    if k.get("store") is False:
        return False
    if (k.get("compute") or k.get("related")) and k.get("store") is not True:
        return False
    if f.type in ("Binary", "Image") and k.get("attachment", True) is not False:
        return False  # kept in ir_attachment
    return True


def sql_type(f: FieldDef) -> str:
    k = f.kwargs
    if k.get("company_dependent"):
        return "jsonb"  # one value per company, since Odoo 18
    if f.type in ("Char", "Text", "Html") and k.get("translate"):
        return "jsonb"  # one value per language, since Odoo 16
    if f.type == "Float" and "digits" not in k:
        return "float8"  # no precision: double precision
    return SQL_TYPES[f.type]


def m2m_table(model: Model, f: FieldDef, comodel: Model) -> tuple[str, str, str]:
    """(relation table, column for this model, column for the comodel), as the ORM names them when not given."""
    k = f.kwargs
    relation = k.get("relation") if isinstance(k.get("relation"), str) else None
    if not relation:
        a, b = sorted([model.table, comodel.table])
        relation = f"{a}_{b}_rel"
    col1 = k.get("column1") if isinstance(k.get("column1"), str) else f"{model.table}_id"
    col2 = k.get("column2") if isinstance(k.get("column2"), str) else f"{comodel.table}_id"
    return relation, col1, col2
