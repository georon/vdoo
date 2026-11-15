# eb_<module> — Automation

## 1. Scheduled actions (`data/ir_cron.xml`)
| XML ID | Model | Method | Interval | Active | Idempotent? | Description |
|---|---|---|---|---|---|---|
| `ir_cron_<entity>_reminders` | `eb_<module>.<entity>` | `_cron_send_reminders` | 1 day | ✔ | ✔ | |

## 2. Automated actions (`base.automation`) — needs `base_automation`
| Trigger | Model | Condition | Action |
|---|---|---|---|

## 3. Chatter / tracking — needs `mail`
| Model | Mixins | Tracked fields |
|---|---|---|
| `eb_<module>.<entity>` | `mail.thread`, `mail.activity.mixin` | `state`, `member_id` |

## 4. Activity types
| XML ID | Name | Default delay | Model |
|---|---|---|---|
