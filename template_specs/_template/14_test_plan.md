# eb_<module> — Test Plan

Run:
```bash
cd ~/projects/odoo
python3 odoo-bin --addons-path=addons,myaddons -d odoo_test -i eb_<module> --test-enable --stop-after-init --log-level=test
# single tag:
python3 odoo-bin ... --test-tags /eb_<module>:TestEntity
```

## 1. Unit tests (`tests/test_<entity>.py`, `TransactionCase`)
| ID | Covers (story/AC) | Scenario | Expected |
|---|---|---|---|
| T-01 | AC-01.1 | create with defaults | state = draft, member = current user |
| T-02 | §3 constraints | end_date < start_date | `ValidationError` |
| T-03 | state machine | activate without lines | `UserError` |

## 2. Security tests
| ID | User / group | Action | Expected |
|---|---|---|---|
| S-01 | member A | read member B record | `AccessError` |
| S-02 | base.group_user | unlink | `AccessError` |

## 3. UI tours (`HttpCase` + `static/tests/tours/`)
| ID | Flow |
|---|---|
| UI-01 | open menu → create → activate → done |

## 4. Integration tests
| ID | Caller | Scenario |
|---|---|---|
| I-01 | everbuddy_api `*LiveTest` | search_read member goals via XML-RPC |

## 5. Test data / fixtures
_Describe `setUpClass` records: users per group, sample entities._
