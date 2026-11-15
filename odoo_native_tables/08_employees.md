# Employees

Employees, departments, job positions and work locations. In Odoo 19 the contract-like and private details of an
employee are versioned in `hr_version`: each version is dated, and the employee points to the current one.

- **Diagram:** [08_employees.vdoo](08_employees.vdoo) (open it in vdoo)
- **Install:** `hr`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 10 tables, 1 many2many tables, 2 reference tables, 26 relationships

## How the data flows

1. Creating an employee creates a `resource_resource` (working time, timezone) and a first `hr_version`.
2. Department, job, work location, working schedule, contract dates and wage are on the version; a new version dated in the future records a change (promotion, new contract) without losing history.
3. `hr_employee.current_version_id` points to the version in effect today; `hr_version.employee_id` lists them all.
4. The manager hierarchy is `hr_employee.parent_id`; departments have their own `parent_id` tree and a manager.
5. An employee linked to a user (`user_id`) gets a work contact (`work_contact_id`) used for chatter and messaging.

## Things to know

- Odoo 19 replaced `hr.contract` with `hr.version`. `hr.employee` delegates to it with `_inherits = {'hr.version': 'version_id'}`, but `version_id` is computed (not a column): the stored link is `current_version_id`.
- Private details (address, identification, marital status) are on `hr_version` as well and are restricted to HR officers.
- Employee tags meet employees in `employee_category_rel`.

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`hr_employee`](#hr_employee) | `hr.employee` | Employee | `hr` |
| [`hr_version`](#hr_version) | `hr.version` | Version | `hr` |
| [`hr_department`](#hr_department) | `hr.department` | Department | `hr` |
| [`hr_job`](#hr_job) | `hr.job` | Job Position | `hr` |
| [`hr_employee_category`](#hr_employee_category) | `hr.employee.category` | Employee Category | `hr` |
| [`hr_work_location`](#hr_work_location) | `hr.work.location` | Work Location | `hr` |
| [`hr_contract_type`](#hr_contract_type) | `hr.contract.type` | Contract Type | `hr` |
| [`hr_departure_reason`](#hr_departure_reason) | `hr.departure.reason` | Departure Reason | `hr` |
| [`resource_resource`](#resource_resource) | `resource.resource` | Resources | `resource` |
| [`resource_calendar`](#resource_calendar) | `resource.calendar` | Resource Working Time | `resource` |
| [`employee_category_rel`](#employee_category_rel) | many2many | `hr.employee.category_ids` ↔ `hr.employee.category` | `hr` |

Reference tables (only the columns this app uses; see their own diagrams): `res_users`, `res_partner`.

### hr_employee

`hr.employee` — Employee. Delegation inheritance: every row has a `hr.version` row through `version_id`.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | yes |  | Employee Name (computed, stored) |
| `user_id` | int | yes | `res_users.id` | User (computed, stored) |
| `work_contact_id` | int | yes | `res_partner.id` | Work Contact |
| `resource_id` | int | no | `resource_resource.id` | Resource |
| `current_version_id` | int | yes | `hr_version.id` | Current version (computed, stored) |
| `parent_id` | int | yes | `hr_employee.id` | Manager |
| `coach_id` | int | yes | `hr_employee.id` | Coach (computed, stored) |
| `work_email` | varchar | yes |  | Work Email (computed, stored) |
| `work_phone` | varchar | yes |  | Work Phone (computed, stored) |
| `mobile_phone` | varchar | yes |  | Work Mobile |
| `birthday` | date | yes |  | Birthday |
| `company_id` | int | no | `res_company.id` ¹ | Company (computed, stored) |
| `active` | boolean | yes |  | Active (computed, stored) |

### hr_version

`hr.version` — Version.

One row per dated version of an employee's job, contract and private details.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `employee_id` | int | yes | `hr_employee.id` | Employee |
| `date_version` | date | no |  | Date version |
| `contract_date_start` | date | yes |  | Contract Start Date |
| `contract_date_end` | date | yes |  | Contract End Date |
| `department_id` | int | yes | `hr_department.id` | Department |
| `job_id` | int | yes | `hr_job.id` | Job |
| `job_title` | varchar | yes |  | Job Title (computed, stored) |
| `work_location_id` | int | yes | `hr_work_location.id` | Work Location |
| `address_id` | int | yes | `res_partner.id` | Work Address |
| `resource_calendar_id` | int | yes | `resource_calendar.id` | Working Hours |
| `employee_type` | varchar | no |  | Employee Type (employee \| worker \| student \| trainee \| contractor \| freelance) |
| `contract_type_id` | int | yes | `hr_contract_type.id` | Contract Type |
| `wage` | numeric | yes |  | Wage |
| `departure_reason_id` | int | yes | `hr_departure_reason.id` | Departure Reason |
| `departure_date` | date | yes |  | Departure Date |
| `company_id` | int | yes | `res_company.id` ¹ | Company (computed, stored) |
| `active` | boolean | yes |  | Active |

### hr_department

`hr.department` — Department.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Department Name (translated: one value per language) |
| `parent_id` | int | yes | `hr_department.id` | Parent Department |
| `manager_id` | int | yes | `hr_employee.id` | Manager |
| `master_department_id` | int | yes | `hr_department.id` | Master Department (computed, stored) |
| `company_id` | int | yes | `res_company.id` ¹ | Company |
| `active` | boolean | yes |  | Active |

### hr_job

`hr.job` — Job Position.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Job Position (translated: one value per language) |
| `department_id` | int | yes | `hr_department.id` | Department |
| `contract_type_id` | int | yes | `hr_contract_type.id` | Employment Type |
| `no_of_recruitment` | int | yes |  | Target |
| `company_id` | int | yes | `res_company.id` ¹ | Company |
| `active` | boolean | yes |  | Active |

### hr_employee_category

`hr.employee.category` — Employee Category.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Tag Name |
| `color` | int | yes |  | Color Index |

### hr_work_location

`hr.work.location` — Work Location.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Work Location |
| `location_type` | varchar | no |  | Location type (Odoo's label is "Cover Image") (home \| office \| other) |
| `address_id` | int | no | `res_partner.id` | Work Address |
| `company_id` | int | no | `res_company.id` ¹ | Company |
| `active` | boolean | yes |  | Active |

### hr_contract_type

`hr.contract.type` — Contract Type.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Name (translated: one value per language) |
| `code` | varchar | yes |  | Code (computed, stored) |
| `country_id` | int | yes | `res_country.id` ¹ | Country |

### hr_departure_reason

`hr.departure.reason` — Departure Reason.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Reason (translated: one value per language) |

### resource_resource

`resource.resource` — Resources.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Name |
| `user_id` | int | yes | `res_users.id` | User |
| `calendar_id` | int | yes | `resource_calendar.id` | Working Time |
| `resource_type` | varchar | no |  | Type (user \| material) |
| `time_efficiency` | float8 | no |  | Efficiency Factor |
| `tz` | varchar | no |  | Timezone |
| `company_id` | int | yes | `res_company.id` ¹ | Company |

### resource_calendar

`resource.calendar` — Resource Working Time.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Name |
| `hours_per_day` | numeric | yes |  | Average Hour per Day (computed, stored) |
| `flexible_hours` | boolean | yes |  | Flexible Hours (computed, stored) |
| `tz` | varchar | no |  | Timezone |
| `company_id` | int | yes | `res_company.id` ¹ | Company |

### employee_category_rel

Many2many table of `hr.employee.category_ids` (Tags). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `employee_id` | int | no | `hr_employee.id` | hr.employee id |
| `category_id` | int | no | `hr_employee_category.id` | hr.employee.category id |

¹ The referenced table is not drawn in this diagram.
