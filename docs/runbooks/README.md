# Runbooks

One page per thing that can go wrong, written before it does. Each one assumes
you are tired and it is 6am. They are deliberately short: a runbook nobody
finishes reading is a runbook nobody follows.

| Runbook | For |
|---|---|
| [database-restore.md](database-restore.md) | Data loss, a bad migration, or a corrupted table |
| [webhook-outage.md](webhook-outage.md) | Stripe events stopped arriving or stopped processing |
| [push-provider-down.md](push-provider-down.md) | Reminders and notifications aren't reaching clients |
| [ai-provider-down.md](ai-provider-down.md) | Claude is erroring, rate-limiting, or out of credit |

**Each of these must be REHEARSED once against staging before launch**, and the
rehearsal date recorded at the bottom of the file. An untested runbook is a
guess with formatting.
