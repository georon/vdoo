# Project

Projects and tasks: stages, assignees, tags, milestones, dependencies and status updates. Tasks move through
stages shared between projects, and each assignee can also sort tasks in personal stages.

- **Diagram:** [07_project.vdoo](07_project.vdoo) (open it in vdoo)
- **Install:** `project`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 9 tables, 4 many2many tables, 3 reference tables, 28 relationships

## How the data flows

1. A project lists the task stages it uses in `project_task_type_rel`; tasks sit in one of them (`stage_id`).
2. Assignees are users: each assignment is a row of `project_task_user_rel`, which also stores that user's personal stage for the task (`stage_id`).
3. Sub-tasks are tasks with a `parent_id`; blocking tasks are in `task_dependencies_rel`.
4. `state` is the task's own status, independent of the stage: `01_in_progress`, `02_changes_requested`, `03_approved`, `04_waiting_normal` (blocked by another task), and the closed states `1_done`, `1_canceled`.
5. Project updates (`project_update`) record a status and progress over time; the latest is shown on the project.

## Things to know

- `project_task_user_rel` is not a plain many2many table: it is the table of `project.task.stage.personal` (`_table = 'project_task_user_rel'`), and both `project_task.user_ids` and `personal_stage_type_ids` use it.
- A project's analytic account (`account_id`) is where timesheets and costs are booked when Accounting/Timesheets are installed.
- Selling services that create tasks links `project_task.sale_line_id` to `sale_order_line` (module `sale_project`, see 12_cross_app_links).

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`project_project`](#project_project) | `project.project` | Project | `project` |
| [`project_task`](#project_task) | `project.task` | Task | `project` |
| [`project_task_type`](#project_task_type) | `project.task.type` | Task Stage | `project` |
| [`project_project_stage`](#project_project_stage) | `project.project.stage` | Project Stage | `project` |
| [`project_task_user_rel`](#project_task_user_rel) | `project.task.stage.personal` | Personal Task Stage | `project` |
| [`project_milestone`](#project_milestone) | `project.milestone` | Project Milestone | `project` |
| [`project_tags`](#project_tags) | `project.tags` | Project Tags | `project` |
| [`project_update`](#project_update) | `project.update` | Project Update | `project` |
| [`project_collaborator`](#project_collaborator) | `project.collaborator` | Collaborators in project shared | `project` |
| [`project_tags_project_task_rel`](#project_tags_project_task_rel) | many2many | `project.task.tag_ids` ↔ `project.tags` | `project` |
| [`task_dependencies_rel`](#task_dependencies_rel) | many2many | `project.task.depend_on_ids` ↔ `project.task` | `project` |
| [`project_task_type_rel`](#project_task_type_rel) | many2many | `project.project.type_ids` ↔ `project.task.type` | `project` |
| [`project_project_project_tags_rel`](#project_project_project_tags_rel) | many2many | `project.project.tag_ids` ↔ `project.tags` | `project` |

Reference tables (only the columns this app uses; see their own diagrams): `res_partner`, `res_users`, `account_analytic_account`.

### project_project

`project.project` — Project.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `partner_id` | int | yes | `res_partner.id` | Customer |
| `user_id` | int | yes | `res_users.id` | Project Manager |
| `account_id` | int | yes | `account_analytic_account.id` | Project Account |
| `stage_id` | int | yes | `project_project_stage.id` | Stage |
| `privacy_visibility` | varchar | no |  | Visibility (followers \| invited_users \| employees \| portal) |
| `date_start` | date | yes |  | Start Date |
| `date` | date | yes |  | Expiration Date |
| `allow_milestones` | boolean | yes |  | Milestones |
| `allow_task_dependencies` | boolean | yes |  | Task Dependencies |
| `is_template` | boolean | yes |  | Is template |
| `sequence` | int | yes |  | Sequence |
| `company_id` | int | yes | `res_company.id` ¹ | Company (computed, stored) |
| `active` | boolean | yes |  | Active |

### project_task

`project.task` — Task.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Title |
| `project_id` | int | yes | `project_project.id` | Project (computed, stored) |
| `parent_id` | int | yes | `project_task.id` | Parent Task |
| `stage_id` | int | yes | `project_task_type.id` | Stage (computed, stored) |
| `state` | varchar | no |  | State (computed, stored) |
| `priority` | varchar | yes |  | Priority (0 \| 1 \| 2 \| 3) |
| `partner_id` | int | yes | `res_partner.id` | Customer (computed, stored) |
| `milestone_id` | int | yes | `project_milestone.id` | Milestone (computed, stored) |
| `date_deadline` | timestamp | yes |  | Deadline |
| `date_assign` | timestamp | yes |  | Assigning Date |
| `date_end` | timestamp | yes |  | Ending Date |
| `allocated_hours` | float8 | yes |  | Allocated Time |
| `display_in_project` | boolean | yes |  | Display in project (computed, stored) |
| `recurrence_id` | int | yes | `project_task_recurrence.id` ¹ | Recurrence |
| `sequence` | int | yes |  | Sequence |
| `company_id` | int | yes | `res_company.id` ¹ | Company (computed, stored) |
| `active` | boolean | yes |  | Active |

### project_task_type

`project.task.type` — Task Stage.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `sequence` | int | yes |  | Sequence |
| `fold` | boolean | yes |  | Folded |
| `user_id` | int | yes | `res_users.id` | Stage Owner (computed, stored) |

### project_project_stage

`project.project.stage` — Project Stage.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `sequence` | int | yes |  | Sequence |
| `fold` | boolean | yes |  | Folded |

### project_task_user_rel

`project.task.stage.personal` — Personal Task Stage.

Table of `project.task.stage.personal`. Each row is one assignee of a task (`task_id`, `user_id`) and that user's personal stage for it (`stage_id`).

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `task_id` | int | no | `project_task.id` | Task |
| `user_id` | int | no | `res_users.id` | User |
| `stage_id` | int | yes | `project_task_type.id` | Stage |

### project_milestone

`project.milestone` — Project Milestone.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Name |
| `project_id` | int | no | `project_project.id` | Project |
| `deadline` | date | yes |  | Deadline |
| `is_reached` | boolean | yes |  | Reached |
| `reached_date` | date | yes |  | Reached date (computed, stored) |

### project_tags

`project.tags` — Project Tags.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `color` | int | yes |  | Color |

### project_update

`project.update` — Project Update.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Title |
| `project_id` | int | no | `project_project.id` | Project |
| `status` | varchar | no |  | Status (on_track \| at_risk \| off_track \| on_hold \| done) |
| `progress` | int | yes |  | Progress |
| `date` | date | yes |  | Date |
| `user_id` | int | no | `res_users.id` | Author |

### project_collaborator

`project.collaborator` — Collaborators in project shared.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `project_id` | int | no | `project_project.id` | Project Shared |
| `partner_id` | int | no | `res_partner.id` | Collaborator |
| `limited_access` | boolean | yes |  | Limited Access |

### project_tags_project_task_rel

Many2many table of `project.task.tag_ids` (Tags). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `project_task_id` | int | no | `project_task.id` | project.task id |
| `project_tags_id` | int | no | `project_tags.id` | project.tags id |

### task_dependencies_rel

Many2many table of `project.task.depend_on_ids` (Blocked By). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `task_id` | int | no | `project_task.id` | project.task id |
| `depends_on_id` | int | no | `project_task.id` | project.task id |

### project_task_type_rel

Many2many table of `project.project.type_ids` (Tasks Stages). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `project_id` | int | no | `project_project.id` | project.project id |
| `type_id` | int | no | `project_task_type.id` | project.task.type id |

### project_project_project_tags_rel

Many2many table of `project.project.tag_ids` (Tags). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `project_project_id` | int | no | `project_project.id` | project.project id |
| `project_tags_id` | int | no | `project_tags.id` | project.tags id |

¹ The referenced table is not drawn in this diagram.
