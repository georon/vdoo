# Purchase

Requests for quotation and purchase orders (`purchase_order`, `purchase_order_line`) and vendor prices
(`product_supplierinfo`). Vendor bill lines point back to the purchase line they bill.

- **Diagram:** [04_purchase.vdoo](04_purchase.vdoo) (open it in vdoo)
- **Install:** `purchase`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 3 tables, 1 many2many tables, 8 reference tables, 17 relationships

## How the data flows

1. An RFQ (`state = 'draft'`, then `sent`) becomes a purchase order on confirmation (`state = 'purchase'`).
2. Vendor prices in `product_supplierinfo` propose the vendor, price and lead time (`delay`) for a product and quantity.
3. Receipts update `qty_received`; with Inventory these come from stock moves (`stock_move.purchase_line_id`, module `purchase_stock`).
4. Each vendor bill line references its purchase line in `account_move_line.purchase_line_id`, which drives `qty_invoiced`.

## Things to know

- Odoo 19 uses `product_uom_id` and `tax_ids` on purchase lines (they were `product_uom` and `taxes_id`).
- Purchase agreements (blanket orders, calls for tender) are the separate `purchase_requisition` module.

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`purchase_order`](#purchase_order) | `purchase.order` | Purchase Order | `purchase` |
| [`purchase_order_line`](#purchase_order_line) | `purchase.order.line` | Purchase Order Line | `purchase` |
| [`product_supplierinfo`](#product_supplierinfo) | `product.supplierinfo` | Supplier Pricelist | `product` |
| [`account_tax_purchase_order_line_rel`](#account_tax_purchase_order_line_rel) | many2many | `purchase.order.line.tax_ids` ↔ `account.tax` | `purchase` |

Reference tables (only the columns this app uses; see their own diagrams): `res_partner`, `res_users`, `product_product`, `product_template`, `uom_uom`, `account_payment_term`, `account_tax`, `account_move_line`.

### purchase_order

`purchase.order` — Purchase Order.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Order Reference |
| `state` | varchar | yes |  | Status (draft \| sent \| to approve \| purchase \| cancel) |
| `partner_id` | int | no | `res_partner.id` | Vendor |
| `partner_ref` | varchar | yes |  | Vendor Reference |
| `dest_address_id` | int | yes | `res_partner.id` | Dropship Address |
| `date_order` | timestamp | no |  | Order Deadline |
| `date_approve` | timestamp | yes |  | Confirmation Date |
| `date_planned` | timestamp | yes |  | Expected Arrival (computed, stored) |
| `user_id` | int | yes | `res_users.id` | Buyer |
| `currency_id` | int | no | `res_currency.id` ¹ | Currency (computed, stored) |
| `payment_term_id` | int | yes | `account_payment_term.id` | Payment Terms |
| `fiscal_position_id` | int | yes | `account_fiscal_position.id` ¹ | Fiscal Position |
| `incoterm_id` | int | yes | `account_incoterms.id` ¹ | Incoterm |
| `amount_untaxed` | numeric | yes |  | Untaxed Amount (computed, stored) |
| `amount_tax` | numeric | yes |  | Taxes (computed, stored) |
| `amount_total` | numeric | yes |  | Total (computed, stored) |
| `invoice_status` | varchar | yes |  | Billing Status (no \| to invoice \| invoiced; computed, stored) |
| `origin` | varchar | yes |  | Source |
| `locked` | boolean | yes |  | Locked |
| `company_id` | int | no | `res_company.id` ¹ | Company |

### purchase_order_line

`purchase.order.line` — Purchase Order Line.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `order_id` | int | no | `purchase_order.id` | Order Reference |
| `sequence` | int | yes |  | Sequence |
| `display_type` | varchar | yes |  | Display type (line_section \| line_subsection \| line_note) |
| `product_id` | int | yes | `product_product.id` | Product |
| `name` | text | no |  | Description (computed, stored) |
| `product_qty` | numeric | no |  | Quantity |
| `product_uom_id` | int | yes | `uom_uom.id` | Unit |
| `price_unit` | numeric | no |  | Unit Price (computed, stored) |
| `discount` | numeric | yes |  | Discount (%) (computed, stored) |
| `price_subtotal` | numeric | yes |  | Subtotal (computed, stored) |
| `price_total` | numeric | yes |  | Total (computed, stored) |
| `date_planned` | timestamp | yes |  | Expected Arrival (computed, stored) |
| `qty_received_method` | varchar | yes |  | Received Qty Method (manual; computed, stored) |
| `qty_received` | numeric | yes |  | Received Qty (computed, stored) |
| `qty_invoiced` | numeric | yes |  | Billed Qty (computed, stored) |
| `qty_to_invoice` | numeric | yes |  | To Invoice Quantity (computed, stored) |
| `analytic_distribution` | jsonb | yes |  | Analytic Distribution (computed, stored) |
| `company_id` | int | yes | `res_company.id` ¹ | Company (computed, stored) |

### product_supplierinfo

`product.supplierinfo` — Supplier Pricelist.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `partner_id` | int | no | `res_partner.id` | Vendor |
| `product_tmpl_id` | int | no | `product_template.id` | Product Template (computed, stored) |
| `product_id` | int | yes | `product_product.id` | Product Variant (computed, stored) |
| `product_name` | varchar | yes |  | Vendor Product Name |
| `product_code` | varchar | yes |  | Vendor Product Code |
| `min_qty` | numeric | no |  | Quantity |
| `price` | numeric | yes |  | Unit Price |
| `discount` | numeric | yes |  | Discount (%) |
| `currency_id` | int | no | `res_currency.id` ¹ | Currency |
| `delay` | int | no |  | Lead Time |
| `date_start` | date | yes |  | Start Date |
| `date_end` | date | yes |  | End Date |
| `company_id` | int | yes | `res_company.id` ¹ | Company |

### account_tax_purchase_order_line_rel

Many2many table of `purchase.order.line.tax_ids` (Taxes). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `purchase_order_line_id` | int | no | `purchase_order_line.id` | purchase.order.line id |
| `account_tax_id` | int | no | `account_tax.id` | account.tax id |

¹ The referenced table is not drawn in this diagram.
