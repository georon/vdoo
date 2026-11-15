# To-do

The To-do app has no tables of its own: a to-do is a private task, a row of `project_task` with no project and no
parent. It reuses the Project tables for assignees, personal stages and tags, and `mail_activity` for reminders.

- **Diagram:** [14_todo.vdoo](14_todo.vdoo) (open it in vdoo)
- **Install:** `project_todo`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 5 tables, 1 many2many tables, 4 reference tables, 11 relationships

## How the data flows

1. A to-do is a `project_task` row with `project_id` and `parent_id` empty. The To-do app lists the current user's rows of that kind: those with a `project_task_user_rel` row for the user.
2. `project_task_user_rel` holds one row per assignee of a to-do. Its `stage_id` is that person's own column for it, so two people sharing a to-do can each file it differently.
3. Personal stages are `project_task_type` rows with `user_id` set. Each user gets Inbox, Today, This Week, This Month, Later, Done and Cancelled the first time they need them.
4. Done and cancelled are `state` values (`1_done`, `1_canceled`), not stages; a to-do has no `stage_id` of its own.
5. A reminder is a `mail_activity` row with `res_model = 'project.task'` and `res_id` = the to-do. "Add a To-do" from the activity menu creates the to-do and its activity together.
6. "Convert to Task" sets `project_id` on the same row: it becomes a normal task and leaves the To-do app.

## Things to know

- `project_todo` installs itself with Project (`auto_install`), and gives every internal user a welcome to-do.
- `project_task_user_rel` is the table of `project.task.stage.personal`, not a plain many2many table; `project_task.user_ids` reads the same rows.
- `mail_activity.res_id` has no database foreign key: the pair (`res_model`, `res_id`) names the row.
- A to-do created without a title takes the first line of its `description` as `name`.
- The full task and stage columns are in 07_project; activities are detailed in 13_calendar.

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`project_task`](#project_task) | `project.task` | Task | `project` |
| [`project_task_user_rel`](#project_task_user_rel) | `project.task.stage.personal` | Personal Task Stage | `project` |
| [`project_task_type`](#project_task_type) | `project.task.type` | Task Stage | `project` |
| [`project_tags`](#project_tags) | `project.tags` | Project Tags | `project` |
| [`mail_activity`](#mail_activity) | `mail.activity` | Activity | `mail` |
| [`project_tags_project_task_rel`](#project_tags_project_task_rel) | many2many | `project.task.tag_ids` ↔ `project.tags` | `project` |

Reference tables (only the columns this app uses; see their own diagrams): `res_users`, `project_project`, `mail_activity_type`, `ir_model`.

### project_task

`project.task` — Task.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Title |
| `description` | text | yes |  | Description |
| `project_id` | int | yes | `project_project.id` | Project (computed, stored) |
| `parent_id` | int | yes | `project_task.id` | Parent Task |
| `state` | varchar | no |  | State (computed, stored) |
| `priority` | varchar | yes |  | Priority (0 \| 1 \| 2 \| 3) |
| `date_deadline` | timestamp | yes |  | Deadline |
| `color` | int | yes |  | Color Index |
| `sequence` | int | yes |  | Sequence |
| `company_id` | int | yes | `res_company.id` ¹ | Company (computed, stored) |
| `active` | boolean | yes |  | Active |

### project_task_user_rel

`project.task.stage.personal` — Personal Task Stage.

Table of `project.task.stage.personal`. Each row is one assignee of a task (`task_id`, `user_id`) and that user's personal stage for it (`stage_id`).

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `task_id` | int | no | `project_task.id` | Task |
| `user_id` | int | no | `res_users.id` | User |
| `stage_id` | int | yes | `project_task_type.id` | Stage |

### project_task_type

`project.task.type` — Task Stage.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `sequence` | int | yes |  | Sequence |
| `fold` | boolean | yes |  | Folded |
| `user_id` | int | yes | `res_users.id` | Stage Owner (computed, stored) |

### project_tags

`project.tags` — Project Tags.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `color` | int | yes |  | Color |

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
| `user_id` | int | yes | `res_users.id` | Assigned to |
| `active` | boolean | yes |  | Active |

### project_tags_project_task_rel

Many2many table of `project.task.tag_ids` (Tags). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `project_task_id` | int | no | `project_task.id` | project.task id |
| `project_tags_id` | int | no | `project_tags.id` | project.tags id |

¹ The referenced table is not drawn in this diagram.
