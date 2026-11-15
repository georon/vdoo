# Odoo Module Spec Template (Odoo 17)

Copy this folder to start a new module spec:

```bash
cp -r ~/projects/odoo_custom_arch/specs/_template ~/projects/odoo_custom_arch/specs/eb_<module>
```

Then replace placeholders throughout:

| Placeholder | Meaning | Example |
|---|---|---|
| `eb_<module>` | Technical module name (folder in `odoo/myaddons/`) | `eb_goal` |
| `eb_<module>.<entity>` | Model `_name` | `eb_goal.goal_set` |
| `<Entity>` | Human-readable model label | `Goal Set` |

## Files and how they map to code

| Spec file | Generates / drives | Required? |
|---|---|---|
| `00_overview.md` | `__manifest__.py` | ✔ |
| `01_requirements.md` | Acceptance criteria → tests | ✔ |
| `02_data_model.md` | `models/*.py` | ✔ |
| `03_erd.mmd` | Documentation | ✔ |
| `04_ddl_reference.sql` | Reference only (Odoo ORM creates tables) | optional |
| `05_business_logic.md` | Methods, constraints, computes, wizards | ✔ |
| `06_views.md` | `views/*_views.xml` | ✔ |
| `07_menus_actions.md` | `views/menus.xml`, actions | ✔ |
| `08_security.md` | `security/*.xml`, `ir.model.access.csv` | ✔ |
| `09_integrations.md` | `controllers/`, everbuddy_api XML-RPC calls | if applicable |
| `10_reports.md` | `report/`, `data/mail_template.xml` | if applicable |
| `11_automation.md` | `data/ir_cron.xml`, chatter tracking | if applicable |
| `12_data_seed.md` | `data/*.xml`, `demo/*.xml` | if applicable |
| `13_migration.md` | Import scripts, `migrations/` | if applicable |
| `14_test_plan.md` | `tests/` | ✔ |
| `mockups/` | Wireframes / screenshots | recommended |

## Conventions (from existing eb_* addons)

- Module names: `eb_<module>`; model names: `eb_<module>.<entity>` (underscored entity)
- Members are `res.users` (`member_id`, default `self.env.user`)
- ACL groups: `base.group_user` (members/users), `base.group_system` (admins) — add custom groups when finer roles are needed
- Odoo 17: use `invisible=` / `readonly=` / `required=` Python expressions in views (`attrs` and `states` are removed)
- Use `_compute_display_name` (not `name_get`, deprecated in 17)

## Status checklist

- [ ] Overview approved
- [ ] Data model reviewed
- [ ] Security matrix reviewed
- [ ] Views / mockups reviewed
- [ ] Ready for implementation
