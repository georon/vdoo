# Contacts, users and companies

The `base` tables every other app points to: contacts (`res_partner`), users, companies, access groups,
currencies, countries and bank accounts. A customer, a vendor, an employee's work contact, a company's address and a
user's identity are all rows of `res_partner`; the other apps never store names or addresses of their own.

- **Diagram:** [00_contacts_core.vdoo](00_contacts_core.vdoo) (open it in vdoo)
- **Install:** `contacts`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 11 tables, 4 many2many tables, 0 reference tables, 28 relationships

## How the data flows

1. A company is a contact first: `res_company.partner_id` holds its name and address in `res_partner`.
2. A person who works for a company is a contact whose `parent_id` is the company contact; `commercial_partner_id` points to the top-level company and is what invoices and pricing use.
3. A user (`res_users`) is a contact who can sign in: `_inherits` gives every user a `res_partner` row through `partner_id`, so name and email live on the contact.
4. Access comes from groups: `res_groups_users_rel` lists each user's groups and `res_groups_implied_rel` makes one group include others.

## Things to know

- Odoo 19 renamed the user's groups field to `group_ids` (it was `groups_id`); the table is still `res_groups_users_rel`.
- Odoo 19 replaced the group's application category with a privilege: `res_groups.privilege_id` → `res_groups_privilege`, which carries the `ir_module_category` link.
- `res_partner.type` tells a company or person apart from its other addresses: contact, invoice, delivery or other.
- Partner tags are `res_partner_category`; contacts and tags meet in `res_partner_res_partner_category_rel`.

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`res_partner`](#res_partner) | `res.partner` | Contact | `base` |
| [`res_users`](#res_users) | `res.users` | User | `base` |
| [`res_company`](#res_company) | `res.company` | Companies | `base` |
| [`res_groups`](#res_groups) | `res.groups` | Access Groups | `base` |
| [`res_groups_privilege`](#res_groups_privilege) | `res.groups.privilege` | Privileges | `base` |
| [`res_currency`](#res_currency) | `res.currency` | Currency | `base` |
| [`res_country`](#res_country) | `res.country` | Country | `base` |
| [`res_country_state`](#res_country_state) | `res.country.state` | Country state | `base` |
| [`res_partner_category`](#res_partner_category) | `res.partner.category` | Partner Tags | `base` |
| [`res_partner_bank`](#res_partner_bank) | `res.partner.bank` | Bank Accounts | `base` |
| [`res_bank`](#res_bank) | `res.bank` | Bank | `base` |
| [`res_partner_res_partner_category_rel`](#res_partner_res_partner_category_rel) | many2many | `res.partner.category_id` ↔ `res.partner.category` | `base` |
| [`res_groups_users_rel`](#res_groups_users_rel) | many2many | `res.users.group_ids` ↔ `res.groups` | `base` |
| [`res_company_users_rel`](#res_company_users_rel) | many2many | `res.users.company_ids` ↔ `res.company` | `base` |
| [`res_groups_implied_rel`](#res_groups_implied_rel) | many2many | `res.groups.implied_ids` ↔ `res.groups` | `base` |

### res_partner

`res.partner` — Contact.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Name |
| `complete_name` | varchar | yes |  | Complete name (computed, stored) |
| `is_company` | boolean | yes |  | Is a Company |
| `type` | varchar | yes |  | Address Type (contact \| invoice \| delivery \| other) |
| `parent_id` | int | yes | `res_partner.id` | Related Company |
| `commercial_partner_id` | int | yes | `res_partner.id` | Commercial Entity (computed, stored) |
| `company_id` | int | yes | `res_company.id` | Company |
| `user_id` | int | yes | `res_users.id` | Salesperson (computed, stored) |
| `ref` | varchar | yes |  | Reference |
| `vat` | varchar | yes |  | Tax ID |
| `email` | varchar | yes |  | Email |
| `phone` | varchar | yes |  | Phone |
| `street` | varchar | yes |  | Street |
| `city` | varchar | yes |  | City |
| `zip` | varchar | yes |  | Zip |
| `state_id` | int | yes | `res_country_state.id` | State |
| `country_id` | int | yes | `res_country.id` | Country |
| `lang` | varchar | yes |  | Language (computed, stored) |
| `active` | boolean | yes |  | Active |

### res_users

`res.users` — User. Delegation inheritance: every row has a `res.partner` row through `partner_id`.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `partner_id` | int | no | `res_partner.id` | Related Partner |
| `login` | varchar | no |  | Login |
| `company_id` | int | no | `res_company.id` | Company |
| `share` | boolean | yes |  | Share User (computed, stored) |
| `active` | boolean | yes |  | Active |

### res_company

`res.company` — Companies.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Company Name (computed, stored) |
| `partner_id` | int | no | `res_partner.id` | Partner |
| `parent_id` | int | yes | `res_company.id` | Parent Company |
| `currency_id` | int | no | `res_currency.id` | Currency |
| `active` | boolean | yes |  | Active |

### res_groups

`res.groups` — Access Groups.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `privilege_id` | int | yes | `res_groups_privilege.id` | Privilege |
| `share` | boolean | yes |  | Share Group |

### res_groups_privilege

`res.groups.privilege` — Privileges.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `category_id` | int | yes | `ir_module_category.id` ¹ | Category |
| `sequence` | int | yes |  | Sequence |

### res_currency

`res.currency` — Currency.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Currency |
| `symbol` | varchar | no |  | Symbol |
| `rounding` | numeric | yes |  | Rounding Factor |
| `decimal_places` | int | yes |  | Decimal places (computed, stored) |
| `active` | boolean | yes |  | Active |

### res_country

`res.country` — Country.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Country Name (translated: one value per language) |
| `code` | varchar | no |  | Country Code |
| `currency_id` | int | yes | `res_currency.id` | Currency |

### res_country_state

`res.country.state` — Country state.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `country_id` | int | no | `res_country.id` | Country |
| `name` | varchar | no |  | State Name |
| `code` | varchar | no |  | State Code |

### res_partner_category

`res.partner.category` — Partner Tags.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `parent_id` | int | yes | `res_partner_category.id` | Category |
| `color` | int | yes |  | Color |
| `active` | boolean | yes |  | Active |

### res_partner_bank

`res.partner.bank` — Bank Accounts.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `partner_id` | int | no | `res_partner.id` | Account Holder |
| `acc_number` | varchar | no |  | Account Number |
| `bank_id` | int | yes | `res_bank.id` | Bank |
| `currency_id` | int | yes | `res_currency.id` | Currency |
| `company_id` | int | yes | `res_company.id` | Company (computed, stored) |
| `allow_out_payment` | boolean | yes |  | Send Money |

### res_bank

`res.bank` — Bank.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Name |
| `bic` | varchar | yes |  | Bank Identifier Code |
| `country` | int | yes | `res_country.id` | Country |

### res_partner_res_partner_category_rel

Many2many table of `res.partner.category_id` (Tags). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `partner_id` | int | no | `res_partner.id` | res.partner id |
| `category_id` | int | no | `res_partner_category.id` | res.partner.category id |

### res_groups_users_rel

Many2many table of `res.users.group_ids` (Groups). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `uid` | int | no | `res_users.id` | res.users id |
| `gid` | int | no | `res_groups.id` | res.groups id |

### res_company_users_rel

Many2many table of `res.users.company_ids` (Companies). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `user_id` | int | no | `res_users.id` | res.users id |
| `cid` | int | no | `res_company.id` | res.company id |

### res_groups_implied_rel

Many2many table of `res.groups.implied_ids` (Implied Groups). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `gid` | int | no | `res_groups.id` | res.groups id |
| `hid` | int | no | `res_groups.id` | res.groups id |

¹ The referenced table is not drawn in this diagram.
