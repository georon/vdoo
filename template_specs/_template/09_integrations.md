# eb_<module> — Integrations

## 1. Source of truth
| Entity | Master system | Copy in | Sync direction | Trigger / frequency |
|---|---|---|---|---|
| Member | MySQL `hirehelp` (everbuddy_api) | Odoo `res.users` / `res.partner` | API → Odoo | on signup |
| <Entity> | Odoo | — | — | — |

## 2. Calls from everbuddy_api (XML-RPC via `ai.everbuddy.api.odoo.OdooConnection`)
| Use case | Model | Method | Args / domain | Fields returned | Java class |
|---|---|---|---|---|---|
| List member's goals | `eb_<module>.<entity>` | `search_read` | `[['member_id','=',uid]]` | `id,name,state` | |
| Create | `eb_<module>.<entity>` | `create` | `{name, member_id}` | id | |

- **ID mapping:** _how Everbuddy member_id ↔ Odoo res.users.id is stored (e.g. `eb_member_id` field on res.users, indexed, unique)_
- **Error handling:** _retry? log? what if Odoo is down?_

## 3. HTTP controllers (`controllers/`)
| Route | Methods | `auth` | `type` | csrf | Request | Response |
|---|---|---|---|---|---|---|
| `/eb_<module>/api/<entity>` | GET | `user` | `json` / `http` | False | | |

## 4. Outbound integrations
| Service | Purpose | Called from | Credentials stored in |
|---|---|---|---|
| | | | `ir.config_parameter` key `eb_<module>.<key>` |
