# eb_<module> — Security

## 1. Groups (`security/security.xml`)
_Skip this section if `base.group_user` / `base.group_system` are sufficient (as in eb_goal)._

| XML ID | Name | Category | Implied groups | Description |
|---|---|---|---|---|
| `group_eb_<module>_user` | User | `module_category_eb_<module>` | `base.group_user` | |
| `group_eb_<module>_manager` | Manager | `module_category_eb_<module>` | `group_eb_<module>_user` | |

## 2. Access rights (`security/ir.model.access.csv`)
Every model (including TransientModels) needs at least one line, or nobody can access it.

| Model | Group | R | W | C | D |
|---|---|---|---|---|---|
| `eb_<module>.<entity>` | `base.group_user` | 1 | 1 | 1 | 0 |
| `eb_<module>.<entity>` | `base.group_system` | 1 | 1 | 1 | 1 |
| `eb_<module>.<wizard>` | `base.group_user` | 1 | 1 | 1 | 1 |

CSV form:
```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_eb_<module>_<entity>_user,eb_<module>.<entity> user,model_eb_<module>_<entity>,base.group_user,1,1,1,0
access_eb_<module>_<entity>_admin,eb_<module>.<entity> admin,model_eb_<module>_<entity>,base.group_system,1,1,1,1
```

## 3. Record rules (`ir.rule`)
| XML ID | Model | Groups | Domain | R | W | C | D |
|---|---|---|---|---|---|---|---|
| `rule_<entity>_own` | `eb_<module>.<entity>` | `base.group_user` | `[('member_id', '=', user.id)]` | ✔ | ✔ | ✔ | ✔ |
| `rule_<entity>_all` | `eb_<module>.<entity>` | `base.group_system` | `[(1, '=', 1)]` | ✔ | ✔ | ✔ | ✔ |
| `rule_<entity>_company` | `eb_<module>.<entity>` | _global (no group)_ | `[('company_id', 'in', company_ids)]` | ✔ | ✔ | ✔ | ✔ |

> Rules with groups are OR-ed together; global rules (no group) are AND-ed.

## 4. Field-level security
| Model.field | `groups=` | Reason |
|---|---|---|
| | `base.group_system` | |

## 5. External / API access
| Accessor | Odoo user used | Groups | Notes |
|---|---|---|---|
| everbuddy_api XML-RPC | _service user, e.g. `api@everbuddy`_ | | credentials in `application-dev.yml`, never committed |
| Public HTTP controller | `auth='public'` | | sudo() usage must be justified |

## 6. Security test cases
- [ ] Member A cannot read Member B's records
- [ ] Non-admin cannot delete
- [ ] Admin sees all records
