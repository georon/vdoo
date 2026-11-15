# Products, variants, units and pricelists

The product catalogue shared by Sales, Purchase, Inventory, Manufacturing and Point of Sale. A product is a
template (`product_template`: name, type, unit, sales price) with one or more variants (`product_product`). Documents
always reference the variant. Attributes (size, colour) generate the variants, and pricelists compute prices.

- **Diagram:** [01_products.vdoo](01_products.vdoo) (open it in vdoo)
- **Install:** `product`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 11 tables, 3 many2many tables, 0 reference tables, 23 relationships

## How the data flows

1. Adding an attribute line (`product_template_attribute_line`) with values to a template creates one `product_template_attribute_value` per value; each combination of those becomes a `product_product` (`product_variant_combination` records which values a variant has).
2. A template without attributes has exactly one variant, so `product_product` always exists for sold items.
3. Pricelist rules (`product_pricelist_item`) apply to all products, a category, a template or a variant (`applied_on`) and compute a price from the list price, the cost or another pricelist (`base`).

## Things to know

- Odoo 19 removed unit categories: a unit is defined relative to another (`uom_uom.relative_uom_id`, `relative_factor`) instead of `category_id` and `factor_inv`.
- Since Odoo 18 `product_template.type` is `consu`, `service` or `combo`; stock tracking is the separate `is_storable` flag that Inventory adds.
- `product_product.standard_price` (cost) is company-dependent: a jsonb of company id → value.
- Name and description columns are translated, so they are jsonb (one value per language).

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`product_template`](#product_template) | `product.template` | Product | `product` |
| [`product_product`](#product_product) | `product.product` | Product Variant | `product` |
| [`product_category`](#product_category) | `product.category` | Product Category | `product` |
| [`uom_uom`](#uom_uom) | `uom.uom` | Product Unit of Measure | `uom` |
| [`product_attribute`](#product_attribute) | `product.attribute` | Product Attribute | `product` |
| [`product_attribute_value`](#product_attribute_value) | `product.attribute.value` | Attribute Value | `product` |
| [`product_template_attribute_line`](#product_template_attribute_line) | `product.template.attribute.line` | Product Template Attribute Line | `product` |
| [`product_template_attribute_value`](#product_template_attribute_value) | `product.template.attribute.value` | Product Template Attribute Value | `product` |
| [`product_tag`](#product_tag) | `product.tag` | Product Tag | `product` |
| [`product_pricelist`](#product_pricelist) | `product.pricelist` | Pricelist | `product` |
| [`product_pricelist_item`](#product_pricelist_item) | `product.pricelist.item` | Pricelist Rule | `product` |
| [`product_attribute_value_product_template_attribute_line_rel`](#product_attribute_value_product_template_attribute_line_rel) | many2many | `product.template.attribute.line.value_ids` ↔ `product.attribute.value` | `product` |
| [`product_variant_combination`](#product_variant_combination) | many2many | `product.product.product_template_attribute_value_ids` ↔ `product.template.attribute.value` | `product` |
| [`product_tag_product_template_rel`](#product_tag_product_template_rel) | many2many | `product.template.product_tag_ids` ↔ `product.tag` | `product` |

### product_template

`product.template` — Product.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `type` | varchar | no |  | Product Type (consu \| service \| combo) |
| `categ_id` | int | yes | `product_category.id` | Product Category |
| `uom_id` | int | no | `uom_uom.id` | Unit |
| `list_price` | numeric | yes |  | Sales Price |
| `default_code` | varchar | yes |  | Internal Reference (computed, stored) |
| `sale_ok` | boolean | yes |  | Sales |
| `purchase_ok` | boolean | yes |  | Purchase (computed, stored) |
| `company_id` | int | yes | `res_company.id` ¹ | Company |
| `active` | boolean | yes |  | Active |

### product_product

`product.product` — Product Variant. Delegation inheritance: every row has a `product.template` row through `product_tmpl_id`.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `product_tmpl_id` | int | no | `product_template.id` | Product Template |
| `default_code` | varchar | yes |  | Internal Reference |
| `barcode` | varchar | yes |  | Barcode |
| `standard_price` | jsonb | yes |  | Cost (company-dependent: one value per company) |
| `combination_indices` | varchar | yes |  | Combination indices (computed, stored) |
| `active` | boolean | yes |  | Active |

### product_category

`product.category` — Product Category.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Name |
| `complete_name` | varchar | yes |  | Complete Name (computed, stored) |
| `parent_id` | int | yes | `product_category.id` | Parent Category |

### uom_uom

`uom.uom` — Product Unit of Measure.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Unit Name (translated: one value per language) |
| `relative_factor` | numeric | no |  | Contains |
| `relative_uom_id` | int | yes | `uom_uom.id` | Reference Unit |
| `active` | boolean | yes |  | Active |

### product_attribute

`product.attribute` — Product Attribute.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Attribute (translated: one value per language) |
| `create_variant` | varchar | no |  | Variant Creation (always \| dynamic \| no_variant) |
| `display_type` | varchar | no |  | Display type (radio \| pills \| select \| color \| multi \| image) |
| `sequence` | int | yes |  | Sequence |

### product_attribute_value

`product.attribute.value` — Attribute Value.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Value (translated: one value per language) |
| `attribute_id` | int | no | `product_attribute.id` | Attribute |
| `default_extra_price` | float8 | yes |  | Default extra price |
| `sequence` | int | yes |  | Sequence |

### product_template_attribute_line

`product.template.attribute.line` — Product Template Attribute Line.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `product_tmpl_id` | int | no | `product_template.id` | Product Template |
| `attribute_id` | int | no | `product_attribute.id` | Attribute |
| `active` | boolean | yes |  | Active |

### product_template_attribute_value

`product.template.attribute.value` — Product Template Attribute Value.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `product_tmpl_id` | int | yes | `product_template.id` | Product tmpl (computed, stored) |
| `attribute_id` | int | yes | `product_attribute.id` | Attribute (computed, stored) |
| `attribute_line_id` | int | no | `product_template_attribute_line.id` | Attribute line |
| `product_attribute_value_id` | int | no | `product_attribute_value.id` | Attribute Value |
| `price_extra` | numeric | yes |  | Extra Price |
| `ptav_active` | boolean | yes |  | Active |

### product_tag

`product.tag` — Product Tag.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `color` | varchar | yes |  | Color |

### product_pricelist

`product.pricelist` — Pricelist.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Pricelist Name (translated: one value per language) |
| `currency_id` | int | no | `res_currency.id` ¹ | Currency |
| `company_id` | int | yes | `res_company.id` ¹ | Company |
| `active` | boolean | yes |  | Active |
| `sequence` | int | yes |  | Sequence |

### product_pricelist_item

`product.pricelist.item` — Pricelist Rule.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `pricelist_id` | int | yes | `product_pricelist.id` | Pricelist |
| `applied_on` | varchar | no |  | Apply On (3_global \| 2_product_category \| 1_product \| 0_product_variant) |
| `categ_id` | int | yes | `product_category.id` | Category |
| `product_tmpl_id` | int | yes | `product_template.id` | Product |
| `product_id` | int | yes | `product_product.id` | Variant |
| `min_quantity` | numeric | yes |  | Min. Quantity |
| `date_start` | timestamp | yes |  | Start Date |
| `date_end` | timestamp | yes |  | End Date |
| `compute_price` | varchar | no |  | Compute price (percentage \| formula \| fixed) |
| `fixed_price` | numeric | yes |  | Fixed Price |
| `percent_price` | float8 | yes |  | Percentage Price |
| `base` | varchar | no |  | Based on (list_price \| standard_price \| pricelist) |
| `base_pricelist_id` | int | yes | `product_pricelist.id` | Other Pricelist |

### product_attribute_value_product_template_attribute_line_rel

Many2many table of `product.template.attribute.line.value_ids` (Values). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `product_template_attribute_line_id` | int | no | `product_template_attribute_line.id` | product.template.attribute.line id |
| `product_attribute_value_id` | int | no | `product_attribute_value.id` | product.attribute.value id |

### product_variant_combination

Many2many table of `product.product.product_template_attribute_value_ids` (Attribute Values). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `product_product_id` | int | no | `product_product.id` | product.product id |
| `product_template_attribute_value_id` | int | no | `product_template_attribute_value.id` | product.template.attribute.value id |

### product_tag_product_template_rel

Many2many table of `product.template.product_tag_ids` (Tags). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `product_template_id` | int | no | `product_template.id` | product.template id |
| `product_tag_id` | int | no | `product_tag.id` | product.tag id |

¹ The referenced table is not drawn in this diagram.
