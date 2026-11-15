# Accounting and invoicing

Double-entry bookkeeping. Invoices, bills, credit notes, payments and miscellaneous entries are all journal
entries (`account_move`) with balanced journal items (`account_move_line`). Taxes, payment terms, fiscal positions,
reconciliation and bank statements build on them.

- **Diagram:** [06_accounting.vdoo](06_accounting.vdoo) (open it in vdoo)
- **Install:** `account`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 16 tables, 2 many2many tables, 2 reference tables, 43 relationships

## How the data flows

1. Every document is an `account_move` in a journal; `move_type` says which: `entry`, `out_invoice`, `out_refund`, `in_invoice`, `in_refund`, `out_receipt`, `in_receipt`.
2. Its `account_move_line` rows must balance (sum of debit = sum of credit). Invoice product lines, tax lines and the receivable/payable line are all journal items; `display_type` tells them apart.
3. Taxes on a line are in `account_move_line_account_tax_rel`; the tax amounts become their own lines (`tax_line_id`), split by the tax's repartition lines.
4. A payment (`account_payment`) posts its own journal entry (`move_id`). Reconciling matches a receivable/payable line with payment lines through `account_partial_reconcile`; when fully paid they share an `account_full_reconcile`.
5. Bank statement lines (`account_bank_statement_line`) each own a journal entry and are reconciled the same way.

## Things to know

- Since Odoo 18 an account can be shared by several companies: `account_account_res_company_rel`, and the code is per company in `account_account.code_store` (jsonb).
- Analytic accounting is not a foreign key on journal items: `analytic_distribution` is jsonb mapping analytic account ids to percentages; analytic lines (`account_analytic_line`) are created from it.
- Payment and invoice amounts in company currency are on the lines (`balance`), document currency in `amount_currency`.
- Bank reconciliation widgets, reports and asset management come from Enterprise modules (`account_accountant` …), which are not in the Community source used here.

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`account_move`](#account_move) | `account.move` | Journal Entry | `account` |
| [`account_move_line`](#account_move_line) | `account.move.line` | Journal Item | `account` |
| [`account_account`](#account_account) | `account.account` | Account | `account` |
| [`account_journal`](#account_journal) | `account.journal` | Journal | `account` |
| [`account_tax`](#account_tax) | `account.tax` | Tax | `account` |
| [`account_tax_group`](#account_tax_group) | `account.tax.group` | Tax Group | `account` |
| [`account_tax_repartition_line`](#account_tax_repartition_line) | `account.tax.repartition.line` | Tax Repartition Line | `account` |
| [`account_payment`](#account_payment) | `account.payment` | Payments | `account` |
| [`account_payment_term`](#account_payment_term) | `account.payment.term` | Payment Terms | `account` |
| [`account_payment_term_line`](#account_payment_term_line) | `account.payment.term.line` | Payment Terms Line | `account` |
| [`account_partial_reconcile`](#account_partial_reconcile) | `account.partial.reconcile` | Partial Reconcile | `account` |
| [`account_full_reconcile`](#account_full_reconcile) | `account.full.reconcile` | Full Reconcile | `account` |
| [`account_bank_statement_line`](#account_bank_statement_line) | `account.bank.statement.line` | Bank Statement Line | `account` |
| [`account_fiscal_position`](#account_fiscal_position) | `account.fiscal.position` | Fiscal Position | `account` |
| [`account_analytic_account`](#account_analytic_account) | `account.analytic.account` | Analytic Account | `analytic` |
| [`account_analytic_plan`](#account_analytic_plan) | `account.analytic.plan` | Analytic Plans | `analytic` |
| [`account_move_line_account_tax_rel`](#account_move_line_account_tax_rel) | many2many | `account.move.line.tax_ids` ↔ `account.tax` | `account` |
| [`account_account_res_company_rel`](#account_account_res_company_rel) | many2many | `account.account.company_ids` ↔ `res.company` | `account` |

Reference tables (only the columns this app uses; see their own diagrams): `res_partner`, `product_product`.

### account_move

`account.move` — Journal Entry.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Number (computed, stored) |
| `move_type` | varchar | no |  | Type (entry \| out_invoice \| out_refund \| in_invoice \| in_refund \| out_receipt \| in_receipt) |
| `state` | varchar | no |  | Status (draft \| posted \| cancel) |
| `journal_id` | int | no | `account_journal.id` | Journal (computed, stored) |
| `date` | date | no |  | Date (computed, stored) |
| `invoice_date` | date | yes |  | Invoice/Bill Date |
| `invoice_date_due` | date | yes |  | Due Date (computed, stored) |
| `partner_id` | int | yes | `res_partner.id` | Partner |
| `commercial_partner_id` | int | yes | `res_partner.id` | Commercial Entity (computed, stored) |
| `currency_id` | int | no | `res_currency.id` ¹ | Currency (computed, stored) |
| `invoice_payment_term_id` | int | yes | `account_payment_term.id` | Payment Terms (computed, stored) |
| `fiscal_position_id` | int | yes | `account_fiscal_position.id` | Fiscal Position (computed, stored) |
| `amount_untaxed` | numeric | yes |  | Untaxed Amount (computed, stored) |
| `amount_tax` | numeric | yes |  | Tax (computed, stored) |
| `amount_total` | numeric | yes |  | Total (computed, stored) |
| `amount_residual` | numeric | yes |  | Amount Due (computed, stored) |
| `payment_state` | varchar | yes |  | Payment Status (not_paid \| in_payment \| paid \| partial \| reversed \| blocked \| invoicing_legacy; computed, stored) |
| `reversed_entry_id` | int | yes | `account_move.id` | Reversal of |
| `origin_payment_id` | int | yes | `account_payment.id` | Payment |
| `statement_line_id` | int | yes | `account_bank_statement_line.id` | Statement Line |
| `invoice_origin` | varchar | yes |  | Origin |
| `ref` | varchar | yes |  | Reference |
| `company_id` | int | yes | `res_company.id` ¹ | Company (computed, stored) |

### account_move_line

`account.move.line` — Journal Item.

Journal items. `balance` = debit − credit in company currency; `parent_state` copies the entry's state for fast queries.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `move_id` | int | no | `account_move.id` | Journal Entry |
| `journal_id` | int | yes | `account_journal.id` | Journal (computed, stored) |
| `account_id` | int | yes | `account_account.id` | Account (computed, stored) |
| `partner_id` | int | yes | `res_partner.id` | Partner (computed, stored) |
| `name` | varchar | yes |  | Label (computed, stored) |
| `display_type` | varchar | no |  | Display type (product \| cogs \| tax \| discount \| rounding \| payment_term \| line_section \| line_subsection \| line_note \| epd \| non_deductible_product_total \| non_deductible_product \| non_deductible_tax; computed, stored) |
| `debit` | numeric | yes |  | Debit (computed, stored) |
| `credit` | numeric | yes |  | Credit (computed, stored) |
| `balance` | numeric | yes |  | Balance (computed, stored) |
| `amount_currency` | numeric | yes |  | Amount in Currency (computed, stored) |
| `currency_id` | int | no | `res_currency.id` ¹ | Currency (computed, stored) |
| `product_id` | int | yes | `product_product.id` | Product |
| `quantity` | numeric | yes |  | Quantity (computed, stored) |
| `price_unit` | numeric | yes |  | Unit Price (computed, stored) |
| `price_subtotal` | numeric | yes |  | Subtotal (computed, stored) |
| `tax_line_id` | int | yes | `account_tax.id` | Originator Tax (computed, stored) |
| `tax_repartition_line_id` | int | yes | `account_tax_repartition_line.id` | Originator Tax Distribution Line |
| `date` | date | yes |  | Date (computed, stored) |
| `date_maturity` | date | yes |  | Due Date |
| `reconciled` | boolean | yes |  | Reconciled (computed, stored) |
| `amount_residual` | numeric | yes |  | Residual Amount (computed, stored) |
| `full_reconcile_id` | int | yes | `account_full_reconcile.id` | Matching |
| `payment_id` | int | yes | `account_payment.id` | Originator Payment (computed, stored) |
| `statement_line_id` | int | yes | `account_bank_statement_line.id` | Originator Statement Line (computed, stored) |
| `analytic_distribution` | jsonb | yes |  | Analytic Distribution (computed, stored) |
| `parent_state` | varchar | yes |  | Parent state (computed, stored) |

### account_account

`account.account` — Account.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `code_store` | jsonb | yes |  | Code store (company-dependent: one value per company) |
| `name` | jsonb | no |  | Account Name (translated: one value per language) |
| `account_type` | varchar | no |  | Type (asset_receivable \| asset_cash \| asset_current \| asset_non_current \| asset_prepayments \| asset_fixed \| liability_payable \| liability_credit_card \| liability_current \| liability_non_current \| equity \| equity_unaffected \| income \| income_other \| expense \| expense_other \| expense_depreciation \| expense_direct_cost \| off_balance; computed, stored) |
| `reconcile` | boolean | yes |  | Allow Reconciliation (computed, stored) |
| `currency_id` | int | yes | `res_currency.id` ¹ | Account Currency |
| `active` | boolean | yes |  | Active |

### account_journal

`account.journal` — Journal.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Journal Name (translated: one value per language) |
| `code` | varchar | no |  | Sequence Prefix (computed, stored) |
| `type` | varchar | no |  | Type (sale \| purchase \| cash \| bank \| credit \| general) |
| `default_account_id` | int | yes | `account_account.id` | Default Account |
| `suspense_account_id` | int | yes | `account_account.id` | Suspense Account (computed, stored) |
| `currency_id` | int | yes | `res_currency.id` ¹ | Currency |
| `bank_account_id` | int | yes | `res_partner_bank.id` ¹ | Bank Account |
| `company_id` | int | no | `res_company.id` ¹ | Company |

### account_tax

`account.tax` — Tax.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Tax Name (translated: one value per language) |
| `type_tax_use` | varchar | no |  | Tax Type (sale \| purchase \| none) |
| `amount_type` | varchar | no |  | Tax Computation (group \| fixed \| percent \| division) |
| `amount` | numeric | no |  | Amount |
| `price_include_override` | varchar | yes |  | Included in Price (tax_included \| tax_excluded) |
| `tax_group_id` | int | no | `account_tax_group.id` | Tax Group (computed, stored) |
| `country_id` | int | no | `res_country.id` ¹ | Country (computed, stored) |
| `company_id` | int | no | `res_company.id` ¹ | Company |

### account_tax_group

`account.tax.group` — Tax Group.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `country_id` | int | yes | `res_country.id` ¹ | Country (computed, stored) |
| `company_id` | int | no | `res_company.id` ¹ | Company |

### account_tax_repartition_line

`account.tax.repartition.line` — Tax Repartition Line.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `tax_id` | int | yes | `account_tax.id` | Tax |
| `repartition_type` | varchar | no |  | Based On (base \| tax) |
| `document_type` | varchar | no |  | Related to (invoice \| refund) |
| `factor_percent` | numeric | no |  | % |
| `account_id` | int | yes | `account_account.id` | Account |

### account_payment

`account.payment` — Payments.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Number (computed, stored) |
| `payment_type` | varchar | no |  | Payment Type (outbound \| inbound) |
| `partner_type` | varchar | no |  | Partner type (customer \| supplier) |
| `partner_id` | int | yes | `res_partner.id` | Customer/Vendor |
| `amount` | numeric | yes |  | Amount |
| `currency_id` | int | yes | `res_currency.id` ¹ | Currency (computed, stored) |
| `date` | date | no |  | Date |
| `journal_id` | int | no | `account_journal.id` | Journal (computed, stored) |
| `move_id` | int | yes | `account_move.id` | Journal Entry |
| `state` | varchar | no |  | State (draft \| in_process \| paid \| canceled \| rejected; computed, stored) |
| `outstanding_account_id` | int | yes | `account_account.id` | Outstanding Account (computed, stored) |
| `destination_account_id` | int | yes | `account_account.id` | Destination Account (computed, stored) |
| `memo` | varchar | yes |  | Memo |
| `company_id` | int | no | `res_company.id` ¹ | Company (computed, stored) |

### account_payment_term

`account.payment.term` — Payment Terms.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Payment Terms (translated: one value per language) |
| `early_discount` | boolean | yes |  | Early Discount |
| `discount_percentage` | float8 | yes |  | Discount % |
| `discount_days` | int | yes |  | Discount Days |

### account_payment_term_line

`account.payment.term.line` — Payment Terms Line.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `payment_id` | int | no | `account_payment_term.id` | Payment Terms |
| `value` | varchar | no |  | Value (percent \| fixed) |
| `value_amount` | numeric | yes |  | Due (computed, stored) |
| `delay_type` | varchar | no |  | Delay type (days_after \| days_after_end_of_month \| days_after_end_of_next_month \| days_end_of_month_on_the) |
| `nb_days` | int | yes |  | Days (computed, stored) |

### account_partial_reconcile

`account.partial.reconcile` — Partial Reconcile.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `debit_move_id` | int | no | `account_move_line.id` | Debit move |
| `credit_move_id` | int | no | `account_move_line.id` | Credit move |
| `amount` | numeric | yes |  | Amount |
| `debit_amount_currency` | numeric | yes |  | Debit amount currency |
| `credit_amount_currency` | numeric | yes |  | Credit amount currency |
| `full_reconcile_id` | int | yes | `account_full_reconcile.id` | Full Reconcile |
| `exchange_move_id` | int | yes | `account_move.id` | Exchange move |
| `max_date` | date | yes |  | Max Date of Matched Lines (computed, stored) |

### account_full_reconcile

`account.full.reconcile` — Full Reconcile.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |

### account_bank_statement_line

`account.bank.statement.line` — Bank Statement Line. Delegation inheritance: every row has a `account.move` row through `move_id`.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `move_id` | int | no | `account_move.id` | Journal Entry |
| `journal_id` | int | no | `account_journal.id` | Journal (computed, stored) |
| `partner_id` | int | yes | `res_partner.id` | Partner |
| `payment_ref` | varchar | yes |  | Label |
| `amount` | numeric | yes |  | Amount |
| `amount_currency` | numeric | yes |  | Amount in Currency (computed, stored) |
| `foreign_currency_id` | int | yes | `res_currency.id` ¹ | Foreign Currency |
| `is_reconciled` | boolean | yes |  | Is Reconciled (computed, stored) |

### account_fiscal_position

`account.fiscal.position` — Fiscal Position.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Fiscal Position (translated: one value per language) |
| `country_id` | int | yes | `res_country.id` ¹ | Country |
| `auto_apply` | boolean | yes |  | Detect Automatically |
| `vat_required` | boolean | yes |  | VAT required |
| `company_id` | int | no | `res_company.id` ¹ | Company |

### account_analytic_account

`account.analytic.account` — Analytic Account.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Analytic Account (translated: one value per language) |
| `code` | varchar | yes |  | Reference |
| `plan_id` | int | no | `account_analytic_plan.id` | Plan |
| `partner_id` | int | yes | `res_partner.id` | Customer |
| `company_id` | int | yes | `res_company.id` ¹ | Company |

### account_analytic_plan

`account.analytic.plan` — Analytic Plans.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `parent_id` | int | yes | `account_analytic_plan.id` | Parent |

### account_move_line_account_tax_rel

Many2many table of `account.move.line.tax_ids` (Taxes). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `account_move_line_id` | int | no | `account_move_line.id` | account.move.line id |
| `account_tax_id` | int | no | `account_tax.id` | account.tax id |

### account_account_res_company_rel

Many2many table of `account.account.company_ids` (Companies). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `account_account_id` | int | no | `account_account.id` | account.account id |
| `res_company_id` | int | no | `res_company.id` ¹ | res.company id |

¹ The referenced table is not drawn in this diagram.
