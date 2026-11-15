# eb_<module> — Data Migration

## 1. Initial load from legacy (MySQL `hirehelp`)
| Order | Source | Target model | Method | XML ID pattern | Notes |
|---|---|---|---|---|---|
| 1 | `goal` | `eb_<module>.<entity>` | CSV import / script via XML-RPC | `__import__.<entity>_<legacy_id>` | dependencies first |
| 2 | | | | | |

- **Volumes:** 
- **Validation:** row counts, checksum of key fields
- **Rollback:** 

## 2. Version upgrades (`migrations/<version>/`)
| Version | Script | Purpose |
|---|---|---|
| 17.0.1.1.0 | `pre-migrate.py` | _e.g. rename column before ORM update_ |
| 17.0.1.1.0 | `post-migrate.py` | _e.g. backfill new computed field_ |
