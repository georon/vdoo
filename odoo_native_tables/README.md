# Odoo 19.0 native tables

ER diagrams of the database tables behind the main Odoo apps, one vdoo diagram per app, each with a guide.
The tables and columns were read from the Odoo 19.0 Community source (`~/projects/odoo`), with each app's
modules and their dependencies installed, so names, types and nullability match what the ORM creates.

| App | Diagram | Modules | Own tables¹ | Relationships |
|---|---|---|---|---|
| [Contacts, users and companies](00_contacts_core.md) | [00_contacts_core.vdoo](00_contacts_core.vdoo) | `contacts` | 15 | 28 |
| [Products, variants, units and pricelists](01_products.md) | [01_products.vdoo](01_products.vdoo) | `product` | 14 | 23 |
| [CRM](02_crm.md) | [02_crm.vdoo](02_crm.vdoo) | `crm` | 11 | 18 |
| [Sales](03_sales.md) | [03_sales.vdoo](03_sales.vdoo) | `sale_management` | 7 | 25 |
| [Purchase](04_purchase.md) | [04_purchase.vdoo](04_purchase.vdoo) | `purchase` | 4 | 17 |
| [Inventory: transfers, moves and stock](05_inventory_operations.md) | [05_inventory_operations.vdoo](05_inventory_operations.vdoo) | `stock` | 9 | 34 |
| [Inventory: warehouses, locations and routes](05_inventory_setup.md) | [05_inventory_setup.vdoo](05_inventory_setup.vdoo) | `stock` | 7 | 25 |
| [Accounting and invoicing](06_accounting.md) | [06_accounting.vdoo](06_accounting.vdoo) | `account` | 18 | 43 |
| [Project](07_project.md) | [07_project.vdoo](07_project.vdoo) | `project` | 13 | 28 |
| [Employees](08_employees.md) | [08_employees.vdoo](08_employees.vdoo) | `hr` | 11 | 26 |
| [Manufacturing](09_manufacturing.md) | [09_manufacturing.vdoo](09_manufacturing.vdoo) | `mrp` | 10 | 36 |
| [Point of Sale](10_point_of_sale.md) | [10_point_of_sale.vdoo](10_point_of_sale.vdoo) | `point_of_sale` | 10 | 32 |
| [Website and eCommerce](11_website_ecommerce.md) | [11_website_ecommerce.vdoo](11_website_ecommerce.vdoo) | `website_sale` | 11 | 25 |
| [Cross-app links](12_cross_app_links.md) | [12_cross_app_links.vdoo](12_cross_app_links.vdoo) | `sale_crm`, `sale_stock`, `purchase_stock`, `sale_project`, `sale_mrp`, `stock_account`, `pos_sale`, `website_sale` | 15 | 37 |
| [Calendar](13_calendar.md) | [13_calendar.vdoo](13_calendar.vdoo) | `calendar` | 12 | 23 |
| [To-do](14_todo.md) | [14_todo.vdoo](14_todo.vdoo) | `project_todo` | 6 | 11 |

¹ The app's tables including its many2many tables; reference copies of other apps' tables are not counted.

Open a `.vdoo` file in vdoo (File › Open, or the Files pane) to see the diagram; click a table or line to see its
columns and keys. Each guide (`.md`) explains how the data flows and lists every column shown with its meaning, and
can be exported to PDF from vdoo (File › Export as PDF).

## What the diagrams show

- **Important tables, important columns.** Odoo tables have many more columns (`account_move` has about 65, `sale_order` about 40). Each diagram
  keeps the columns that carry the app's structure: keys, states, dates, amounts and the fields people query.
- **Left out everywhere:** `create_uid`, `create_date`, `write_uid`, `write_date` (on every table), chatter and
  activity fields (`message_*`, `activity_*`), and one2many fields, which are not columns.
- **Reference tables** are tables owned by another diagram, shown with just the columns needed to read the links.
- **Foreign keys to tables outside a diagram** stay as columns; their comment names the target table.
- **Relationship labels** are the foreign key column names, so several links between two tables (an order's
  customer, invoice and delivery addresses) stay distinct.

## How Odoo maps models to tables

| Odoo | PostgreSQL |
|---|---|
| Model `sale.order` | Table `sale_order` (dots become underscores, unless the model sets `_table`) |
| Every model | `id serial` primary key |
| `Many2one` | `int` foreign key column (`ondelete`: `set null` by default, `cascade` for lines, `restrict`) |
| `Many2many` | A relation table with two `int` columns, named by `relation=` or `<table1>_<table2>_rel` (alphabetical) |
| `One2many` | Nothing: it is the reverse of a `Many2one` |
| `Char`, `Text`, `Html` | `varchar`, `text` — or `jsonb` when translated (one value per language, since Odoo 16) |
| Company-dependent fields | `jsonb`, one value per company (since Odoo 18; previously `ir_property`) |
| `Float` | `numeric` when it has digits, `double precision` (float8) otherwise; `Monetary` is `numeric` |
| `Selection` | `varchar` holding the key (the diagram comments list the keys) |
| `Binary`, `Image` | Not a column by default: stored in `ir_attachment` |
| Computed fields | A column only when `store=True` |
| `_inherits` (delegation) | A required `Many2one` to the parent row; the parent's fields are read through it (`res_users` → `res_partner`, `product_product` → `product_template`) |

In vdoo, a relationship drawn with a solid line is a required foreign key with `ondelete='cascade'` (a line that
belongs to its document); a dotted line is any other link. "Exactly one" on the parent side means the foreign key is
required, "zero or one" means it is optional.

## Regenerating

The diagrams and guides are generated from `tools/spec.py` (which tables and columns, and the explanations) and the
Odoo source:

```bash
python3 tools/generate.py                      # reads ~/projects/odoo
ODOO_SRC=/path/to/odoo python3 tools/generate.py
python3 tools/list_fields.py stock stock.picking   # every stored column of a model, to pick from
```

The generator stops if a column listed in the spec doesn't exist or isn't stored in that Odoo version. It overwrites
the `.vdoo` and `.md` files, so make lasting changes in `spec.py` (or save an edited diagram under another name).

## Limits

- Community edition only. Enterprise apps and fields (Accounting's `account_accountant`, Appointments, Studio,
  Field Service, Rental, Planning …) are not in the source used here.
- The diagrams show columns as the ORM defines them; database constraints added in SQL (unique indexes,
  check constraints) are not drawn.
