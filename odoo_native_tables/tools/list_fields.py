"""Lists a model's stored columns and many2many tables. Usage: python3 list_fields.py <module> <model> [<model>...]"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from odoo_models import Registry
from columns import is_stored, sql_type

ODOO = os.environ.get("ODOO_SRC", os.path.expanduser("~/projects/odoo"))
r = Registry([f"{ODOO}/odoo/addons", f"{ODOO}/addons"])
inst = r.closure(tuple(sys.argv[1].split(",")))
for name in sys.argv[2:]:
    try:
        m = r.model(name, inst)
    except KeyError as e:
        print("!!", e); continue
    names = []
    for c in [*m.classes]:
        names += [n for n in c.fields if n not in names]
    for p in m.parents:
        try:
            pm = r.model(p, inst)
            for c in pm.classes:
                names += [n for n in c.fields if n not in names]
        except KeyError:
            pass
    cols, m2m = [], []
    for n in names:
        f = m.field(n)
        if f.type == "Many2many":
            m2m.append(f"{n}->{f.kwargs.get('comodel_name')}")
        elif is_stored(f):
            t = sql_type(f)
            cols.append(f"{n}:{f.kwargs.get('comodel_name') if f.type == 'Many2one' else t}{'!' if f.kwargs.get('required') is True else ''}")
    print(f"## {name} [{m.table}] kind={m.kind} auto={m.auto} inherits={m.inherits} — {m.description}")
    print("  cols:", " ".join(cols))
    print("  m2m:", " ".join(m2m))
