# eb_<module> — Seed & Demo Data

## 1. Master data loaded on install (`data/`)
| File | Records | `noupdate` | Notes |
|---|---|---|---|
| `data/sequences.xml` | `ir.sequence` code `eb_<module>.<entity>`, prefix `XX/%(year)s/`, padding 5 | 1 | |
| `data/<entity>_types.xml` | | 1 | user-editable after install |

## 2. Configuration parameters
| Key (`ir.config_parameter`) | Default | Settings screen field |
|---|---|---|
| `eb_<module>.<key>` | | `res.config.settings.<field>` |

## 3. Demo data (`demo/`)
| File | Records | Purpose |
|---|---|---|
| `demo/demo.xml` | 3 sample <entities> | UI demos, manual testing |
