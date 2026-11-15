# Manufacturing

Bills of materials, work centers and manufacturing orders. A manufacturing order consumes components and
produces finished goods through ordinary stock moves, so Inventory sees every quantity it uses or makes.

- **Diagram:** [09_manufacturing.vdoo](09_manufacturing.vdoo) (open it in vdoo)
- **Install:** `mrp`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 10 tables, 0 many2many tables, 4 reference tables, 36 relationships

## How the data flows

1. A bill of materials (`mrp_bom`) for a product template lists components (`mrp_bom_line`), by-products and operations (`mrp_routing_workcenter`, each done at a work center).
2. Confirming a manufacturing order creates one stock move per component (`raw_material_production_id` = the MO) and one per finished product or by-product (`production_id` = the MO).
3. Operations become work orders (`mrp_workorder`) that track time at the work center.
4. Component moves are consumed from `location_src_id`, finished moves go to `location_dest_id`; the virtual production location sits in between.
5. Unbuild orders reverse a production with moves of their own (`unbuild_id`).

## Things to know

- Odoo 19 groups an MO with its backorders and children in `mrp_production_group` (`production_group_id`), and ties MOs to their originating documents through `stock_reference` like other stock documents.
- `stock_move` appears here with only its manufacturing columns; the full table is in 05_inventory_operations.
- `mrp_bom.type` is `normal` (manufacture) or `phantom` (kit, exploded into its components on sales and transfers).

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`mrp_production`](#mrp_production) | `mrp.production` | Manufacturing Order | `mrp` |
| [`mrp_production_group`](#mrp_production_group) | `mrp.production.group` | Production Group | `mrp` |
| [`mrp_bom`](#mrp_bom) | `mrp.bom` | Bill of Material | `mrp` |
| [`mrp_bom_line`](#mrp_bom_line) | `mrp.bom.line` | Bill of Material Line | `mrp` |
| [`mrp_bom_byproduct`](#mrp_bom_byproduct) | `mrp.bom.byproduct` | Byproduct | `mrp` |
| [`mrp_workcenter`](#mrp_workcenter) | `mrp.workcenter` | Work Center | `mrp` |
| [`mrp_routing_workcenter`](#mrp_routing_workcenter) | `mrp.routing.workcenter` | Work Center Usage | `mrp` |
| [`mrp_workorder`](#mrp_workorder) | `mrp.workorder` | Work Order | `mrp` |
| [`stock_move`](#stock_move) | `stock.move` | Stock Move | `stock` |
| [`mrp_unbuild`](#mrp_unbuild) | `mrp.unbuild` | Unbuild Order | `mrp` |

Reference tables (only the columns this app uses; see their own diagrams): `product_product`, `product_template`, `uom_uom`, `stock_picking_type`.

### mrp_production

`mrp.production` — Manufacturing Order.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Reference |
| `state` | varchar | yes |  | State (draft \| confirmed \| progress \| to_close \| done \| cancel; computed, stored) |
| `product_id` | int | no | `product_product.id` | Product (computed, stored) |
| `product_qty` | numeric | no |  | Quantity To Produce (computed, stored) |
| `product_uom_id` | int | no | `uom_uom.id` | Unit (computed, stored) |
| `qty_producing` | numeric | yes |  | Quantity Producing |
| `bom_id` | int | yes | `mrp_bom.id` | Bill of Material (computed, stored) |
| `picking_type_id` | int | no | `stock_picking_type.id` | Operation Type (computed, stored) |
| `location_src_id` | int | no | `stock_location.id` ¹ | Components Location (computed, stored) |
| `location_dest_id` | int | no | `stock_location.id` ¹ | Finished Products Location (computed, stored) |
| `production_group_id` | int | yes | `mrp_production_group.id` | Production Group |
| `date_start` | timestamp | no |  | Start |
| `date_finished` | timestamp | yes |  | End (computed, stored) |
| `date_deadline` | timestamp | yes |  | Deadline (computed, stored) |
| `user_id` | int | yes | `res_users.id` ¹ | Responsible |
| `origin` | varchar | yes |  | Source |
| `company_id` | int | no | `res_company.id` ¹ | Company |

### mrp_production_group

`mrp.production.group` — Production Group.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Name |

### mrp_bom

`mrp.bom` — Bill of Material.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `product_tmpl_id` | int | no | `product_template.id` | Product |
| `product_id` | int | yes | `product_product.id` | Product Variant |
| `product_qty` | numeric | no |  | Quantity |
| `product_uom_id` | int | no | `uom_uom.id` | Unit |
| `type` | varchar | no |  | BoM Type (normal \| phantom) |
| `code` | varchar | yes |  | Reference |
| `picking_type_id` | int | yes | `stock_picking_type.id` | Operation Type |
| `consumption` | varchar | no |  | Flexible Consumption (flexible \| warning \| strict) |
| `company_id` | int | yes | `res_company.id` ¹ | Company |
| `active` | boolean | yes |  | Active |

### mrp_bom_line

`mrp.bom.line` — Bill of Material Line.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `bom_id` | int | no | `mrp_bom.id` | Parent BoM |
| `product_id` | int | no | `product_product.id` | Component |
| `product_qty` | numeric | no |  | Quantity |
| `product_uom_id` | int | no | `uom_uom.id` | Unit |
| `operation_id` | int | yes | `mrp_routing_workcenter.id` | Consumed in Operation |
| `sequence` | int | yes |  | Sequence |

### mrp_bom_byproduct

`mrp.bom.byproduct` — Byproduct.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `bom_id` | int | yes | `mrp_bom.id` | BoM |
| `product_id` | int | no | `product_product.id` | By-product |
| `product_qty` | numeric | no |  | Quantity |
| `product_uom_id` | int | no | `uom_uom.id` | Unit (computed, stored) |
| `operation_id` | int | yes | `mrp_routing_workcenter.id` | Produced in Operation |
| `cost_share` | numeric | yes |  | Cost Share (%) |

### mrp_workcenter

`mrp.workcenter` — Work Center.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Work Center (computed, stored) |
| `code` | varchar | yes |  | Code |
| `resource_id` | int | no | `resource_resource.id` ¹ | Resource |
| `resource_calendar_id` | int | yes | `resource_calendar.id` ¹ | Working Hours (computed, stored) |
| `costs_hour` | float8 | yes |  | Cost per hour |
| `time_efficiency` | float8 | yes |  | Time Efficiency (computed, stored) |
| `oee_target` | float8 | yes |  | OEE Target |
| `company_id` | int | yes | `res_company.id` ¹ | Company (computed, stored) |
| `active` | boolean | yes |  | Active (computed, stored) |

### mrp_routing_workcenter

`mrp.routing.workcenter` — Work Center Usage.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Operation |
| `bom_id` | int | no | `mrp_bom.id` | Bill of Material |
| `workcenter_id` | int | no | `mrp_workcenter.id` | Work Center |
| `sequence` | int | yes |  | Sequence |
| `time_mode` | varchar | yes |  | Duration Computation (manual \| auto) |
| `time_cycle_manual` | float8 | yes |  | Manual Duration |

### mrp_workorder

`mrp.workorder` — Work Order.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Work Order |
| `production_id` | int | no | `mrp_production.id` | Manufacturing Order |
| `workcenter_id` | int | no | `mrp_workcenter.id` | Work Center |
| `operation_id` | int | yes | `mrp_routing_workcenter.id` | Operation |
| `state` | varchar | yes |  | Status (blocked \| ready \| progress \| done \| cancel; computed, stored) |
| `qty_produced` | numeric | yes |  | Quantity Done |
| `date_start` | timestamp | yes |  | Start (computed, stored) |
| `date_finished` | timestamp | yes |  | End (computed, stored) |
| `duration_expected` | numeric | yes |  | Expected Duration (computed, stored) |
| `duration` | float8 | yes |  | Real Duration (computed, stored) |

### stock_move

`stock.move` — Stock Move.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `product_id` | int | no | `product_product.id` | Product |
| `product_uom_qty` | numeric | no |  | Demand |
| `quantity` | numeric | yes |  | Quantity (computed, stored) |
| `state` | varchar | yes |  | Status (draft \| waiting \| confirmed \| partially_available \| assigned \| done \| cancel) |
| `raw_material_production_id` | int | yes | `mrp_production.id` | Production Order for components |
| `production_id` | int | yes | `mrp_production.id` | Production Order for finished products |
| `bom_line_id` | int | yes | `mrp_bom_line.id` | BoM Line |
| `byproduct_id` | int | yes | `mrp_bom_byproduct.id` | By-products |
| `operation_id` | int | yes | `mrp_routing_workcenter.id` | Operation To Consume |
| `workorder_id` | int | yes | `mrp_workorder.id` | Work Order To Consume |
| `unbuild_id` | int | yes | `mrp_unbuild.id` | Disassembly Order |
| `location_id` | int | no | `stock_location.id` ¹ | Source Location (computed, stored) |
| `location_dest_id` | int | no | `stock_location.id` ¹ | Intermediate Location (computed, stored) |

### mrp_unbuild

`mrp.unbuild` — Unbuild Order.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Reference |
| `product_id` | int | no | `product_product.id` | Product (computed, stored) |
| `bom_id` | int | yes | `mrp_bom.id` | Bill of Material (computed, stored) |
| `mo_id` | int | yes | `mrp_production.id` | Manufacturing Order |
| `product_qty` | numeric | no |  | Quantity (computed, stored) |
| `product_uom_id` | int | no | `uom_uom.id` | Unit (computed, stored) |
| `location_id` | int | no | `stock_location.id` ¹ | Source Location (computed, stored) |
| `location_dest_id` | int | no | `stock_location.id` ¹ | Destination Location (computed, stored) |
| `state` | varchar | yes |  | Status (draft \| done) |
| `company_id` | int | no | `res_company.id` ¹ | Company |

¹ The referenced table is not drawn in this diagram.
