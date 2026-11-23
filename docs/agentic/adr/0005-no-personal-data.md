# 0005. No personal data, fictional test data only

- Status: accepted

## Decision
Code, tests, fixtures, PR texts and agent prompts contain no real personal data. Test data is fictional or anonymised.

## Consequences
- Reviewers reject real personal data in any diff.
- Projects with stricter rules (GDPR scope, data classes) record them in their own `docs/adr/`.
