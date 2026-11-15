# Cross-app links

How the apps connect when they are installed together. These columns come from the small bridge modules Odoo
installs automatically (`sale_stock`, `purchase_stock`, `sale_crm`, `sale_project`, `sale_mrp`, `stock_account`,
`pos_sale`). Each table shows only the columns that link it to another app.

- **Diagram:** [12_cross_app_links.vdoo](12_cross_app_links.vdoo) (open it in vdoo)
- **Install:** `sale_crm`, `sale_stock`, `purchase_stock`, `sale_project`, `sale_mrp`, `stock_account`, `pos_sale`, `website_sale`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 14 tables, 1 many2many tables, 5 reference tables, 37 relationships

## How the data flows

1. CRM → Sales: a quotation made from an opportunity keeps `sale_order.opportunity_id`.
2. Sales → Inventory: confirming an order creates delivery moves with `stock_move.sale_line_id`; the transfer has `sale_id`.
3. Purchase → Inventory: confirming a purchase order creates receipt moves with `stock_move.purchase_line_id`.
4. Sales/Purchase → Accounting: customer invoice lines are linked to order lines in `sale_order_line_invoice_rel`; vendor bill lines carry `account_move_line.purchase_line_id`.
5. Inventory → Accounting: with automated valuation, a move's journal entry is `stock_move.account_move_id`.
6. Sales → Manufacturing: make-to-order manufactured products keep `mrp_production.sale_line_id`; the MO's component and finished moves are `raw_material_production_id` and `production_id`.
7. Sales → Project: selling a service that creates a task or project sets `sale_line_id` on it, so time can be invoiced.
8. Point of Sale → Sales/Accounting: a POS order can settle a sales order (`pos_order_line.sale_order_line_id`) and an invoiced POS order points to its invoice (`pos_order.account_move`).

## Things to know

- Bridge modules install themselves (`auto_install`) as soon as both apps they join are installed.
- Odoo 19 also ties sales orders, purchase orders and MOs to their moves through `stock_reference` (e.g. `stock_reference_sale_rel`), which replaced procurement groups.

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`crm_lead`](#crm_lead) | `crm.lead` | Lead | `crm` |
| [`sale_order`](#sale_order) | `sale.order` | Sales Order | `sale` |
| [`sale_order_line`](#sale_order_line) | `sale.order.line` | Sales Order Line | `sale` |
| [`purchase_order`](#purchase_order) | `purchase.order` | Purchase Order | `purchase` |
| [`purchase_order_line`](#purchase_order_line) | `purchase.order.line` | Purchase Order Line | `purchase` |
| [`stock_picking`](#stock_picking) | `stock.picking` | Transfer | `stock` |
| [`stock_move`](#stock_move) | `stock.move` | Stock Move | `stock` |
| [`mrp_production`](#mrp_production) | `mrp.production` | Manufacturing Order | `mrp` |
| [`account_move`](#account_move) | `account.move` | Journal Entry | `account` |
| [`account_move_line`](#account_move_line) | `account.move.line` | Journal Item | `account` |
| [`project_project`](#project_project) | `project.project` | Project | `project` |
| [`project_task`](#project_task) | `project.task` | Task | `project` |
| [`pos_order`](#pos_order) | `pos.order` | Point of Sale Orders | `point_of_sale` |
| [`pos_order_line`](#pos_order_line) | `pos.order.line` | Point of Sale Order Lines | `point_of_sale` |
| [`sale_order_line_invoice_rel`](#sale_order_line_invoice_rel) | many2many | `sale.order.line.invoice_lines` ↔ `account.move.line` | `sale` |

Reference tables (only the columns this app uses; see their own diagrams): `res_partner`, `product_product`, `stock_warehouse`, `stock_picking_type`, `website`.

### crm_lead

`crm.lead` — Lead.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Opportunity (computed, stored) |
| `partner_id` | int | yes | `res_partner.id` | Contact |

### sale_order

`sale.order` — Sales Order.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Order Reference |
| `partner_id` | int | no | `res_partner.id` | Customer |
| `opportunity_id` | int | yes | `crm_lead.id` | Opportunity |
| `warehouse_id` | int | yes | `stock_warehouse.id` | Warehouse (computed, stored) |
| `website_id` | int | yes | `website.id` | Website |

### sale_order_line

`sale.order.line` — Sales Order Line.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `order_id` | int | no | `sale_order.id` | Order Reference |
| `product_id` | int | yes | `product_product.id` | Product |

### purchase_order

`purchase.order` — Purchase Order.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Order Reference |
| `partner_id` | int | no | `res_partner.id` | Vendor |
| `picking_type_id` | int | no | `stock_picking_type.id` | Deliver To |

### purchase_order_line

`purchase.order.line` — Purchase Order Line.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `order_id` | int | no | `purchase_order.id` | Order Reference |
| `product_id` | int | yes | `product_product.id` | Product |

### stock_picking

`stock.picking` — Transfer.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Reference |
| `sale_id` | int | yes | `sale_order.id` | Sales Order (computed, stored) |
| `pos_order_id` | int | yes | `pos_order.id` | Pos order |
| `picking_type_id` | int | no | `stock_picking_type.id` | Operation Type |

### stock_move

`stock.move` — Stock Move.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `picking_id` | int | yes | `stock_picking.id` | Transfer |
| `product_id` | int | no | `product_product.id` | Product |
| `sale_line_id` | int | yes | `sale_order_line.id` | Sale Line |
| `purchase_line_id` | int | yes | `purchase_order_line.id` | Purchase Order Line |
| `production_id` | int | yes | `mrp_production.id` | Production Order for finished products |
| `raw_material_production_id` | int | yes | `mrp_production.id` | Production Order for components |
| `account_move_id` | int | yes | `account_move.id` | stock_move_id |

### mrp_production

`mrp.production` — Manufacturing Order.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Reference |
| `product_id` | int | no | `product_product.id` | Product (computed, stored) |
| `sale_line_id` | int | yes | `sale_order_line.id` | Origin sale order line |

### account_move

`account.move` — Journal Entry.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Number (computed, stored) |
| `move_type` | varchar | no |  | Type (entry \| out_invoice \| out_refund \| in_invoice \| in_refund \| out_receipt \| in_receipt) |
| `partner_id` | int | yes | `res_partner.id` | Partner |

### account_move_line

`account.move.line` — Journal Item.

Journal items. `balance` = debit − credit in company currency; `parent_state` copies the entry's state for fast queries.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `move_id` | int | no | `account_move.id` | Journal Entry |
| `product_id` | int | yes | `product_product.id` | Product |
| `purchase_line_id` | int | yes | `purchase_order_line.id` | Purchase Order Line |

### project_project

`project.project` — Project.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `sale_line_id` | int | yes | `sale_order_line.id` | Sales Order Item (computed, stored) |

### project_task

`project.task` — Task.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Title |
| `project_id` | int | yes | `project_project.id` | Project (computed, stored) |
| `sale_line_id` | int | yes | `sale_order_line.id` | Sales Order Item (computed, stored) |

### pos_order

`pos.order` — Point of Sale Orders.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Order Ref |
| `partner_id` | int | yes | `res_partner.id` | Customer |
| `account_move` | int | yes | `account_move.id` | Invoice |

### pos_order_line

`pos.order.line` — Point of Sale Order Lines.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `order_id` | int | no | `pos_order.id` | Order Ref |
| `product_id` | int | no | `product_product.id` | Product |
| `sale_order_line_id` | int | yes | `sale_order_line.id` | Source Sale Order Line |

### sale_order_line_invoice_rel

Many2many table of `sale.order.line.invoice_lines` (Invoice Lines). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `order_line_id` | int | no | `sale_order_line.id` | sale.order.line id |
| `invoice_line_id` | int | no | `account_move_line.id` | account.move.line id |

¹ The referenced table is not drawn in this diagram.
