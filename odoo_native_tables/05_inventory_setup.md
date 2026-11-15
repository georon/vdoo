# Inventory: warehouses, locations and routes

The configuration that transfers and moves follow: warehouses, the location tree, operation types, routes and
their rules, and reordering rules. 05_inventory_operations has the transfers and stock levels.

- **Diagram:** [05_inventory_setup.vdoo](05_inventory_setup.vdoo) (open it in vdoo)
- **Install:** `stock`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 6 tables, 1 many2many tables, 3 reference tables, 25 relationships

## How the data flows

1. Each warehouse creates its locations (a view location with the stock location `lot_stock_id` under it) and its operation types (receipts, deliveries, internal transfers), which give transfers their sequence and default locations.
2. `reception_steps` and `delivery_steps` (one, two or three steps) decide which routes and rules the warehouse uses.
3. A route is a set of rules (`stock_rule`); each rule pulls or pushes goods between two locations with an operation type.
4. Routes apply to products (`stock_route_product`), product categories or warehouses.
5. Reordering rules (`stock_warehouse_orderpoint`) keep a product between a minimum and maximum quantity in a location by triggering a route (buy, manufacture, resupply).

## Things to know

- Locations form a tree (`location_id` is the parent); `usage` separates real stock (`internal`) from supplier, customer, inventory-loss, production and transit locations.
- Products that track stock have `product_template.is_storable = true`, and `tracking` (none, lot, serial) decides whether moves need lots (both added by this module).

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`stock_warehouse`](#stock_warehouse) | `stock.warehouse` | Warehouse | `stock` |
| [`stock_location`](#stock_location) | `stock.location` | Inventory Locations | `stock` |
| [`stock_picking_type`](#stock_picking_type) | `stock.picking.type` | Picking Type | `stock` |
| [`stock_route`](#stock_route) | `stock.route` | Inventory Routes | `stock` |
| [`stock_rule`](#stock_rule) | `stock.rule` | Stock Rule | `stock` |
| [`stock_warehouse_orderpoint`](#stock_warehouse_orderpoint) | `stock.warehouse.orderpoint` | Minimum Inventory Rule | `stock` |
| [`stock_route_product`](#stock_route_product) | many2many | `stock.route.product_ids` ↔ `product.template` | `stock` |

Reference tables (only the columns this app uses; see their own diagrams): `product_product`, `product_template`, `res_partner`.

### stock_warehouse

`stock.warehouse` — Warehouse.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Warehouse |
| `code` | varchar | no |  | Short Name |
| `partner_id` | int | yes | `res_partner.id` | Address |
| `view_location_id` | int | no | `stock_location.id` | View Location |
| `lot_stock_id` | int | no | `stock_location.id` | Location Stock |
| `reception_steps` | varchar | no |  | Incoming Shipments (one_step \| two_steps \| three_steps) |
| `delivery_steps` | varchar | no |  | Outgoing Shipments (ship_only \| pick_ship \| pick_pack_ship) |
| `in_type_id` | int | yes | `stock_picking_type.id` | In Type |
| `out_type_id` | int | yes | `stock_picking_type.id` | Out Type |
| `int_type_id` | int | yes | `stock_picking_type.id` | Internal Type |
| `company_id` | int | no | `res_company.id` ¹ | Company |

### stock_location

`stock.location` — Inventory Locations.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Location Name |
| `complete_name` | varchar | yes |  | Full Location Name (computed, stored) |
| `usage` | varchar | no |  | Location Type (supplier \| view \| internal \| customer \| inventory \| production \| transit) |
| `location_id` | int | yes | `stock_location.id` | Parent Location |
| `warehouse_id` | int | yes | `stock_warehouse.id` | Warehouse (computed, stored) |
| `company_id` | int | yes | `res_company.id` ¹ | Company |
| `active` | boolean | yes |  | Active |

### stock_picking_type

`stock.picking.type` — Picking Type.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Operation Type (translated: one value per language) |
| `code` | varchar | no |  | Type of Operation (incoming \| outgoing \| internal) |
| `sequence_code` | varchar | no |  | Sequence Prefix |
| `warehouse_id` | int | yes | `stock_warehouse.id` | Warehouse (computed, stored) |
| `default_location_src_id` | int | no | `stock_location.id` | Source Location (computed, stored) |
| `default_location_dest_id` | int | no | `stock_location.id` | Destination Location (computed, stored) |
| `return_picking_type_id` | int | yes | `stock_picking_type.id` | Operation Type for Returns |
| `reservation_method` | varchar | no |  | Reservation Method (at_confirm \| manual \| by_date) |
| `company_id` | int | no | `res_company.id` ¹ | Company |

### stock_route

`stock.route` — Inventory Routes.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Route (translated: one value per language) |
| `sequence` | int | yes |  | Sequence |
| `product_selectable` | boolean | yes |  | Applicable on Product |
| `warehouse_selectable` | boolean | yes |  | Applicable on Warehouse |
| `company_id` | int | yes | `res_company.id` ¹ | Company |
| `active` | boolean | yes |  | Active |

### stock_rule

`stock.rule` — Stock Rule.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `action` | varchar | no |  | Action (pull \| push \| pull_push) |
| `route_id` | int | no | `stock_route.id` | Route |
| `location_src_id` | int | yes | `stock_location.id` | Source Location |
| `location_dest_id` | int | no | `stock_location.id` | Destination Location |
| `picking_type_id` | int | no | `stock_picking_type.id` | Operation Type |
| `procure_method` | varchar | no |  | Supply Method (make_to_stock \| make_to_order \| mts_else_mto) |
| `warehouse_id` | int | yes | `stock_warehouse.id` | Warehouse |

### stock_warehouse_orderpoint

`stock.warehouse.orderpoint` — Minimum Inventory Rule.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Name |
| `product_id` | int | no | `product_product.id` | Product |
| `warehouse_id` | int | no | `stock_warehouse.id` | Warehouse (computed, stored) |
| `location_id` | int | no | `stock_location.id` | Location (computed, stored) |
| `product_min_qty` | numeric | no |  | Min Quantity |
| `product_max_qty` | numeric | no |  | Max Quantity (computed, stored) |
| `route_id` | int | yes | `stock_route.id` | Route |
| `trigger` | varchar | no |  | Trigger (auto \| manual) |

### stock_route_product

Many2many table of `stock.route.product_ids` (Products). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `route_id` | int | no | `stock_route.id` | stock.route id |
| `product_id` | int | no | `product_template.id` | product.template id |

¹ The referenced table is not drawn in this diagram.
