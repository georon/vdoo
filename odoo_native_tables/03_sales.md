# Sales

Quotations and sales orders (`sale_order`, `sale_order_line`), quotation templates, and the links to taxes and
invoice lines. Delivery and invoicing state is kept on each line (`qty_delivered`, `qty_invoiced`).

- **Diagram:** [03_sales.vdoo](03_sales.vdoo) (open it in vdoo)
- **Install:** `sale_management`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 4 tables, 3 many2many tables, 11 reference tables, 25 relationships

## How the data flows

1. A quotation (`state = 'draft'`, then `sent`) becomes a sales order on confirmation (`state = 'sale'`).
2. Three contacts per order: the customer (`partner_id`), the invoice address and the delivery address.
3. Lines hold product, quantity, unit and price; section and note lines are lines with a `display_type` and no product.
4. Invoicing links each order line to the invoice lines made from it in `sale_order_line_invoice_rel`; `qty_invoiced` and `invoice_status` are computed from them.
5. Delivered quantities come from stock moves when Inventory is installed (`stock_move.sale_line_id`, see 12_cross_app_links).

## Things to know

- Odoo 19 renamed the line unit field to `product_uom_id` (it was `product_uom`) and the line taxes to `tax_ids` (it was `tax_id`).
- The order's taxes are per line: `account_tax_sale_order_line_rel`.
- `analytic_distribution` is jsonb mapping analytic account ids to percentages, not a foreign key.

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`sale_order`](#sale_order) | `sale.order` | Sales Order | `sale` |
| [`sale_order_line`](#sale_order_line) | `sale.order.line` | Sales Order Line | `sale` |
| [`sale_order_template`](#sale_order_template) | `sale.order.template` | Quotation Template | `sale_management` |
| [`sale_order_template_line`](#sale_order_template_line) | `sale.order.template.line` | Quotation Template Line | `sale_management` |
| [`account_tax_sale_order_line_rel`](#account_tax_sale_order_line_rel) | many2many | `sale.order.line.tax_ids` ↔ `account.tax` | `sale` |
| [`sale_order_line_invoice_rel`](#sale_order_line_invoice_rel) | many2many | `sale.order.line.invoice_lines` ↔ `account.move.line` | `sale` |
| [`sale_order_tag_rel`](#sale_order_tag_rel) | many2many | `sale.order.tag_ids` ↔ `crm.tag` | `sale` |

Reference tables (only the columns this app uses; see their own diagrams): `res_partner`, `res_users`, `crm_team`, `product_product`, `uom_uom`, `product_pricelist`, `account_payment_term`, `account_fiscal_position`, `account_tax`, `account_move_line`, `crm_tag`.

### sale_order

`sale.order` — Sales Order.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Order Reference |
| `state` | varchar | yes |  | Status (draft \| sent \| sale \| cancel) |
| `partner_id` | int | no | `res_partner.id` | Customer |
| `partner_invoice_id` | int | no | `res_partner.id` | Invoice Address (computed, stored) |
| `partner_shipping_id` | int | no | `res_partner.id` | Delivery Address (computed, stored) |
| `date_order` | timestamp | no |  | Order Date |
| `validity_date` | date | yes |  | Expiration (computed, stored) |
| `user_id` | int | yes | `res_users.id` | Salesperson (computed, stored) |
| `team_id` | int | yes | `crm_team.id` | Sales Team (computed, stored) |
| `pricelist_id` | int | yes | `product_pricelist.id` | Pricelist (computed, stored) |
| `currency_id` | int | yes | `res_currency.id` ¹ | Currency (computed, stored) |
| `payment_term_id` | int | yes | `account_payment_term.id` | Payment Terms (computed, stored) |
| `fiscal_position_id` | int | yes | `account_fiscal_position.id` | Fiscal Position (computed, stored) |
| `sale_order_template_id` | int | yes | `sale_order_template.id` | Quotation Template (computed, stored) |
| `amount_untaxed` | numeric | yes |  | Untaxed Amount (computed, stored) |
| `amount_tax` | numeric | yes |  | Taxes (computed, stored) |
| `amount_total` | numeric | yes |  | Total (computed, stored) |
| `invoice_status` | varchar | yes |  | Invoice Status (upselling \| invoiced \| to invoice \| no; computed, stored) |
| `origin` | varchar | yes |  | Source Document |
| `client_order_ref` | varchar | yes |  | Customer Reference |
| `locked` | boolean | yes |  | Locked |
| `company_id` | int | no | `res_company.id` ¹ | Company |

### sale_order_line

`sale.order.line` — Sales Order Line.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `order_id` | int | no | `sale_order.id` | Order Reference |
| `sequence` | int | yes |  | Sequence |
| `display_type` | varchar | yes |  | Display type (line_section \| line_subsection \| line_note) |
| `product_id` | int | yes | `product_product.id` | Product |
| `name` | text | no |  | Description (computed, stored) |
| `product_uom_qty` | numeric | no |  | Quantity (computed, stored) |
| `product_uom_id` | int | yes | `uom_uom.id` | Unit (computed, stored) |
| `price_unit` | numeric | no |  | Unit Price (computed, stored) |
| `discount` | numeric | yes |  | Discount (%) (computed, stored) |
| `price_subtotal` | numeric | yes |  | Subtotal (computed, stored) |
| `price_total` | numeric | yes |  | Total (computed, stored) |
| `qty_delivered` | numeric | yes |  | Delivery Quantity (computed, stored) |
| `qty_invoiced` | numeric | yes |  | Invoiced Quantity (computed, stored) |
| `qty_to_invoice` | numeric | yes |  | Quantity To Invoice (computed, stored) |
| `invoice_status` | varchar | yes |  | Invoice Status (upselling \| invoiced \| to invoice \| no; computed, stored) |
| `is_downpayment` | boolean | yes |  | Is a down payment |
| `linked_line_id` | int | yes | `sale_order_line.id` | Linked Order Line |
| `analytic_distribution` | jsonb | yes |  | Analytic Distribution (computed, stored) |
| `state` | varchar | yes |  | Order Status (computed, stored) |

### sale_order_template

`sale.order.template` — Quotation Template.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Quotation Template |
| `number_of_days` | int | yes |  | Quotation Duration |
| `require_signature` | boolean | yes |  | Online Signature (computed, stored) |
| `require_payment` | boolean | yes |  | Online Payment (computed, stored) |
| `company_id` | int | yes | `res_company.id` ¹ | Company |
| `active` | boolean | yes |  | Active |

### sale_order_template_line

`sale.order.template.line` — Quotation Template Line.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `sale_order_template_id` | int | no | `sale_order_template.id` | Quotation Template Reference |
| `sequence` | int | yes |  | Sequence |
| `display_type` | varchar | yes |  | Display type (line_section \| line_subsection \| line_note) |
| `product_id` | int | yes | `product_product.id` | Product |
| `name` | jsonb | yes |  | Description (translated: one value per language) |
| `product_uom_qty` | numeric | no |  | Quantity |
| `product_uom_id` | int | yes | `uom_uom.id` | Unit (computed, stored) |

### account_tax_sale_order_line_rel

Many2many table of `sale.order.line.tax_ids` (Taxes). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `sale_order_line_id` | int | no | `sale_order_line.id` | sale.order.line id |
| `account_tax_id` | int | no | `account_tax.id` | account.tax id |

### sale_order_line_invoice_rel

Many2many table of `sale.order.line.invoice_lines` (Invoice Lines). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `order_line_id` | int | no | `sale_order_line.id` | sale.order.line id |
| `invoice_line_id` | int | no | `account_move_line.id` | account.move.line id |

### sale_order_tag_rel

Many2many table of `sale.order.tag_ids` (Tags). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `order_id` | int | no | `sale_order.id` | sale.order id |
| `tag_id` | int | no | `crm_tag.id` | crm.tag id |

¹ The referenced table is not drawn in this diagram.
