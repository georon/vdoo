# Website and eCommerce

Websites, pages and menus, the shop's catalogue fields, and the cart. A cart is a draft sales order with a
`website_id`; checkout confirms it like any other order.

- **Diagram:** [11_website_ecommerce.vdoo](11_website_ecommerce.vdoo) (open it in vdoo)
- **Install:** `website_sale`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 10 tables, 1 many2many tables, 4 reference tables, 25 relationships

## How the data flows

1. A database can host several websites; most website content can be limited to one (`website_id`) or shared (empty).
2. Pages are views: `website_page` delegates to `ir_ui_view` (`view_id`) for its content.
3. Products are shown when `is_published` is set, in eCommerce categories (`product_public_category_product_template_rel`).
4. Adding to cart creates or updates a draft `sale_order` with the `website_id`; paying confirms it.
5. Visitors are tracked in `website_visitor` and linked to the contact once they sign in or check out.

## Things to know

- eCommerce categories (`product_public_category`) are separate from internal product categories (`product_category`).
- Pricelists offered on the website are those with `selectable` or assigned to the website.

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`website`](#website) | `website` | Website | `website` |
| [`website_page`](#website_page) | `website.page` | Page | `website` |
| [`website_menu`](#website_menu) | `website.menu` | Website Menu | `website` |
| [`website_visitor`](#website_visitor) | `website.visitor` | Website Visitor | `website` |
| [`product_template`](#product_template) | `product.template` | Product | `product` |
| [`product_public_category`](#product_public_category) | `product.public.category` | Website Product Category | `website_sale` |
| [`product_ribbon`](#product_ribbon) | `product.ribbon` | Product ribbon | `website_sale` |
| [`product_image`](#product_image) | `product.image` | Product Image | `website_sale` |
| [`product_pricelist`](#product_pricelist) | `product.pricelist` | Pricelist | `product` |
| [`sale_order`](#sale_order) | `sale.order` | Sales Order | `sale` |
| [`product_public_category_product_template_rel`](#product_public_category_product_template_rel) | many2many | `product.template.public_categ_ids` ↔ `product.public.category` | `website_sale` |

Reference tables (only the columns this app uses; see their own diagrams): `res_partner`, `res_users`, `product_product`, `sale_order_line`.

### website

`website` — Website.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Website Name |
| `domain` | varchar | yes |  | Website Domain |
| `company_id` | int | no | `res_company.id` ¹ | Company |
| `default_lang_id` | int | no | `res_lang.id` ¹ | Default Language |
| `user_id` | int | no | `res_users.id` | Public User |
| `salesperson_id` | int | yes | `res_users.id` | Salesperson |
| `salesteam_id` | int | yes | `crm_team.id` ¹ | Sales Team |
| `shop_ppg` | int | yes |  | Number of products in the grid on the shop |

### website_page

`website.page` — Page. Delegation inheritance: every row has a `ir.ui.view` row through `view_id`.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `url` | varchar | no |  | Page URL |
| `view_id` | int | no | `ir_ui_view.id` ¹ | View |
| `website_id` | int | yes | `website.id` | Website (computed, stored) |
| `website_indexed` | boolean | yes |  | Is Indexed |
| `date_publish` | timestamp | yes |  | Publishing Date |

### website_menu

`website.menu` — Website Menu.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Menu (translated: one value per language) |
| `url` | varchar | no |  | Url (computed, stored) |
| `page_id` | int | yes | `website_page.id` | Related Page |
| `parent_id` | int | yes | `website_menu.id` | Parent Menu |
| `website_id` | int | yes | `website.id` | Website |
| `sequence` | int | yes |  | Sequence |

### website_visitor

`website.visitor` — Website Visitor.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `website_id` | int | yes | `website.id` | Website |
| `partner_id` | int | yes | `res_partner.id` | Contact (computed, stored) |
| `country_id` | int | yes | `res_country.id` ¹ | Country |
| `visit_count` | int | yes |  | # Visits |
| `last_connection_datetime` | timestamp | yes |  | Last Connection |
| `access_token` | varchar | no |  | Access token |

### product_template

`product.template` — Product.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `website_id` | int | yes | `website.id` | Website |
| `is_published` | boolean | yes |  | Is Published |
| `website_sequence` | int | yes |  | Website Sequence |
| `website_ribbon_id` | int | yes | `product_ribbon.id` | Ribbon |
| `list_price` | numeric | yes |  | Sales Price |
| `compare_list_price` | numeric | yes |  | Compare to Price |
| `sale_ok` | boolean | yes |  | Sales |

### product_public_category

`product.public.category` — Website Product Category.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `parent_id` | int | yes | `product_public_category.id` | Parent |
| `website_id` | int | yes | `website.id` | Website |
| `sequence` | int | yes |  | Sequence |

### product_ribbon

`product.ribbon` — Product ribbon.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Ribbon Name (translated: one value per language) |
| `position` | varchar | no |  | Position (left \| right) |
| `bg_color` | varchar | no |  | Background Color |
| `text_color` | varchar | no |  | Text Color |

### product_image

`product.image` — Product Image.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Name |
| `product_tmpl_id` | int | yes | `product_template.id` | Product Template |
| `product_variant_id` | int | yes | `product_product.id` | Product Variant |
| `video_url` | varchar | yes |  | Video URL |
| `sequence` | int | yes |  | Sequence |

### product_pricelist

`product.pricelist` — Pricelist.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Pricelist Name (translated: one value per language) |
| `website_id` | int | yes | `website.id` | Website |
| `selectable` | boolean | yes |  | Selectable |
| `currency_id` | int | no | `res_currency.id` ¹ | Currency |

### sale_order

`sale.order` — Sales Order.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Order Reference |
| `state` | varchar | yes |  | Status (draft \| sent \| sale \| cancel) |
| `website_id` | int | yes | `website.id` | Website |
| `partner_id` | int | no | `res_partner.id` | Customer |
| `pricelist_id` | int | yes | `product_pricelist.id` | Pricelist (computed, stored) |
| `amount_total` | numeric | yes |  | Total (computed, stored) |
| `cart_recovery_email_sent` | boolean | yes |  | Cart recovery email already sent |

### product_public_category_product_template_rel

Many2many table of `product.template.public_categ_ids` (Website Product Category). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `product_template_id` | int | no | `product_template.id` | product.template id |
| `product_public_category_id` | int | no | `product_public_category.id` | product.public.category id |

¹ The referenced table is not drawn in this diagram.
