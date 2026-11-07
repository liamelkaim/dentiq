# Incident response and register (DRAFT)

No incidents have occurred: the app has not been deployed and has no real users.

## Steps
1. **Detect and contain**: note the time. Stop the cause (take the site down, revoke the key, disable the feature). Dentiq has a feature flag for the tutor and recordings, and sessions can be ended by a password reset.
2. **Assess**: what data, whose, how many people, how sensitive, was it read or only exposed, is it stopped. Patient information in an upload counts as an incident: hide the item (moderation), note who saw it.
3. **Decide whether there is a risk of serious injury** to the people. If yes: notify the Commission d'accès à l'information and the people concerned promptly. **OWNER TO CONFIRM** the exact legal test and wording with a lawyer; this file does not state the law.
4. **Fix and learn**: fix the cause, add a test, update `launch-gates.md`.
5. **Record** it below, even when no notice is required.

## Contacts (OWNER TO CONFIRM)
Person in charge: ______ · Backup person: ______ · Hosting support: ______ · Lawyer: ______

## Register
| # | Date found | Date it happened | What happened | Data and people affected | Risk assessment | Notices sent (who, when) | Fix | Closed |
|---|---|---|---|---|---|---|---|---|
| (none) | | | | | | | | |

Keep this register outside the app (it must survive the app being down) and keep it for the period the lawyer confirms.
