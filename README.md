# Job Application Automation

An automation tool that takes a resume and a target job title, searches for
matching jobs, scores each against the resume, generates a tailored cover
letter for every match, and auto-applies where technically possible
(Greenhouse and Lever-hosted forms). Every matched job gets a ready cover
letter regardless of whether it can be auto-submitted — nothing is left as
just a bare link.

## Stack

- Django + Django REST Framework
- PostgreSQL
- Celery + Redis (async tasks, scheduled job search)
- Claude API (resume parsing, job matching, cover letter generation)
- Playwright (auto-apply on Greenhouse/Lever)
- React + Vite + Tailwind (frontend)

## Status

Early development. See `BUILD_LOG.md` for the step-by-step build history.

## Local setup

```bash
python3 -m virtualenv -p python3.12 venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
```

Requires a running PostgreSQL instance and Redis instance, plus a local
`.env` file (not tracked in this repo) defining: `SECRET_KEY`, `DEBUG`,
`ALLOWED_HOSTS`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`,
`CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`, `ANTHROPIC_API_KEY`.
