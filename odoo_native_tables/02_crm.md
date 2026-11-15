# CRM

Leads and opportunities in one table, `crm_lead`, moved through stages by sales teams. Marketing attribution
uses the UTM tables (campaign, medium, source) shared with Sales, Website and Email Marketing.

- **Diagram:** [02_crm.vdoo](02_crm.vdoo) (open it in vdoo)
- **Install:** `crm`
- **Source:** Odoo 19.0 Community, read from the model definitions with these modules and their dependencies installed
- **Size:** 9 tables, 2 many2many tables, 2 reference tables, 18 relationships

## How the data flows

1. A lead (`type = 'lead'`) is qualified into an opportunity (`type = 'opportunity'`); it is the same row.
2. Opportunities move through `crm_stage`; a stage can be limited to some teams (`crm_stage_crm_team_rel`, empty means all teams).
3. Won means reaching a stage with `is_won`; lost means archived (`active = false`) with a `lost_reason_id`. `won_status` stores the result.
4. Leads are assigned to teams and salespeople; `crm_team_member` holds each member's assignment capacity.

## Things to know

- Quotations made from an opportunity point back through `sale_order.opportunity_id` (module `sale_crm`, see 12_cross_app_links).
- Incoming emails create leads through the team's mail alias (`crm_team.alias_id` → `mail_alias`).

## Tables

| Table | Model | What it holds | Defined in |
|---|---|---|---|
| [`crm_lead`](#crm_lead) | `crm.lead` | Lead | `crm` |
| [`crm_stage`](#crm_stage) | `crm.stage` | CRM Stages | `crm` |
| [`crm_team`](#crm_team) | `crm.team` | Sales Team | `sales_team` |
| [`crm_team_member`](#crm_team_member) | `crm.team.member` | Sales Team Member | `sales_team` |
| [`crm_lost_reason`](#crm_lost_reason) | `crm.lost.reason` | Opp. Lost Reason | `crm` |
| [`crm_tag`](#crm_tag) | `crm.tag` | CRM Tag | `sales_team` |
| [`utm_campaign`](#utm_campaign) | `utm.campaign` | UTM Campaign | `utm` |
| [`utm_medium`](#utm_medium) | `utm.medium` | UTM Medium | `utm` |
| [`utm_source`](#utm_source) | `utm.source` | UTM Source | `utm` |
| [`crm_tag_rel`](#crm_tag_rel) | many2many | `crm.lead.tag_ids` ↔ `crm.tag` | `crm` |
| [`crm_stage_crm_team_rel`](#crm_stage_crm_team_rel) | many2many | `crm.stage.team_ids` ↔ `crm.team` | `crm` |

Reference tables (only the columns this app uses; see their own diagrams): `res_partner`, `res_users`.

### crm_lead

`crm.lead` — Lead.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Opportunity (computed, stored) |
| `type` | varchar | no |  | Type (lead \| opportunity) |
| `partner_id` | int | yes | `res_partner.id` | Contact |
| `contact_name` | varchar | yes |  | Contact Name (computed, stored) |
| `partner_name` | varchar | yes |  | Company Name (computed, stored) |
| `email_from` | varchar | yes |  | Email (computed, stored) |
| `phone` | varchar | yes |  | Phone (computed, stored) |
| `user_id` | int | yes | `res_users.id` | Salesperson |
| `team_id` | int | yes | `crm_team.id` | Sales Team (computed, stored) |
| `stage_id` | int | yes | `crm_stage.id` | Stage (computed, stored) |
| `probability` | float8 | yes |  | Probability (computed, stored) |
| `expected_revenue` | numeric | yes |  | Expected Revenue |
| `priority` | varchar | yes |  | Priority |
| `date_deadline` | date | yes |  | Expected Closing |
| `date_closed` | timestamp | yes |  | Closed Date |
| `won_status` | varchar | yes |  | Won/Lost (won \| lost \| pending; computed, stored) |
| `lost_reason_id` | int | yes | `crm_lost_reason.id` | Lost Reason |
| `campaign_id` | int | yes | `utm_campaign.id` | Campaign |
| `medium_id` | int | yes | `utm_medium.id` | Medium |
| `source_id` | int | yes | `utm_source.id` | Source |
| `company_id` | int | yes | `res_company.id` ¹ | Company (computed, stored) |
| `active` | boolean | yes |  | Active |

### crm_stage

`crm.stage` — CRM Stages.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Stage Name (translated: one value per language) |
| `sequence` | int | yes |  | Sequence |
| `is_won` | boolean | yes |  | Is Won Stage? |
| `fold` | boolean | yes |  | Folded in Pipeline |
| `rotting_threshold_days` | int | yes |  | Days to rot |

### crm_team

`crm.team` — Sales Team.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Sales Team (translated: one value per language) |
| `user_id` | int | yes | `res_users.id` | Team Leader |
| `use_leads` | boolean | yes |  | Leads |
| `use_opportunities` | boolean | yes |  | Pipeline |
| `alias_id` | int | no | `mail_alias.id` ¹ | Alias |
| `company_id` | int | yes | `res_company.id` ¹ | Company |
| `active` | boolean | yes |  | Active |

### crm_team_member

`crm.team.member` — Sales Team Member.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `crm_team_id` | int | no | `crm_team.id` | Sales Team |
| `user_id` | int | no | `res_users.id` | Salesperson |
| `assignment_max` | int | yes |  | Average Leads Capacity (on 30 days) |
| `active` | boolean | yes |  | Active |

### crm_lost_reason

`crm.lost.reason` — Opp. Lost Reason.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Description (translated: one value per language) |
| `active` | boolean | yes |  | Active |

### crm_tag

`crm.tag` — CRM Tag.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | jsonb | no |  | Tag Name (translated: one value per language) |
| `color` | int | yes |  | Color |

### utm_campaign

`utm.campaign` — UTM Campaign.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Campaign Identifier (computed, stored) |
| `title` | jsonb | no |  | Campaign Name (translated: one value per language) |
| `user_id` | int | no | `res_users.id` | Responsible |
| `stage_id` | int | no | `utm_stage.id` ¹ | Stage |
| `active` | boolean | yes |  | Active |

### utm_medium

`utm.medium` — UTM Medium.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Medium Name |
| `active` | boolean | yes |  | Active |

### utm_source

`utm.source` — UTM Source.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `id` | serial | no |  | Record id |
| `name` | varchar | no |  | Source Name |

### crm_tag_rel

Many2many table of `crm.lead.tag_ids` (Tags). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `lead_id` | int | no | `crm_lead.id` | crm.lead id |
| `tag_id` | int | no | `crm_tag.id` | crm.tag id |

### crm_stage_crm_team_rel

Many2many table of `crm.stage.team_ids` (Sales Teams). Both columns form the primary key.

| Column | Type | Null | References | Meaning |
|---|---|---|---|---|
| `crm_stage_id` | int | no | `crm_stage.id` | crm.stage id |
| `crm_team_id` | int | no | `crm_team.id` | crm.team id |

¹ The referenced table is not drawn in this diagram.
