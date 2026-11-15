"""Which Odoo tables and columns each diagram shows, and the words around them.

`tables`: the app's own models and the columns worth knowing (every table also gets `id`).
`refs`:   models owned by another diagram, shown with only the columns this app's tables use.
`m2m`:    (model, field) many2many fields whose relation tables are drawn.
generate.py checks every name against the Odoo source, so a typo or a field that isn't stored stops the build.
"""

PARTNER_REF = ["name", "is_company", "parent_id", "email"]
USER_REF = ["login", "partner_id"]
PRODUCT_REF = ["product_tmpl_id", "default_code"]
TEMPLATE_REF = ["name", "type", "uom_id"]

APPS = [
    {
        "slug": "00_contacts_core",
        "title": "Contacts, users and companies",
        "modules": ["contacts"],
        "summary": """
The `base` tables every other app points to: contacts (`res_partner`), users, companies, access groups,
currencies, countries and bank accounts. A customer, a vendor, an employee's work contact, a company's address and a
user's identity are all rows of `res_partner`; the other apps never store names or addresses of their own.
""",
        "tables": {
            "res.partner": ["name", "complete_name", "is_company", "type", "parent_id", "commercial_partner_id", "company_id",
                            "user_id", "ref", "vat", "email", "phone", "street", "city", "zip", "state_id", "country_id", "lang", "active"],
            "res.users": ["partner_id", "login", "company_id", "share", "active"],
            "res.company": ["name", "partner_id", "parent_id", "currency_id", "active"],
            "res.groups": ["name", "privilege_id", "share"],
            "res.groups.privilege": ["name", "category_id", "sequence"],
            "res.currency": ["name", "symbol", "rounding", "decimal_places", "active"],
            "res.country": ["name", "code", "currency_id"],
            "res.country.state": ["country_id", "name", "code"],
            "res.partner.category": ["name", "parent_id", "color", "active"],
            "res.partner.bank": ["partner_id", "acc_number", "bank_id", "currency_id", "company_id", "allow_out_payment"],
            "res.bank": ["name", "bic", "country"],
        },
        "m2m": [("res.partner", "category_id"), ("res.users", "group_ids"), ("res.users", "company_ids"), ("res.groups", "implied_ids")],
        "flows": [
            "A company is a contact first: `res_company.partner_id` holds its name and address in `res_partner`.",
            "A person who works for a company is a contact whose `parent_id` is the company contact; `commercial_partner_id` "
            "points to the top-level company and is what invoices and pricing use.",
            "A user (`res_users`) is a contact who can sign in: `_inherits` gives every user a `res_partner` row through "
            "`partner_id`, so name and email live on the contact.",
            "Access comes from groups: `res_groups_users_rel` lists each user's groups and `res_groups_implied_rel` makes "
            "one group include others.",
        ],
        "notes": [
            "Odoo 19 renamed the user's groups field to `group_ids` (it was `groups_id`); the table is still `res_groups_users_rel`.",
            "Odoo 19 replaced the group's application category with a privilege: `res_groups.privilege_id` → `res_groups_privilege`, "
            "which carries the `ir_module_category` link.",
            "`res_partner.type` tells a company or person apart from its other addresses: contact, invoice, delivery or other.",
            "Partner tags are `res_partner_category`; contacts and tags meet in `res_partner_res_partner_category_rel`.",
        ],
    },
    {
        "slug": "01_products",
        "title": "Products, variants, units and pricelists",
        "modules": ["product"],
        "summary": """
The product catalogue shared by Sales, Purchase, Inventory, Manufacturing and Point of Sale. A product is a
template (`product_template`: name, type, unit, sales price) with one or more variants (`product_product`). Documents
always reference the variant. Attributes (size, colour) generate the variants, and pricelists compute prices.
""",
        "tables": {
            "product.template": ["name", "type", "categ_id", "uom_id", "list_price", "default_code", "sale_ok", "purchase_ok",
                                 "company_id", "active"],
            "product.product": ["product_tmpl_id", "default_code", "barcode", "standard_price", "combination_indices", "active"],
            "product.category": ["name", "complete_name", "parent_id"],
            "uom.uom": ["name", "relative_factor", "relative_uom_id", "active"],
            "product.attribute": ["name", "create_variant", "display_type", "sequence"],
            "product.attribute.value": ["name", "attribute_id", "default_extra_price", "sequence"],
            "product.template.attribute.line": ["product_tmpl_id", "attribute_id", "active"],
            "product.template.attribute.value": ["product_tmpl_id", "attribute_id", "attribute_line_id", "product_attribute_value_id",
                                                 "price_extra", "ptav_active"],
            "product.tag": ["name", "color"],
            "product.pricelist": ["name", "currency_id", "company_id", "active", "sequence"],
            "product.pricelist.item": ["pricelist_id", "applied_on", "categ_id", "product_tmpl_id", "product_id", "min_quantity",
                                       "date_start", "date_end", "compute_price", "fixed_price", "percent_price", "base", "base_pricelist_id"],
        },
        "m2m": [("product.template.attribute.line", "value_ids"), ("product.product", "product_template_attribute_value_ids"),
                ("product.template", "product_tag_ids")],
        "flows": [
            "Adding an attribute line (`product_template_attribute_line`) with values to a template creates one "
            "`product_template_attribute_value` per value; each combination of those becomes a `product_product` "
            "(`product_variant_combination` records which values a variant has).",
            "A template without attributes has exactly one variant, so `product_product` always exists for sold items.",
            "Pricelist rules (`product_pricelist_item`) apply to all products, a category, a template or a variant "
            "(`applied_on`) and compute a price from the list price, the cost or another pricelist (`base`).",
        ],
        "notes": [
            "Odoo 19 removed unit categories: a unit is defined relative to another (`uom_uom.relative_uom_id`, "
            "`relative_factor`) instead of `category_id` and `factor_inv`.",
            "Since Odoo 18 `product_template.type` is `consu`, `service` or `combo`; stock tracking is the separate "
            "`is_storable` flag that Inventory adds.",
            "`product_product.standard_price` (cost) is company-dependent: a jsonb of company id → value.",
            "Name and description columns are translated, so they are jsonb (one value per language).",
        ],
    },
    {
        "slug": "02_crm",
        "title": "CRM",
        "modules": ["crm"],
        "summary": """
Leads and opportunities in one table, `crm_lead`, moved through stages by sales teams. Marketing attribution
uses the UTM tables (campaign, medium, source) shared with Sales, Website and Email Marketing.
""",
        "tables": {
            "crm.lead": ["name", "type", "partner_id", "contact_name", "partner_name", "email_from", "phone", "user_id", "team_id",
                         "stage_id", "probability", "expected_revenue", "priority", "date_deadline", "date_closed", "won_status",
                         "lost_reason_id", "campaign_id", "medium_id", "source_id", "company_id", "active"],
            "crm.stage": ["name", "sequence", "is_won", "fold", "rotting_threshold_days"],
            "crm.team": ["name", "user_id", "use_leads", "use_opportunities", "alias_id", "company_id", "active"],
            "crm.team.member": ["crm_team_id", "user_id", "assignment_max", "active"],
            "crm.lost.reason": ["name", "active"],
            "crm.tag": ["name", "color"],
            "utm.campaign": ["name", "title", "user_id", "stage_id", "active"],
            "utm.medium": ["name", "active"],
            "utm.source": ["name"],
        },
        "refs": {"res.partner": PARTNER_REF, "res.users": USER_REF},
        "m2m": [("crm.lead", "tag_ids"), ("crm.stage", "team_ids")],
        "flows": [
            "A lead (`type = 'lead'`) is qualified into an opportunity (`type = 'opportunity'`); it is the same row.",
            "Opportunities move through `crm_stage`; a stage can be limited to some teams (`crm_stage_crm_team_rel`, "
            "empty means all teams).",
            "Won means reaching a stage with `is_won`; lost means archived (`active = false`) with a `lost_reason_id`. "
            "`won_status` stores the result.",
            "Leads are assigned to teams and salespeople; `crm_team_member` holds each member's assignment capacity.",
        ],
        "notes": [
            "Quotations made from an opportunity point back through `sale_order.opportunity_id` (module `sale_crm`, see 12_cross_app_links).",
            "Incoming emails create leads through the team's mail alias (`crm_team.alias_id` → `mail_alias`).",
        ],
    },
    {
        "slug": "03_sales",
        "title": "Sales",
        "modules": ["sale_management"],
        "summary": """
Quotations and sales orders (`sale_order`, `sale_order_line`), quotation templates, and the links to taxes and
invoice lines. Delivery and invoicing state is kept on each line (`qty_delivered`, `qty_invoiced`).
""",
        "tables": {
            "sale.order": ["name", "state", "partner_id", "partner_invoice_id", "partner_shipping_id", "date_order", "validity_date",
                           "user_id", "team_id", "pricelist_id", "currency_id", "payment_term_id", "fiscal_position_id",
                           "sale_order_template_id", "amount_untaxed", "amount_tax", "amount_total", "invoice_status", "origin",
                           "client_order_ref", "locked", "company_id"],
            "sale.order.line": ["order_id", "sequence", "display_type", "product_id", "name", "product_uom_qty", "product_uom_id",
                                "price_unit", "discount", "price_subtotal", "price_total", "qty_delivered", "qty_invoiced",
                                "qty_to_invoice", "invoice_status", "is_downpayment", "linked_line_id", "analytic_distribution", "state"],
            "sale.order.template": ["name", "number_of_days", "require_signature", "require_payment", "company_id", "active"],
            "sale.order.template.line": ["sale_order_template_id", "sequence", "display_type", "product_id", "name",
                                         "product_uom_qty", "product_uom_id"],
        },
        "refs": {
            "res.partner": PARTNER_REF, "res.users": USER_REF, "crm.team": ["name"],
            "product.product": PRODUCT_REF, "uom.uom": ["name"], "product.pricelist": ["name", "currency_id"],
            "account.payment.term": ["name"], "account.fiscal.position": ["name"], "account.tax": ["name", "amount", "type_tax_use"],
            "account.move.line": ["move_id", "product_id", "quantity", "price_subtotal"], "crm.tag": ["name"],
        },
        "m2m": [("sale.order.line", "tax_ids"), ("sale.order.line", "invoice_lines"), ("sale.order", "tag_ids")],
        "flows": [
            "A quotation (`state = 'draft'`, then `sent`) becomes a sales order on confirmation (`state = 'sale'`).",
            "Three contacts per order: the customer (`partner_id`), the invoice address and the delivery address.",
            "Lines hold product, quantity, unit and price; section and note lines are lines with a `display_type` and no product.",
            "Invoicing links each order line to the invoice lines made from it in `sale_order_line_invoice_rel`; "
            "`qty_invoiced` and `invoice_status` are computed from them.",
            "Delivered quantities come from stock moves when Inventory is installed (`stock_move.sale_line_id`, see 12_cross_app_links).",
        ],
        "notes": [
            "Odoo 19 renamed the line unit field to `product_uom_id` (it was `product_uom`) and the line taxes to `tax_ids` (it was `tax_id`).",
            "The order's taxes are per line: `account_tax_sale_order_line_rel`.",
            "`analytic_distribution` is jsonb mapping analytic account ids to percentages, not a foreign key.",
        ],
    },
    {
        "slug": "04_purchase",
        "title": "Purchase",
        "modules": ["purchase"],
        "summary": """
Requests for quotation and purchase orders (`purchase_order`, `purchase_order_line`) and vendor prices
(`product_supplierinfo`). Vendor bill lines point back to the purchase line they bill.
""",
        "tables": {
            "purchase.order": ["name", "state", "partner_id", "partner_ref", "dest_address_id", "date_order", "date_approve",
                               "date_planned", "user_id", "currency_id", "payment_term_id", "fiscal_position_id", "incoterm_id",
                               "amount_untaxed", "amount_tax", "amount_total", "invoice_status", "origin", "locked", "company_id"],
            "purchase.order.line": ["order_id", "sequence", "display_type", "product_id", "name", "product_qty", "product_uom_id",
                                    "price_unit", "discount", "price_subtotal", "price_total", "date_planned", "qty_received_method",
                                    "qty_received", "qty_invoiced", "qty_to_invoice", "analytic_distribution", "company_id"],
            "product.supplierinfo": ["partner_id", "product_tmpl_id", "product_id", "product_name", "product_code", "min_qty",
                                     "price", "discount", "currency_id", "delay", "date_start", "date_end", "company_id"],
        },
        "refs": {
            "res.partner": PARTNER_REF, "res.users": USER_REF, "product.product": PRODUCT_REF, "product.template": TEMPLATE_REF,
            "uom.uom": ["name"], "account.payment.term": ["name"], "account.tax": ["name", "amount", "type_tax_use"],
            "account.move.line": ["move_id", "purchase_line_id", "quantity", "price_subtotal"],
        },
        "m2m": [("purchase.order.line", "tax_ids")],
        "flows": [
            "An RFQ (`state = 'draft'`, then `sent`) becomes a purchase order on confirmation (`state = 'purchase'`).",
            "Vendor prices in `product_supplierinfo` propose the vendor, price and lead time (`delay`) for a product and quantity.",
            "Receipts update `qty_received`; with Inventory these come from stock moves (`stock_move.purchase_line_id`, module `purchase_stock`).",
            "Each vendor bill line references its purchase line in `account_move_line.purchase_line_id`, which drives `qty_invoiced`.",
        ],
        "notes": [
            "Odoo 19 uses `product_uom_id` and `tax_ids` on purchase lines (they were `product_uom` and `taxes_id`).",
            "Purchase agreements (blanket orders, calls for tender) are the separate `purchase_requisition` module.",
        ],
    },
    {
        "slug": "05_inventory_operations",
        "title": "Inventory: transfers, moves and stock",
        "modules": ["stock"],
        "summary": """
How goods move and where they are. Every movement of goods is a `stock_move` from one location to another,
grouped into transfers (`stock_picking`) and carried out by move lines (`stock_move_line`: the exact lot, package
and sub-locations). On-hand quantities are kept per location, lot and package in `stock_quant`. Warehouses,
locations, operation types and routes are in 05_inventory_setup.
""",
        "tables": {
            "stock.picking": ["name", "state", "picking_type_id", "partner_id", "location_id", "location_dest_id", "scheduled_date",
                              "date_done", "origin", "backorder_id", "return_id", "move_type", "user_id", "company_id"],
            "stock.move": ["reference", "product_id", "product_uom_qty", "quantity", "product_uom", "state", "picking_id",
                           "picking_type_id", "location_id", "location_dest_id", "location_final_id", "date", "procure_method",
                           "rule_id", "origin_returned_move_id", "warehouse_id", "orderpoint_id", "company_id"],
            "stock.move.line": ["move_id", "picking_id", "product_id", "quantity", "product_uom_id", "lot_id", "package_id",
                                "result_package_id", "location_id", "location_dest_id", "state", "date", "company_id"],
            "stock.quant": ["product_id", "location_id", "lot_id", "package_id", "owner_id", "quantity", "reserved_quantity",
                            "inventory_quantity", "in_date"],
            "stock.lot": ["name", "product_id", "ref", "company_id"],
            "stock.package": ["name", "location_id", "parent_package_id", "company_id"],
            "stock.reference": ["name"],
        },
        "refs": {"product.product": PRODUCT_REF, "res.partner": PARTNER_REF, "stock.location": ["name", "complete_name", "usage"],
                 "stock.picking.type": ["name", "code"]},
        "m2m": [("stock.move", "move_orig_ids"), ("stock.move", "reference_ids")],
        "flows": [
            "A transfer (`stock_picking`) groups the moves of one operation type (receipt, delivery, internal …); "
            "a move (`stock_move`) asks for a quantity of one product from a source to a destination location.",
            "Reserving fills `stock_move_line` rows with the actual lot, package and sub-locations; validating marks them "
            "done and updates `stock_quant` (on hand per location, lot, package and owner).",
            "Multi-step routes chain moves: `stock_move_move_rel` links each move to the moves it feeds "
            "(`move_orig_ids` / `move_dest_ids`), and `location_final_id` is where the chain should end.",
            "Returns are new transfers whose moves point to the returned move (`origin_returned_move_id`); a partly done "
            "transfer leaves the rest in a backorder (`backorder_id`).",
        ],
        "notes": [
            "Odoo 19 replaced procurement groups with `stock_reference`: moves are tied to their originating documents "
            "through `stock_reference_move_rel` (there is no `group_id` any more).",
            "Odoo 19 renamed packages to `stock.package` (table `stock_package`, it was `stock_quant_package`).",
            "`stock_move.product_uom` kept its name in Odoo 19; move lines use `product_uom_id`.",
            "Goods always move between locations, never appear or vanish: suppliers, customers, inventory adjustments and "
            "production are locations too (`stock_location.usage`).",
        ],
    },
    {
        "slug": "05_inventory_setup",
        "title": "Inventory: warehouses, locations and routes",
        "modules": ["stock"],
        "summary": """
The configuration that transfers and moves follow: warehouses, the location tree, operation types, routes and
their rules, and reordering rules. 05_inventory_operations has the transfers and stock levels.
""",
        "tables": {
            "stock.warehouse": ["name", "code", "partner_id", "view_location_id", "lot_stock_id", "reception_steps", "delivery_steps",
                                "in_type_id", "out_type_id", "int_type_id", "company_id"],
            "stock.location": ["name", "complete_name", "usage", "location_id", "warehouse_id", "company_id", "active"],
            "stock.picking.type": ["name", "code", "sequence_code", "warehouse_id", "default_location_src_id",
                                   "default_location_dest_id", "return_picking_type_id", "reservation_method", "company_id"],
            "stock.route": ["name", "sequence", "product_selectable", "warehouse_selectable", "company_id", "active"],
            "stock.rule": ["name", "action", "route_id", "location_src_id", "location_dest_id", "picking_type_id", "procure_method",
                           "warehouse_id"],
            "stock.warehouse.orderpoint": ["name", "product_id", "warehouse_id", "location_id", "product_min_qty", "product_max_qty",
                                           "route_id", "trigger"],
        },
        "refs": {"product.product": PRODUCT_REF, "product.template": ["name", "is_storable", "tracking"], "res.partner": PARTNER_REF},
        "m2m": [("stock.route", "product_ids")],
        "flows": [
            "Each warehouse creates its locations (a view location with the stock location `lot_stock_id` under it) and "
            "its operation types (receipts, deliveries, internal transfers), which give transfers their sequence and default locations.",
            "`reception_steps` and `delivery_steps` (one, two or three steps) decide which routes and rules the warehouse uses.",
            "A route is a set of rules (`stock_rule`); each rule pulls or pushes goods between two locations with an operation type.",
            "Routes apply to products (`stock_route_product`), product categories or warehouses.",
            "Reordering rules (`stock_warehouse_orderpoint`) keep a product between a minimum and maximum quantity in a "
            "location by triggering a route (buy, manufacture, resupply).",
        ],
        "notes": [
            "Locations form a tree (`location_id` is the parent); `usage` separates real stock (`internal`) from supplier, "
            "customer, inventory-loss, production and transit locations.",
            "Products that track stock have `product_template.is_storable = true`, and `tracking` (none, lot, serial) "
            "decides whether moves need lots (both added by this module).",
        ],
    },
    {
        "slug": "06_accounting",
        "title": "Accounting and invoicing",
        "modules": ["account"],
        "summary": """
Double-entry bookkeeping. Invoices, bills, credit notes, payments and miscellaneous entries are all journal
entries (`account_move`) with balanced journal items (`account_move_line`). Taxes, payment terms, fiscal positions,
reconciliation and bank statements build on them.
""",
        "tables": {
            "account.move": ["name", "move_type", "state", "journal_id", "date", "invoice_date", "invoice_date_due", "partner_id",
                             "commercial_partner_id", "currency_id", "invoice_payment_term_id", "fiscal_position_id", "amount_untaxed",
                             "amount_tax", "amount_total", "amount_residual", "payment_state", "reversed_entry_id",
                             "origin_payment_id", "statement_line_id", "invoice_origin", "ref", "company_id"],
            "account.move.line": ["move_id", "journal_id", "account_id", "partner_id", "name", "display_type", "debit", "credit",
                                  "balance", "amount_currency", "currency_id", "product_id", "quantity", "price_unit", "price_subtotal",
                                  "tax_line_id", "tax_repartition_line_id", "date", "date_maturity", "reconciled", "amount_residual",
                                  "full_reconcile_id", "payment_id", "statement_line_id", "analytic_distribution", "parent_state"],
            "account.account": ["code_store", "name", "account_type", "reconcile", "currency_id", "active"],
            "account.journal": ["name", "code", "type", "default_account_id", "suspense_account_id", "currency_id", "bank_account_id",
                                "company_id"],
            "account.tax": ["name", "type_tax_use", "amount_type", "amount", "price_include_override", "tax_group_id", "country_id",
                            "company_id"],
            "account.tax.group": ["name", "country_id", "company_id"],
            "account.tax.repartition.line": ["tax_id", "repartition_type", "document_type", "factor_percent", "account_id"],
            "account.payment": ["name", "payment_type", "partner_type", "partner_id", "amount", "currency_id", "date", "journal_id",
                                "move_id", "state", "outstanding_account_id", "destination_account_id", "memo", "company_id"],
            "account.payment.term": ["name", "early_discount", "discount_percentage", "discount_days"],
            "account.payment.term.line": ["payment_id", "value", "value_amount", "delay_type", "nb_days"],
            "account.partial.reconcile": ["debit_move_id", "credit_move_id", "amount", "debit_amount_currency",
                                          "credit_amount_currency", "full_reconcile_id", "exchange_move_id", "max_date"],
            "account.full.reconcile": [],
            "account.bank.statement.line": ["move_id", "journal_id", "partner_id", "payment_ref", "amount", "amount_currency",
                                            "foreign_currency_id", "is_reconciled"],
            "account.fiscal.position": ["name", "country_id", "auto_apply", "vat_required", "company_id"],
            "account.analytic.account": ["name", "code", "plan_id", "partner_id", "company_id"],
            "account.analytic.plan": ["name", "parent_id"],
        },
        "refs": {"res.partner": PARTNER_REF, "product.product": PRODUCT_REF},
        "m2m": [("account.move.line", "tax_ids"), ("account.account", "company_ids")],
        "flows": [
            "Every document is an `account_move` in a journal; `move_type` says which: `entry`, `out_invoice`, `out_refund`, "
            "`in_invoice`, `in_refund`, `out_receipt`, `in_receipt`.",
            "Its `account_move_line` rows must balance (sum of debit = sum of credit). Invoice product lines, tax lines and "
            "the receivable/payable line are all journal items; `display_type` tells them apart.",
            "Taxes on a line are in `account_move_line_account_tax_rel`; the tax amounts become their own lines "
            "(`tax_line_id`), split by the tax's repartition lines.",
            "A payment (`account_payment`) posts its own journal entry (`move_id`). Reconciling matches a receivable/payable "
            "line with payment lines through `account_partial_reconcile`; when fully paid they share an `account_full_reconcile`.",
            "Bank statement lines (`account_bank_statement_line`) each own a journal entry and are reconciled the same way.",
        ],
        "notes": [
            "Since Odoo 18 an account can be shared by several companies: `account_account_res_company_rel`, and the code "
            "is per company in `account_account.code_store` (jsonb).",
            "Analytic accounting is not a foreign key on journal items: `analytic_distribution` is jsonb mapping analytic "
            "account ids to percentages; analytic lines (`account_analytic_line`) are created from it.",
            "Payment and invoice amounts in company currency are on the lines (`balance`), document currency in `amount_currency`.",
            "Bank reconciliation widgets, reports and asset management come from Enterprise modules (`account_accountant` …), "
            "which are not in the Community source used here.",
        ],
    },
    {
        "slug": "07_project",
        "title": "Project",
        "modules": ["project"],
        "summary": """
Projects and tasks: stages, assignees, tags, milestones, dependencies and status updates. Tasks move through
stages shared between projects, and each assignee can also sort tasks in personal stages.
""",
        "tables": {
            "project.project": ["name", "partner_id", "user_id", "account_id", "stage_id", "privacy_visibility", "date_start", "date",
                                "allow_milestones", "allow_task_dependencies", "is_template", "sequence", "company_id", "active"],
            "project.task": ["name", "project_id", "parent_id", "stage_id", "state", "priority", "partner_id", "milestone_id",
                             "date_deadline", "date_assign", "date_end", "allocated_hours", "display_in_project", "recurrence_id",
                             "sequence", "company_id", "active"],
            "project.task.type": ["name", "sequence", "fold", "user_id"],
            "project.project.stage": ["name", "sequence", "fold"],
            "project.task.stage.personal": ["task_id", "user_id", "stage_id"],
            "project.milestone": ["name", "project_id", "deadline", "is_reached", "reached_date"],
            "project.tags": ["name", "color"],
            "project.update": ["name", "project_id", "status", "progress", "date", "user_id"],
            "project.collaborator": ["project_id", "partner_id", "limited_access"],
        },
        "refs": {"res.partner": PARTNER_REF, "res.users": USER_REF, "account.analytic.account": ["name", "plan_id"]},
        "m2m": [("project.task", "user_ids"), ("project.task", "tag_ids"), ("project.task", "depend_on_ids"),
                ("project.project", "type_ids"), ("project.project", "tag_ids")],
        "flows": [
            "A project lists the task stages it uses in `project_task_type_rel`; tasks sit in one of them (`stage_id`).",
            "Assignees are users: each assignment is a row of `project_task_user_rel`, which also stores that user's "
            "personal stage for the task (`stage_id`).",
            "Sub-tasks are tasks with a `parent_id`; blocking tasks are in `task_dependencies_rel`.",
            "`state` is the task's own status, independent of the stage: `01_in_progress`, `02_changes_requested`, "
            "`03_approved`, `04_waiting_normal` (blocked by another task), and the closed states `1_done`, `1_canceled`.",
            "Project updates (`project_update`) record a status and progress over time; the latest is shown on the project.",
        ],
        "notes": [
            "`project_task_user_rel` is not a plain many2many table: it is the table of `project.task.stage.personal` "
            "(`_table = 'project_task_user_rel'`), and both `project_task.user_ids` and `personal_stage_type_ids` use it.",
            "A project's analytic account (`account_id`) is where timesheets and costs are booked when Accounting/Timesheets are installed.",
            "Selling services that create tasks links `project_task.sale_line_id` to `sale_order_line` (module `sale_project`, see 12_cross_app_links).",
        ],
    },
    {
        "slug": "08_employees",
        "title": "Employees",
        "modules": ["hr"],
        "summary": """
Employees, departments, job positions and work locations. In Odoo 19 the contract-like and private details of an
employee are versioned in `hr_version`: each version is dated, and the employee points to the current one.
""",
        "tables": {
            "hr.employee": ["name", "user_id", "work_contact_id", "resource_id", "current_version_id", "parent_id", "coach_id",
                            "work_email", "work_phone", "mobile_phone", "birthday", "company_id", "active"],
            "hr.version": ["employee_id", "date_version", "contract_date_start", "contract_date_end", "department_id", "job_id",
                           "job_title", "work_location_id", "address_id", "resource_calendar_id", "employee_type", "contract_type_id",
                           "wage", "departure_reason_id", "departure_date", "company_id", "active"],
            "hr.department": ["name", "parent_id", "manager_id", "master_department_id", "company_id", "active"],
            "hr.job": ["name", "department_id", "contract_type_id", "no_of_recruitment", "company_id", "active"],
            "hr.employee.category": ["name", "color"],
            "hr.work.location": ["name", "location_type", "address_id", "company_id", "active"],
            "hr.contract.type": ["name", "code", "country_id"],
            "hr.departure.reason": ["name"],
            "resource.resource": ["name", "user_id", "calendar_id", "resource_type", "time_efficiency", "tz", "company_id"],
            "resource.calendar": ["name", "hours_per_day", "flexible_hours", "tz", "company_id"],
        },
        "refs": {"res.users": USER_REF, "res.partner": PARTNER_REF},
        "m2m": [("hr.employee", "category_ids")],
        "flows": [
            "Creating an employee creates a `resource_resource` (working time, timezone) and a first `hr_version`.",
            "Department, job, work location, working schedule, contract dates and wage are on the version; a new version "
            "dated in the future records a change (promotion, new contract) without losing history.",
            "`hr_employee.current_version_id` points to the version in effect today; `hr_version.employee_id` lists them all.",
            "The manager hierarchy is `hr_employee.parent_id`; departments have their own `parent_id` tree and a manager.",
            "An employee linked to a user (`user_id`) gets a work contact (`work_contact_id`) used for chatter and messaging.",
        ],
        "notes": [
            "Odoo 19 replaced `hr.contract` with `hr.version`. `hr.employee` delegates to it with `_inherits = {'hr.version': 'version_id'}`, "
            "but `version_id` is computed (not a column): the stored link is `current_version_id`.",
            "Private details (address, identification, marital status) are on `hr_version` as well and are restricted to HR officers.",
            "Employee tags meet employees in `employee_category_rel`.",
        ],
    },
    {
        "slug": "09_manufacturing",
        "title": "Manufacturing",
        "modules": ["mrp"],
        "summary": """
Bills of materials, work centers and manufacturing orders. A manufacturing order consumes components and
produces finished goods through ordinary stock moves, so Inventory sees every quantity it uses or makes.
""",
        "tables": {
            "mrp.production": ["name", "state", "product_id", "product_qty", "product_uom_id", "qty_producing", "bom_id",
                               "picking_type_id", "location_src_id", "location_dest_id", "production_group_id", "date_start",
                               "date_finished", "date_deadline", "user_id", "origin", "company_id"],
            "mrp.production.group": ["name"],
            "mrp.bom": ["product_tmpl_id", "product_id", "product_qty", "product_uom_id", "type", "code", "picking_type_id",
                        "consumption", "company_id", "active"],
            "mrp.bom.line": ["bom_id", "product_id", "product_qty", "product_uom_id", "operation_id", "sequence"],
            "mrp.bom.byproduct": ["bom_id", "product_id", "product_qty", "product_uom_id", "operation_id", "cost_share"],
            "mrp.workcenter": ["name", "code", "resource_id", "resource_calendar_id", "costs_hour", "time_efficiency", "oee_target",
                               "company_id", "active"],
            "mrp.routing.workcenter": ["name", "bom_id", "workcenter_id", "sequence", "time_mode", "time_cycle_manual"],
            "mrp.workorder": ["name", "production_id", "workcenter_id", "operation_id", "state", "qty_produced", "date_start",
                              "date_finished", "duration_expected", "duration"],
            "stock.move": ["product_id", "product_uom_qty", "quantity", "state", "raw_material_production_id", "production_id",
                           "bom_line_id", "byproduct_id", "operation_id", "workorder_id", "unbuild_id", "location_id",
                           "location_dest_id"],
            "mrp.unbuild": ["name", "product_id", "bom_id", "mo_id", "product_qty", "product_uom_id", "location_id",
                            "location_dest_id", "state", "company_id"],
        },
        "refs": {"product.product": PRODUCT_REF, "product.template": TEMPLATE_REF, "uom.uom": ["name"],
                 "stock.picking.type": ["name", "code"]},
        "flows": [
            "A bill of materials (`mrp_bom`) for a product template lists components (`mrp_bom_line`), by-products and "
            "operations (`mrp_routing_workcenter`, each done at a work center).",
            "Confirming a manufacturing order creates one stock move per component (`raw_material_production_id` = the MO) "
            "and one per finished product or by-product (`production_id` = the MO).",
            "Operations become work orders (`mrp_workorder`) that track time at the work center.",
            "Component moves are consumed from `location_src_id`, finished moves go to `location_dest_id`; "
            "the virtual production location sits in between.",
            "Unbuild orders reverse a production with moves of their own (`unbuild_id`).",
        ],
        "notes": [
            "Odoo 19 groups an MO with its backorders and children in `mrp_production_group` (`production_group_id`), "
            "and ties MOs to their originating documents through `stock_reference` like other stock documents.",
            "`stock_move` appears here with only its manufacturing columns; the full table is in 05_inventory_operations.",
            "`mrp_bom.type` is `normal` (manufacture) or `phantom` (kit, exploded into its components on sales and transfers).",
        ],
    },
    {
        "slug": "10_point_of_sale",
        "title": "Point of Sale",
        "modules": ["point_of_sale"],
        "summary": """
Shop and restaurant tills. A POS configuration (`pos_config`) is opened as a session (`pos_session`) by a
cashier; orders, lines and payments are recorded per session and posted to accounting and inventory when the
session closes.
""",
        "tables": {
            "pos.config": ["name", "picking_type_id", "journal_id", "invoice_journal_id", "pricelist_id", "currency_id",
                           "iface_tax_included", "module_pos_restaurant", "company_id", "active"],
            "pos.session": ["name", "config_id", "user_id", "state", "start_at", "stop_at", "cash_journal_id",
                            "cash_register_balance_start", "cash_register_balance_end_real", "move_id"],
            "pos.order": ["name", "pos_reference", "session_id", "config_id", "partner_id", "user_id", "date_order", "state",
                          "amount_total", "amount_tax", "amount_paid", "amount_return", "pricelist_id", "fiscal_position_id",
                          "account_move", "to_invoice", "is_refund", "uuid", "company_id"],
            "pos.order.line": ["order_id", "product_id", "full_product_name", "qty", "price_unit", "discount", "price_subtotal",
                               "price_subtotal_incl", "refunded_orderline_id", "combo_parent_id", "uuid"],
            "pos.payment": ["pos_order_id", "session_id", "payment_method_id", "amount", "payment_date", "is_change", "card_type",
                            "transaction_id", "account_move_id"],
            "pos.payment.method": ["name", "payment_method_type", "journal_id", "receivable_account_id", "outstanding_account_id",
                                   "is_cash_count", "use_payment_terminal", "company_id", "active"],
            "pos.category": ["name", "parent_id", "sequence"],
        },
        "refs": {"res.partner": PARTNER_REF, "res.users": USER_REF, "product.product": PRODUCT_REF, "product.template": ["name", "available_in_pos"],
                 "account.move": ["name", "move_type"], "account.journal": ["name", "type"],
                 "stock.picking": ["name", "pos_order_id", "pos_session_id"], "account.tax": ["name", "amount"]},
        "m2m": [("pos.config", "payment_method_ids"), ("product.template", "pos_categ_ids"), ("pos.order.line", "tax_ids")],
        "flows": [
            "Opening a POS creates a `pos_session` for the configuration and cashier; only one session per configuration is open at a time.",
            "Each sale is a `pos_order` with lines and one or more `pos_payment` rows (change given back is a payment with `is_change`).",
            "Closing the session posts one journal entry for its sales (`pos_session.move_id`) and creates the stock "
            "pickings (`stock_picking.pos_session_id`); orders the customer wants invoiced get their own invoice (`pos_order.account_move`).",
            "Products appear in the POS when `available_in_pos` is set, grouped by POS categories (`pos_category_product_template_rel`).",
        ],
        "notes": [
            "Orders are created offline in the browser, so `uuid` identifies them before the server gives them an id.",
            "Refunds are orders with `is_refund` whose lines point to the refunded line (`refunded_orderline_id`).",
        ],
    },
    {
        "slug": "11_website_ecommerce",
        "title": "Website and eCommerce",
        "modules": ["website_sale"],
        "summary": """
Websites, pages and menus, the shop's catalogue fields, and the cart. A cart is a draft sales order with a
`website_id`; checkout confirms it like any other order.
""",
        "tables": {
            "website": ["name", "domain", "company_id", "default_lang_id", "user_id", "salesperson_id", "salesteam_id", "shop_ppg"],
            "website.page": ["url", "view_id", "website_id", "website_indexed", "date_publish"],
            "website.menu": ["name", "url", "page_id", "parent_id", "website_id", "sequence"],
            "website.visitor": ["website_id", "partner_id", "country_id", "visit_count", "last_connection_datetime", "access_token"],
            "product.template": ["name", "website_id", "is_published", "website_sequence", "website_ribbon_id", "list_price",
                                 "compare_list_price", "sale_ok"],
            "product.public.category": ["name", "parent_id", "website_id", "sequence"],
            "product.ribbon": ["name", "position", "bg_color", "text_color"],
            "product.image": ["name", "product_tmpl_id", "product_variant_id", "video_url", "sequence"],
            "product.pricelist": ["name", "website_id", "selectable", "currency_id"],
            "sale.order": ["name", "state", "website_id", "partner_id", "pricelist_id", "amount_total", "cart_recovery_email_sent"],
        },
        "refs": {"res.partner": PARTNER_REF, "res.users": USER_REF, "product.product": PRODUCT_REF,
                 "sale.order.line": ["order_id", "product_id", "product_uom_qty", "price_unit"]},
        "m2m": [("product.template", "public_categ_ids")],
        "flows": [
            "A database can host several websites; most website content can be limited to one (`website_id`) or shared (empty).",
            "Pages are views: `website_page` delegates to `ir_ui_view` (`view_id`) for its content.",
            "Products are shown when `is_published` is set, in eCommerce categories (`product_public_category_product_template_rel`).",
            "Adding to cart creates or updates a draft `sale_order` with the `website_id`; paying confirms it.",
            "Visitors are tracked in `website_visitor` and linked to the contact once they sign in or check out.",
        ],
        "notes": [
            "eCommerce categories (`product_public_category`) are separate from internal product categories (`product_category`).",
            "Pricelists offered on the website are those with `selectable` or assigned to the website.",
        ],
    },
    {
        "slug": "12_cross_app_links",
        "title": "Cross-app links",
        "modules": ["sale_crm", "sale_stock", "purchase_stock", "sale_project", "sale_mrp", "stock_account", "pos_sale", "website_sale"],
        "summary": """
How the apps connect when they are installed together. These columns come from the small bridge modules Odoo
installs automatically (`sale_stock`, `purchase_stock`, `sale_crm`, `sale_project`, `sale_mrp`, `stock_account`,
`pos_sale`). Each table shows only the columns that link it to another app.
""",
        "tables": {
            "crm.lead": ["name", "partner_id"],
            "sale.order": ["name", "partner_id", "opportunity_id", "warehouse_id", "website_id"],
            "sale.order.line": ["order_id", "product_id"],
            "purchase.order": ["name", "partner_id", "picking_type_id"],
            "purchase.order.line": ["order_id", "product_id"],
            "stock.picking": ["name", "sale_id", "pos_order_id", "picking_type_id"],
            "stock.move": ["picking_id", "product_id", "sale_line_id", "purchase_line_id", "production_id", "raw_material_production_id",
                           "account_move_id"],
            "mrp.production": ["name", "product_id", "sale_line_id"],
            "account.move": ["name", "move_type", "partner_id"],
            "account.move.line": ["move_id", "product_id", "purchase_line_id"],
            "project.project": ["name", "sale_line_id"],
            "project.task": ["name", "project_id", "sale_line_id"],
            "pos.order": ["name", "partner_id", "account_move"],
            "pos.order.line": ["order_id", "product_id", "sale_order_line_id"],
        },
        "refs": {"res.partner": ["name"], "product.product": ["default_code"], "stock.warehouse": ["name"],
                 "stock.picking.type": ["name", "code"], "website": ["name"]},
        "m2m": [("sale.order.line", "invoice_lines")],
        "flows": [
            "CRM → Sales: a quotation made from an opportunity keeps `sale_order.opportunity_id`.",
            "Sales → Inventory: confirming an order creates delivery moves with `stock_move.sale_line_id`; the transfer has `sale_id`.",
            "Purchase → Inventory: confirming a purchase order creates receipt moves with `stock_move.purchase_line_id`.",
            "Sales/Purchase → Accounting: customer invoice lines are linked to order lines in `sale_order_line_invoice_rel`; "
            "vendor bill lines carry `account_move_line.purchase_line_id`.",
            "Inventory → Accounting: with automated valuation, a move's journal entry is `stock_move.account_move_id`.",
            "Sales → Manufacturing: make-to-order manufactured products keep `mrp_production.sale_line_id`; the MO's "
            "component and finished moves are `raw_material_production_id` and `production_id`.",
            "Sales → Project: selling a service that creates a task or project sets `sale_line_id` on it, so time can be invoiced.",
            "Point of Sale → Sales/Accounting: a POS order can settle a sales order (`pos_order_line.sale_order_line_id`) "
            "and an invoiced POS order points to its invoice (`pos_order.account_move`).",
        ],
        "notes": [
            "Bridge modules install themselves (`auto_install`) as soon as both apps they join are installed.",
            "Odoo 19 also ties sales orders, purchase orders and MOs to their moves through `stock_reference` "
            "(e.g. `stock_reference_sale_rel`), which replaced procurement groups.",
        ],
    },
]

# Which diagram owns a model, so reference copies can say where the details are.
HOME: dict[str, str] = {}
for _app in APPS[:-1]:
    for _name in _app["tables"]:
        HOME.setdefault(_name, _app["slug"])

# Labels to show instead of Odoo's own, where Odoo's is misleading.
LABELS = {
    "hr.work.location.location_type": "Location type (Odoo's label is \"Cover Image\")",
}

TABLE_NOTES = {
    "account_move_line": "Journal items. `balance` = debit − credit in company currency; `parent_state` copies the entry's state for fast queries.",
    "stock_quant": "One row per product × location × lot × package × owner. Never edit `quantity` directly: inventory "
                   "adjustments set `inventory_quantity` and apply it, which creates moves.",
    "project_task_user_rel": "Table of `project.task.stage.personal`. Each row is one assignee of a task (`task_id`, `user_id`) "
                             "and that user's personal stage for it (`stage_id`).",
    "hr_version": "One row per dated version of an employee's job, contract and private details.",
}

def readme(version: str, index: list) -> str:
    rows = "\n".join(f"| [{app['title']}]({app['slug']}.md) | [{app['slug']}.vdoo]({app['slug']}.vdoo) | "
                     f"{', '.join(f'`{m}`' for m in app['modules'])} | {own} | {rels} |" for app, own, rels in index)
    return f"""# Odoo {version} native tables

ER diagrams of the database tables behind the main Odoo apps, one vdoo diagram per app, each with a guide.
The tables and columns were read from the Odoo {version} Community source (`~/projects/odoo`), with each app's
modules and their dependencies installed, so names, types and nullability match what the ORM creates.

| App | Diagram | Modules | Own tables¹ | Relationships |
|---|---|---|---|---|
{rows}

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

- Community edition only. Enterprise apps and fields (Accounting's `account_accountant`, Studio, Field Service,
  Rental, Planning …) are not in the source used here.
- The diagrams show columns as the ORM defines them; database constraints added in SQL (unique indexes,
  check constraints) are not drawn.
"""
