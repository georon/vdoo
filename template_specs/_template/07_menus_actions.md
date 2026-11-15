# eb_<module> — Menus & Actions

File: `views/menus.xml` (load **after** the view files that define the actions)

## 1. Menu tree
```
<App Name>                     menu_eb_<module>_root      (web_icon: eb_<module>,static/description/icon.png)
├── <Section>                  menu_eb_<module>_main
│   ├── <Entities>             menu_eb_<module>_<entity>  → action_eb_<module>_<entity>
│   └── <Other>                ...
└── Configuration              menu_eb_<module>_config    groups: base.group_system
    └── Tags                   menu_eb_<module>_tag       → action_eb_<module>_tag
```

| Menu XML ID | Parent | Sequence | Action | Groups |
|---|---|---|---|---|
| `menu_eb_<module>_root` | — | 10 | — | |
| `menu_eb_<module>_<entity>` | `menu_eb_<module>_main` | 10 | `action_eb_<module>_<entity>` | |
| `menu_eb_<module>_config` | root | 100 | — | `base.group_system` |

## 2. Window actions (`ir.actions.act_window`)
| XML ID | Model | view_mode | domain | context | Help (empty state) |
|---|---|---|---|---|---|
| `action_eb_<module>_<entity>` | `eb_<module>.<entity>` | `tree,form,kanban` | `[]` | `{'search_default_my': 1}` | "Create your first <entity>" |

## 3. Server actions (`ir.actions.server`)
| XML ID | Model | Binding (Action menu) | Code / method |
|---|---|---|---|
| | | | `records.action_xxx()` |

## 4. Other actions
- Report actions → see `10_reports.md`
- Wizard actions (`target: new`) → see `05_business_logic.md` §6
