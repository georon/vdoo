# eb_<module> — Views

File: `views/<entity>_views.xml`  
XML ID pattern: `eb_<module>.view_<entity>_<type>`  
Mockups: `mockups/<entity>_<type>.png`

> Odoo 17: use `invisible="state != 'draft'"`, `readonly="..."`, `required="..."` directly.
> `attrs` and `states` attributes are removed.

---

## Model: `eb_<module>.<entity>`

View types: **list, form, search** _(+ kanban / calendar / pivot / graph if needed)_

### List view — `view_<entity>_tree`
| Column | Widget | optional | Notes |
|---|---|---|---|
| `name` | | | |
| `member_id` | `many2one_avatar_user` | | |
| `state` | `badge` | | decoration-success="state=='done'" |
| `total` | | `show` | sum="Total" |

- Editable inline: No / `bottom` / `top`
- Row decorations: `decoration-muted="state=='cancelled'"`
- Default order: (from `_order`)

### Form view — `view_<entity>_form`
```
┌─ header ───────────────────────────────────────────────────┐
│ [Activate] [Done] [Cancel]          draft ▸ active ▸ done  │
├─ sheet ────────────────────────────────────────────────────┤
│  [smart buttons: Lines (n)]                                │
│  # Name                                                    │
│  ┌ group left ──────────┐  ┌ group right ─────────────┐    │
│  │ Member               │  │ Type                     │    │
│  │ Schedule             │  │ Total                    │    │
│  └──────────────────────┘  └──────────────────────────┘    │
│  ┌ notebook ─────────────────────────────────────────┐     │
│  │ [Lines] [Notes]                                   │     │
│  └───────────────────────────────────────────────────┘     │
├─ chatter (if mail.thread) ─────────────────────────────────┤
└────────────────────────────────────────────────────────────┘
```

**Header buttons**
| Button | Method / action | Type | Visible when | Groups | Class |
|---|---|---|---|---|---|
| Activate | `action_activate` | object | `state == 'draft'` | | `btn-primary` |
| Cancel | `action_cancel` | object | `state not in ('done','cancelled')` | manager | |

**Statusbar:** `state`, `statusbar_visible="draft,active,done"`

**Field rules**
| Field | readonly | invisible | required | Widget |
|---|---|---|---|---|
| `name` | `state != 'draft'` | | | |
| `day_of_month_1` | | `schedule_type != 'monthly'` | `schedule_type == 'monthly'` | |

### Search view — `view_<entity>_search`
| Kind | Name / field | Domain / context |
|---|---|---|
| field | `name` | |
| field | `member_id` | |
| filter | My records | `[('member_id', '=', uid)]` |
| filter | Active | `[('state', '=', 'active')]` |
| separator | | |
| filter | Archived | `[('active', '=', False)]` |
| group by | Status | `{'group_by': 'state'}` |
| group by | Type | `{'group_by': '<x>_type'}` |

Default filter(s): set via action context `search_default_<filter_name>`.

### Kanban view — `view_<entity>_kanban` _(optional)_
- `default_group_by`: `state`
- Card shows: name, member avatar, type badge, total
- Quick create: Yes / No
- Progress bar: field `state`, colours

### Calendar / Pivot / Graph _(optional)_
| Type | Config |
|---|---|
| calendar | `date_start="start_datetime"`, `color="member_id"` |
| pivot | rows: `member_id`, cols: `<x>_type`, measure: `total` |
| graph | type bar, x: `<x>_type`, y: count |

---

## Inherited views
| New XML ID | Inherits (`inherit_id`) | xpath | position | Change |
|---|---|---|---|---|
| `view_partner_form_inherit_eb_<module>` | `base.view_partner_form` | `//field[@name='vat']` | `after` | add `eb_<field>` |
