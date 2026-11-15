# Calendar

Meetings and their attendees, reminders, tags and recurrence rules. A meeting is a row of `calendar_event`; every
invited contact gets a `calendar_attendee` row holding their answer. The Calendar module also ties meetings to
activities (`mail_activity`), so a "Meeting" activity on any record and its calendar entry stay in step.

- **Diagram:** [13_calendar.vdoo](13_calendar.vdoo) (open it in vdoo)
- **Install:** `calendar`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 9 tables, 3 many2many tables, 3 reference tables, 23 relationships

## How the data flows

1. Creating a meeting writes one `calendar_event` row. Its attendees are contacts: `calendar_event_res_partner_rel` lists them, and Odoo keeps one `calendar_attendee` row per invited contact with their answer in `state` (`needsAction`, `tentative`, `declined`, `accepted`) and the token used by the links in the invitation email.
2. The organizer is a user (`calendar_event.user_id`); attendees are contacts, so people without a login can be invited.
3. A repeating meeting is one `calendar_recurrence` row (the rule, in `rrule` and its parts) plus one `calendar_event` row per occurrence, each pointing back through `recurrence_id`. `base_event_id` is the occurrence the others are copied from; an occurrence edited on its own has `follow_recurrence = false`.
4. Reminders are shared definitions (`calendar_alarm`: notification or email, how long before) attached to meetings through `calendar_alarm_calendar_event_rel`.
5. A meeting can belong to a record of any model: `res_model_id`/`res_model` name the model and `res_id` the row (an opportunity, a contact …). There is no database foreign key on `res_id`.
6. Scheduling an activity whose type has `category = 'meeting'` creates the meeting and stores it in `mail_activity.calendar_event_id`; moving the meeting updates the activity's `date_deadline`, and deleting the meeting deletes the activity.

## Things to know

- All-day meetings use `start_date`/`stop_date`; timed meetings use `start`/`stop`, stored in UTC.
- `calendar_filters` is each user's list of other people's calendars shown in the calendar side panel (`partner_checked` = currently ticked).
- `res_users_settings.calendar_default_privacy` is the privacy applied to a user's meetings that have no `privacy` of their own.
- `res_partner.calendar_last_notif_ack` is when the contact last dismissed calendar notifications; reminders before it are not shown again.
- `mail_activity` and `mail_activity_type` belong to the `mail` module and serve every app; Calendar adds `calendar_event_id` and the `meeting` category.
- Google and Outlook synchronisation (`google_calendar`, `microsoft_calendar`) add their own id columns to `calendar_event`, `calendar_recurrence` and `calendar_attendee`; they are not installed here.
- The Appointments app (online booking) builds on these tables but is Odoo Enterprise, so it is not in the Community source and has no diagram.

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`calendar_event`](#calendar_event) | `calendar.event` | Calendar Event | `calendar` |
| [`calendar_attendee`](#calendar_attendee) | `calendar.attendee` | Calendar Attendee Information | `calendar` |
| [`calendar_recurrence`](#calendar_recurrence) | `calendar.recurrence` | Event Recurrence Rule | `calendar` |
| [`calendar_alarm`](#calendar_alarm) | `calendar.alarm` | Event Alarm | `calendar` |
| [`calendar_event_type`](#calendar_event_type) | `calendar.event.type` | Event Meeting Type | `calendar` |
| [`calendar_filters`](#calendar_filters) | `calendar.filters` | Calendar Filters | `calendar` |
| [`mail_activity`](#mail_activity) | `mail.activity` | Activity | `mail` |
| [`mail_activity_type`](#mail_activity_type) | `mail.activity.type` | Activity Type | `mail` |
| [`res_users_settings`](#res_users_settings) | `res.users.settings` | User Settings | `base` |
| [`calendar_event_res_partner_rel`](#calendar_event_res_partner_rel) | many2many | `calendar.event.partner_ids` ↔ `res.partner` | `calendar` |
| [`meeting_category_rel`](#meeting_category_rel) | many2many | `calendar.event.categ_ids` ↔ `calendar.event.type` | `calendar` |
| [`calendar_alarm_calendar_event_rel`](#calendar_alarm_calendar_event_rel) | many2many | `calendar.event.alarm_ids` ↔ `calendar.alarm` | `calendar` |

Reference tables (only the columns this app uses; see their own diagrams): `res_partner`, `res_users`, `ir_model`.

### calendar_event

`calendar.event` — Calendar Event.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Meeting Subject |
| `user_id` | int | yes | `res_users.id` | Organizer |
| `start` | timestamp | no |  | Start |
| `stop` | timestamp | no |  | Stop (computed, stored) |
| `allday` | boolean | yes |  | All Day |
| `start_date` | date | yes |  | Start Date (computed, stored) |
| `stop_date` | date | yes |  | End Date (computed, stored) |
| `duration` | float8 | yes |  | Duration (computed, stored) |
| `location` | varchar | yes |  | Location |
| `videocall_location` | varchar | yes |  | Meeting URL (computed, stored) |
| `videocall_channel_id` | int | yes | `discuss_channel.id` ¹ | Discuss Channel |
| `privacy` | varchar | yes |  | Privacy (public \| private \| confidential) |
| `show_as` | varchar | no |  | Show as (free \| busy) |
| `res_model_id` | int | yes | `ir_model.id` | Document Model |
| `res_model` | varchar | yes |  | Document Model Name (computed, stored) |
| `res_id` | int | yes |  | Document ID |
| `recurrency` | boolean | yes |  | Recurrent |
| `recurrence_id` | int | yes | `calendar_recurrence.id` | Recurrence Rule |
| `follow_recurrence` | boolean | yes |  | Follow recurrence |
| `active` | boolean | yes |  | Active |

### calendar_attendee

`calendar.attendee` — Calendar Attendee Information.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `event_id` | int | no | `calendar_event.id` | Meeting linked |
| `partner_id` | int | no | `res_partner.id` | Attendee |
| `common_name` | varchar | yes |  | Common name (computed, stored) |
| `state` | varchar | yes |  | Status |
| `availability` | varchar | yes |  | Available/Busy (free \| busy) |
| `access_token` | varchar | yes |  | Invitation Token |

### calendar_recurrence

`calendar.recurrence` — Event Recurrence Rule.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Name (computed, stored) |
| `base_event_id` | int | yes | `calendar_event.id` | Base event |
| `event_tz` | varchar | yes |  | Timezone |
| `rrule` | varchar | yes |  | Rrule (computed, stored) |
| `rrule_type` | varchar | yes |  | Rrule type (daily \| weekly \| monthly \| yearly) |
| `interval` | int | yes |  | Interval |
| `end_type` | varchar | yes |  | End type (count \| end_date \| forever) |
| `count` | int | yes |  | Count |
| `until` | date | yes |  | Repeat Until |
| `month_by` | varchar | yes |  | Month by (date \| day) |
| `day` | int | yes |  | Day |
| `weekday` | varchar | yes |  | Weekday (MON \| TUE \| WED \| THU \| FRI \| SAT \| SUN) |
| `byday` | varchar | yes |  | By day (1 \| 2 \| 3 \| 4 \| -1) |

### calendar_alarm

`calendar.alarm` — Event Alarm.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `alarm_type` | varchar | no |  | Type (notification \| email) |
| `duration` | int | no |  | Remind Before |
| `interval` | varchar | no |  | Unit |
| `duration_minutes` | int | yes |  | Duration in minutes (computed, stored) |
| `mail_template_id` | int | yes | `mail_template.id` ¹ | Email Template (computed, stored) |
| `notify_responsible` | boolean | yes |  | Notify Responsible |

### calendar_event_type

`calendar.event.type` — Event Meeting Type.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Name |
| `color` | int | yes |  | Color |

### calendar_filters

`calendar.filters` — Calendar Filters.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `user_id` | int | no | `res_users.id` | Me |
| `partner_id` | int | no | `res_partner.id` | Employee |
| `partner_checked` | boolean | yes |  | Checked |
| `active` | boolean | yes |  | Active |

### mail_activity

`mail.activity` — Activity.

One row per scheduled activity on any record: (`res_model`, `res_id`) name the record, `user_id` is who must do it.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `res_model_id` | int | yes | `ir_model.id` | Document Model |
| `res_model` | varchar | yes |  | Related Document Model (computed, stored) |
| `res_id` | int | yes |  | Related Document ID |
| `activity_type_id` | int | yes | `mail_activity_type.id` | Activity Type |
| `summary` | varchar | yes |  | Summary |
| `date_deadline` | date | no |  | Due Date |
| `date_done` | date | yes |  | Done Date (computed, stored) |
| `user_id` | int | yes | `res_users.id` | Assigned to |
| `calendar_event_id` | int | yes | `calendar_event.id` | Calendar Meeting |
| `active` | boolean | yes |  | Active |

### mail_activity_type

`mail.activity.type` — Activity Type.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `category` | varchar | yes |  | Action (default \| upload_file \| phonecall \| meeting) |
| `res_model` | varchar | yes |  | Model |
| `delay_count` | int | yes |  | Schedule |
| `delay_unit` | varchar | no |  | Delay units (days \| weeks \| months) |
| `chaining_type` | varchar | no |  | Chaining Type (suggest \| trigger) |
| `triggered_next_type_id` | int | yes | `mail_activity_type.id` | Trigger (computed, stored) |
| `default_user_id` | int | yes | `res_users.id` | Default User |
| `sequence` | int | yes |  | Sequence |
| `active` | boolean | yes |  | Active |

### res_users_settings

`res.users.settings` — User Settings.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `user_id` | int | no | `res_users.id` | User |
| `calendar_default_privacy` | varchar | no |  | Calendar Default Privacy (public \| private \| confidential) |

### calendar_event_res_partner_rel

Many2many table of `calendar.event.partner_ids` (Attendees). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `calendar_event_id` | int | no | `calendar_event.id` | calendar.event id |
| `res_partner_id` | int | no | `res_partner.id` | res.partner id |

### meeting_category_rel

Many2many table of `calendar.event.categ_ids` (Tags). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `event_id` | int | no | `calendar_event.id` | calendar.event id |
| `type_id` | int | no | `calendar_event_type.id` | calendar.event.type id |

### calendar_alarm_calendar_event_rel

Many2many table of `calendar.event.alarm_ids` (Reminders). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `calendar_event_id` | int | no | `calendar_event.id` | calendar.event id |
| `calendar_alarm_id` | int | no | `calendar_alarm.id` | calendar.alarm id |

¹ The referenced table is not drawn in this diagram.
