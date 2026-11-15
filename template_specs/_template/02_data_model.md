# eb_<module> — Data Model

> This is the **authoritative schema spec**. Odoo's ORM generates the PostgreSQL tables;
> `04_ddl_reference.sql` is derived from this document, not the other way round.

## Model index
| Model `_name` | Label | Kind | Inherits / mixins | Python file |
|---|---|---|---|---|
| `eb_<module>.<entity>` | <Entity> | Model | — | `models/<entity>.py` |
| `res.partner` | Contact | Extension (`_inherit`) | — | `models/res_partner.py` |
| `eb_<module>.<wizard>` | <Wizard> | TransientModel | — | `wizard/<wizard>.py` |

---

## Model: `eb_<module>.<entity>`

| Attribute | Value |
|---|---|
| `_description` | <Entity> |
| `_inherit` | _e.g. `['mail.thread', 'mail.activity.mixin']` or none_ |
| `_order` | `name` |
| `_rec_name` | `name` (default) |
| `display_name` | _custom compute? e.g. "member – goal"_ |
| Archivable (`active` field) | Yes / No |
| Multi-company (`company_id`) | Yes / No |

### Fields

| Field | Type | Label | Req | Default | Relation / Selection / Size | Compute (store?) | Index | Track | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `name` | Char | Name | ✔ | | size=100 | | ✔ | | |
| `description` | Text | Description | | | | | | | |
| `member_id` | Many2one | Member | ✔ | `self.env.user` | `res.users`, ondelete=`restrict` | | ✔ | | |
| `state` | Selection | Status | ✔ | `draft` | draft / active / done / cancelled | | ✔ | ✔ | see state machine |
| `line_ids` | One2many | Lines | | | `eb_<module>.<entity>_line`, inverse `<entity>_id` | | | | |
| `tag_ids` | Many2many | Tags | | | `eb_<module>.tag`, rel `eb_<module>_<entity>_tag_rel` | | | | |
| `total` | Float | Total | | | digits=(16,2) | `_compute_total` (store) | | | depends `line_ids.amount` |
| `<x>_type` | Selection | Type | | | related=`<m2o>.<x>_type` | related (store) | | | denormalised for grouping |

**Field type quick reference:** Char, Text, Html, Integer, Float, Monetary (needs `currency_id`), Boolean, Date, Datetime, Selection, Binary, Image, Many2one, One2many, Many2many, Reference, Json.

**ondelete options (Many2one):** `set null` (default), `restrict`, `cascade`.

### SQL constraints
| Name | Definition | Message |
|---|---|---|
| `name_uniq` | `UNIQUE(name, member_id)` | "Name must be unique per member." |
| `positive_qty` | `CHECK(qty >= 0)` | "Quantity cannot be negative." |

### Python constraints (`@api.constrains`)
See `05_business_logic.md` §3.

---

## Model extension: `res.partner` (`_inherit`)

| Field | Type | Label | Notes |
|---|---|---|---|
| `x_<field>` → `eb_<field>` | | | _prefix custom fields to avoid collisions_ |

Views to extend: see `06_views.md` §Inherited views.

---

## Legacy mapping (MySQL `hirehelp` → Odoo)
_Fill in if this module mirrors / replaces tables in the Everbuddy MySQL schema._

| MySQL table.column | Type | → Odoo model.field | Transform |
|---|---|---|---|
| `goal.goal_type` | ENUM | `eb_<module>.<entity>.goal_type` | lowercase |
