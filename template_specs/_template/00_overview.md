# eb_<module> — Overview

| | |
|---|---|
| **Status** | Draft |
| **Author** | |
| **Last updated** | YYYY-MM-DD |
| **Odoo version** | 17.0 |

## 1. Purpose
_What business problem does this module solve? 2–4 sentences._

## 2. Scope
**In scope**
- 

**Out of scope**
- 

## 3. Manifest

```python
{
    'name': "<Human Name>",
    'summary': "<one line>",
    'author': "Everbuddy",
    'category': 'Uncategorized',
    'version': '17.0.1.0.0',
    'license': 'LGPL-3',
    'application': True,          # True = own app tile / root menu
    'depends': ['base'],          # e.g. 'mail', 'contacts', 'eb_goal'
    'data': [
        'security/security.xml',
        'security/ir.model.access.csv',
        'data/sequences.xml',
        'views/<entity>_views.xml',
        'views/menus.xml',
    ],
    'demo': [],
}
```

### Dependencies — why each is needed
| Module | Reason |
|---|---|
| `base` | core |

## 4. Roles / personas
| Role | Odoo group | Description |
|---|---|---|
| Member | `base.group_user` | |
| Administrator | `base.group_system` | |

## 5. Glossary
| Business term | Model / field | Definition |
|---|---|---|
| | `eb_<module>.<entity>` | |

## 6. Related systems
- **everbuddy_api** (Spring Boot): _does it read/write these models via XML-RPC? see 09_integrations.md_
- **everbuddy_vue**: _does the SPA surface any of this data?_

## 7. Open questions
- [ ] 
