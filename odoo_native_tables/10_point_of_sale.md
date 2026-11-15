# Point of Sale

Shop and restaurant tills. A POS configuration (`pos_config`) is opened as a session (`pos_session`) by a
cashier; orders, lines and payments are recorded per session and posted to accounting and inventory when the
session closes.

- **Diagram:** [10_point_of_sale.vdoo](10_point_of_sale.vdoo) (open it in vdoo)
- **Install:** `point_of_sale`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 7 tables, 3 many2many tables, 8 reference tables, 32 relationships

## How the data flows

1. Opening a POS creates a `pos_session` for the configuration and cashier; only one session per configuration is open at a time.
2. Each sale is a `pos_order` with lines and one or more `pos_payment` rows (change given back is a payment with `is_change`).
3. Closing the session posts one journal entry for its sales (`pos_session.move_id`) and creates the stock pickings (`stock_picking.pos_session_id`); orders the customer wants invoiced get their own invoice (`pos_order.account_move`).
4. Products appear in the POS when `available_in_pos` is set, grouped by POS categories (`pos_category_product_template_rel`).

## Things to know

- Orders are created offline in the browser, so `uuid` identifies them before the server gives them an id.
- Refunds are orders with `is_refund` whose lines point to the refunded line (`refunded_orderline_id`).

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`pos_config`](#pos_config) | `pos.config` | Point of Sale Configuration | `point_of_sale` |
| [`pos_session`](#pos_session) | `pos.session` | Point of Sale Session | `point_of_sale` |
| [`pos_order`](#pos_order) | `pos.order` | Point of Sale Orders | `point_of_sale` |
| [`pos_order_line`](#pos_order_line) | `pos.order.line` | Point of Sale Order Lines | `point_of_sale` |
| [`pos_payment`](#pos_payment) | `pos.payment` | Point of Sale Payments | `point_of_sale` |
| [`pos_payment_method`](#pos_payment_method) | `pos.payment.method` | Point of Sale Payment Methods | `point_of_sale` |
| [`pos_category`](#pos_category) | `pos.category` | Point of Sale Category | `point_of_sale` |
| [`pos_config_pos_payment_method_rel`](#pos_config_pos_payment_method_rel) | many2many | `pos.config.payment_method_ids` ↔ `pos.payment.method` | `point_of_sale` |
| [`pos_category_product_template_rel`](#pos_category_product_template_rel) | many2many | `product.template.pos_categ_ids` ↔ `pos.category` | `point_of_sale` |
| [`account_tax_pos_order_line_rel`](#account_tax_pos_order_line_rel) | many2many | `pos.order.line.tax_ids` ↔ `account.tax` | `point_of_sale` |

Reference tables (only the columns this app uses; see their own diagrams): `res_partner`, `res_users`, `product_product`, `product_template`, `account_move`, `account_journal`, `stock_picking`, `account_tax`.

### pos_config

`pos.config` — Point of Sale Configuration.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Point of Sale |
| `picking_type_id` | int | no | `stock_picking_type.id` ¹ | Operation Type |
| `journal_id` | int | yes | `account_journal.id` | Point of Sale Journal |
| `invoice_journal_id` | int | yes | `account_journal.id` | Invoice Journal |
| `pricelist_id` | int | yes | `product_pricelist.id` ¹ | Default Pricelist |
| `currency_id` | int | yes | `res_currency.id` ¹ | Currency (computed, stored) |
| `iface_tax_included` | varchar | no |  | Tax Display (subtotal \| total) |
| `module_pos_restaurant` | boolean | yes |  | Is a Bar/Restaurant |
| `company_id` | int | no | `res_company.id` ¹ | Company |
| `active` | boolean | yes |  | Active |

### pos_session

`pos.session` — Point of Sale Session.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Session ID |
| `config_id` | int | no | `pos_config.id` | Point of Sale |
| `user_id` | int | no | `res_users.id` | Opened By |
| `state` | varchar | no |  | Status |
| `start_at` | timestamp | yes |  | Opening Date |
| `stop_at` | timestamp | yes |  | Closing Date |
| `cash_journal_id` | int | yes | `account_journal.id` | Cash Journal (computed, stored) |
| `cash_register_balance_start` | numeric | yes |  | Starting Balance |
| `cash_register_balance_end_real` | numeric | yes |  | Ending Balance |
| `move_id` | int | yes | `account_move.id` | Journal Entry |

### pos_order

`pos.order` — Point of Sale Orders.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Order Ref |
| `pos_reference` | varchar | yes |  | Receipt Number |
| `session_id` | int | yes | `pos_session.id` | Session |
| `config_id` | int | yes | `pos_config.id` | Point of Sale (computed, stored) |
| `partner_id` | int | yes | `res_partner.id` | Customer |
| `user_id` | int | yes | `res_users.id` | Employee |
| `date_order` | timestamp | yes |  | Date |
| `state` | varchar | yes |  | Status (draft \| cancel \| paid \| done) |
| `amount_total` | numeric | no |  | Total |
| `amount_tax` | numeric | no |  | Taxes |
| `amount_paid` | numeric | no |  | Paid |
| `amount_return` | numeric | no |  | Returned |
| `pricelist_id` | int | yes | `product_pricelist.id` ¹ | Pricelist |
| `fiscal_position_id` | int | yes | `account_fiscal_position.id` ¹ | Fiscal Position |
| `account_move` | int | yes | `account_move.id` | Invoice |
| `to_invoice` | boolean | yes |  | To invoice |
| `is_refund` | boolean | yes |  | Is Refund |
| `uuid` | varchar | yes |  | Uuid |
| `company_id` | int | no | `res_company.id` ¹ | Company |

### pos_order_line

`pos.order.line` — Point of Sale Order Lines.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `order_id` | int | no | `pos_order.id` | Order Ref |
| `product_id` | int | no | `product_product.id` | Product |
| `full_product_name` | varchar | yes |  | Full Product Name |
| `qty` | numeric | yes |  | Quantity |
| `price_unit` | numeric | yes |  | Unit Price |
| `discount` | numeric | yes |  | Discount (%) |
| `price_subtotal` | numeric | no |  | Tax Excl. |
| `price_subtotal_incl` | numeric | no |  | Tax Incl. |
| `refunded_orderline_id` | int | yes | `pos_order_line.id` | Refunded Order Line |
| `combo_parent_id` | int | yes | `pos_order_line.id` | Combo Parent |
| `uuid` | varchar | yes |  | Uuid |

### pos_payment

`pos.payment` — Point of Sale Payments.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `pos_order_id` | int | no | `pos_order.id` | Order |
| `session_id` | int | yes | `pos_session.id` | Session (computed, stored) |
| `payment_method_id` | int | no | `pos_payment_method.id` | Payment Method |
| `amount` | numeric | no |  | Amount |
| `payment_date` | timestamp | no |  | Date |
| `is_change` | boolean | yes |  | Is this payment change? |
| `card_type` | varchar | yes |  | Type of card used |
| `transaction_id` | varchar | yes |  | Payment Transaction ID |
| `account_move_id` | int | yes | `account_move.id` | Account move |

### pos_payment_method

`pos.payment.method` — Point of Sale Payment Methods.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Method (translated: one value per language) |
| `payment_method_type` | varchar | no |  | Integration |
| `journal_id` | int | yes | `account_journal.id` | Journal |
| `receivable_account_id` | int | yes | `account_account.id` ¹ | Intermediary Account |
| `outstanding_account_id` | int | yes | `account_account.id` ¹ | Outstanding Account |
| `is_cash_count` | boolean | yes |  | Cash (computed, stored) |
| `use_payment_terminal` | varchar | yes |  | Use a Payment Terminal |
| `company_id` | int | yes | `res_company.id` ¹ | Company |
| `active` | boolean | yes |  | Active |

### pos_category

`pos.category` — Point of Sale Category.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Category Name (translated: one value per language) |
| `parent_id` | int | yes | `pos_category.id` | Parent Category |
| `sequence` | int | yes |  | Sequence |

### pos_config_pos_payment_method_rel

Many2many table of `pos.config.payment_method_ids` (Payment Methods). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `pos_config_id` | int | no | `pos_config.id` | pos.config id |
| `pos_payment_method_id` | int | no | `pos_payment_method.id` | pos.payment.method id |

### pos_category_product_template_rel

Many2many table of `product.template.pos_categ_ids` (Point of Sale Category). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `product_template_id` | int | no | `product_template.id` | product.template id |
| `pos_category_id` | int | no | `pos_category.id` | pos.category id |

### account_tax_pos_order_line_rel

Many2many table of `pos.order.line.tax_ids` (Taxes). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `pos_order_line_id` | int | no | `pos_order_line.id` | pos.order.line id |
| `account_tax_id` | int | no | `account_tax.id` | account.tax id |

¹ The referenced table is not drawn in this diagram.
