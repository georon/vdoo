# eb_<module> — Reports & Templates

## 1. QWeb reports (`report/`)
| XML ID | Model | Name | Type | Print from | Paper format | File name |
|---|---|---|---|---|---|---|
| `action_report_<entity>` | `eb_<module>.<entity>` | <Entity> Summary | qweb-pdf | Print menu | A4 | `'<Entity> - %s' % object.name` |

**Layout / content:** _header, fields shown, table of lines, totals, footer._

## 2. Email templates (`data/mail_template.xml`)
| XML ID | Model | Trigger | To | Subject | Body summary |
|---|---|---|---|---|---|
| `mail_template_<entity>_done` | `eb_<module>.<entity>` | `action_done` | `{{ object.member_id.email }}` | | |
