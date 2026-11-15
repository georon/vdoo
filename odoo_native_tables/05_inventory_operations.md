# Inventory: transfers, moves and stock

How goods move and where they are. Every movement of goods is a `stock_move` from one location to another,
grouped into transfers (`stock_picking`) and carried out by move lines (`stock_move_line`: the exact lot, package
and sub-locations). On-hand quantities are kept per location, lot and package in `stock_quant`. Warehouses,
locations, operation types and routes are in 05_inventory_setup.

- **Diagram:** [05_inventory_operations.vdoo](05_inventory_operations.vdoo) (open it in vdoo)
- **Install:** `stock`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 7 tables, 2 many2many tables, 4 reference tables, 34 relationships

## How the data flows

1. A transfer (`stock_picking`) groups the moves of one operation type (receipt, delivery, internal …); a move (`stock_move`) asks for a quantity of one product from a source to a destination location.
2. Reserving fills `stock_move_line` rows with the actual lot, package and sub-locations; validating marks them done and updates `stock_quant` (on hand per location, lot, package and owner).
3. Multi-step routes chain moves: `stock_move_move_rel` links each move to the moves it feeds (`move_orig_ids` / `move_dest_ids`), and `location_final_id` is where the chain should end.
4. Returns are new transfers whose moves point to the returned move (`origin_returned_move_id`); a partly done transfer leaves the rest in a backorder (`backorder_id`).

## Things to know

- Odoo 19 replaced procurement groups with `stock_reference`: moves are tied to their originating documents through `stock_reference_move_rel` (there is no `group_id` any more).
- Odoo 19 renamed packages to `stock.package` (table `stock_package`, it was `stock_quant_package`).
- `stock_move.product_uom` kept its name in Odoo 19; move lines use `product_uom_id`.
- Goods always move between locations, never appear or vanish: suppliers, customers, inventory adjustments and production are locations too (`stock_location.usage`).

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`stock_picking`](#stock_picking) | `stock.picking` | Transfer | `stock` |
| [`stock_move`](#stock_move) | `stock.move` | Stock Move | `stock` |
| [`stock_move_line`](#stock_move_line) | `stock.move.line` | Product Moves (Stock Move Line) | `stock` |
| [`stock_quant`](#stock_quant) | `stock.quant` | Quants | `stock` |
| [`stock_lot`](#stock_lot) | `stock.lot` | Lot/Serial | `stock` |
| [`stock_package`](#stock_package) | `stock.package` | Package | `stock` |
| [`stock_reference`](#stock_reference) | `stock.reference` | Reference between stock documents | `stock` |
| [`stock_move_move_rel`](#stock_move_move_rel) | many2many | `stock.move.move_orig_ids` ↔ `stock.move` | `stock` |
| [`stock_reference_move_rel`](#stock_reference_move_rel) | many2many | `stock.move.reference_ids` ↔ `stock.reference` | `stock` |

Reference tables (only the columns this app uses; see their own diagrams): `product_product`, `res_partner`, `stock_location`, `stock_picking_type`.

### stock_picking

`stock.picking` — Transfer.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Reference |
| `state` | varchar | yes |  | Status (draft \| waiting \| confirmed \| assigned \| done \| cancel; computed, stored) |
| `picking_type_id` | int | no | `stock_picking_type.id` | Operation Type |
| `partner_id` | int | yes | `res_partner.id` | Contact |
| `location_id` | int | no | `stock_location.id` | Source Location (computed, stored) |
| `location_dest_id` | int | no | `stock_location.id` | Destination Location (computed, stored) |
| `scheduled_date` | timestamp | yes |  | Scheduled Date (computed, stored) |
| `date_done` | timestamp | yes |  | Date of Transfer |
| `origin` | varchar | yes |  | Source Document |
| `backorder_id` | int | yes | `stock_picking.id` | Back Order of |
| `return_id` | int | yes | `stock_picking.id` | Return of |
| `move_type` | varchar | no |  | Shipping Policy (direct \| one; computed, stored) |
| `user_id` | int | yes | `res_users.id` ¹ | Responsible |
| `company_id` | int | yes | `res_company.id` ¹ | Company (computed, stored) |

### stock_move

`stock.move` — Stock Move.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `reference` | varchar | yes |  | Reference (computed, stored) |
| `product_id` | int | no | `product_product.id` | Product |
| `product_uom_qty` | numeric | no |  | Demand |
| `quantity` | numeric | yes |  | Quantity (computed, stored) |
| `product_uom` | int | no | `uom_uom.id` ¹ | Unit (computed, stored) |
| `state` | varchar | yes |  | Status (draft \| waiting \| confirmed \| partially_available \| assigned \| done \| cancel) |
| `picking_id` | int | yes | `stock_picking.id` | Transfer |
| `picking_type_id` | int | yes | `stock_picking_type.id` | Operation Type (computed, stored) |
| `location_id` | int | no | `stock_location.id` | Source Location (computed, stored) |
| `location_dest_id` | int | no | `stock_location.id` | Intermediate Location (computed, stored) |
| `location_final_id` | int | yes | `stock_location.id` | Final Location |
| `date` | timestamp | no |  | Date Scheduled |
| `procure_method` | varchar | no |  | Supply Method (make_to_stock \| make_to_order) |
| `rule_id` | int | yes | `stock_rule.id` ¹ | Stock Rule |
| `origin_returned_move_id` | int | yes | `stock_move.id` | Origin return move |
| `warehouse_id` | int | yes | `stock_warehouse.id` ¹ | Warehouse |
| `orderpoint_id` | int | yes | `stock_warehouse_orderpoint.id` ¹ | Original Reordering Rule |
| `company_id` | int | no | `res_company.id` ¹ | Company |

### stock_move_line

`stock.move.line` — Product Moves (Stock Move Line).

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `move_id` | int | yes | `stock_move.id` | Stock Operation |
| `picking_id` | int | yes | `stock_picking.id` | Transfer |
| `product_id` | int | yes | `product_product.id` | Product |
| `quantity` | numeric | yes |  | Quantity (computed, stored) |
| `product_uom_id` | int | no | `uom_uom.id` ¹ | Unit (computed, stored) |
| `lot_id` | int | yes | `stock_lot.id` | Lot/Serial Number |
| `package_id` | int | yes | `stock_package.id` | Source Package |
| `result_package_id` | int | yes | `stock_package.id` | Destination Package |
| `location_id` | int | no | `stock_location.id` | From (computed, stored) |
| `location_dest_id` | int | no | `stock_location.id` | To (computed, stored) |
| `state` | varchar | yes |  | State (computed, stored) |
| `date` | timestamp | no |  | Date |
| `company_id` | int | no | `res_company.id` ¹ | Company |

### stock_quant

`stock.quant` — Quants.

One row per product × location × lot × package × owner. Never edit `quantity` directly: inventory adjustments set `inventory_quantity` and apply it, which creates moves.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `product_id` | int | no | `product_product.id` | Product |
| `location_id` | int | no | `stock_location.id` | Location |
| `lot_id` | int | yes | `stock_lot.id` | Lot/Serial Number |
| `package_id` | int | yes | `stock_package.id` | Package |
| `owner_id` | int | yes | `res_partner.id` | Owner |
| `quantity` | numeric | yes |  | Quantity |
| `reserved_quantity` | numeric | no |  | Reserved Quantity |
| `inventory_quantity` | numeric | yes |  | Counted |
| `in_date` | timestamp | no |  | Incoming Date |

### stock_lot

`stock.lot` — Lot/Serial.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Lot/Serial Number (computed, stored) |
| `product_id` | int | no | `product_product.id` | Product |
| `ref` | varchar | yes |  | Internal Reference |
| `company_id` | int | yes | `res_company.id` ¹ | Company (computed, stored) |

### stock_package

`stock.package` — Package.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Package Reference |
| `location_id` | int | yes | `stock_location.id` | Location (computed, stored) |
| `parent_package_id` | int | yes | `stock_package.id` | Container |
| `company_id` | int | yes | `res_company.id` ¹ | Company (computed, stored) |

### stock_reference

`stock.reference` — Reference between stock documents.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Reference |

### stock_move_move_rel

Many2many table of `stock.move.move_orig_ids` (Original Move). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `move_dest_id` | int | no | `stock_move.id` | stock.move id |
| `move_orig_id` | int | no | `stock_move.id` | stock.move id |

### stock_reference_move_rel

Many2many table of `stock.move.reference_ids` (References). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `move_id` | int | no | `stock_move.id` | stock.move id |
| `reference_id` | int | no | `stock_reference.id` | stock.reference id |

¹ The referenced table is not drawn in this diagram.
