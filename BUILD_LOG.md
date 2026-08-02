# Build Log

Running documentation of the Job Application Automation build — what was
done, why, and what each piece of code does. Updated as we go, in build
order. See the original project notes for the full architecture/design doc.

---

## Phase 0 — Project setup

### Step 1: Project folder + virtual environment

```bash
mkdir job-apply-automation
cd job-apply-automation
python3 -m venv venv
source venv/bin/activate
```

Isolates this project's Python packages from the system so nothing conflicts.

- `python3 -m venv venv` — creates a self-contained Python environment in a
  `venv/` folder; every package installed later (Django, Celery, etc.) lives
  here, not system-wide.
- `source venv/bin/activate` — activates that environment for the current
  terminal session (shows `(venv)` in the prompt). Needs to be re-run every
  time a new terminal is opened for this project.

**Note:** the system's default Python was 3.14, which is too new for
reliable Django/Celery/Playwright compatibility, and its `python3.12`
install had no `ensurepip`/`venv` support (Ubuntu 26.04 ships 3.14 as
default and only keeps a minimal `python3.12` package around). Rebuilt the
venv using the system `python3-virtualenv` package instead of the stdlib
`venv` module, targeting `python3.12` specifically:

```bash
sudo apt install python3-virtualenv
python3 -m virtualenv -p python3.12 venv
```

### Step 2: Django + DRF

```bash
pip install django djangorestframework django-environ
django-admin startproject config .
```

- **Django** — the web framework: ORM, admin panel, URL routing,
  request/response handling.
- **Django REST Framework (DRF)** — adds tools for building JSON APIs
  (serializers, viewsets) on top of Django. This is what the React
  frontend will talk to.
- **django-environ** — lets Django read config (secret key, DB credentials,
  API keys) from a `.env` file instead of hardcoding them in `settings.py`.

`django-admin startproject config .` (the trailing `.` matters — it puts
`config/` and `manage.py` directly in the current folder instead of
nesting another folder) generated:

- `manage.py` — CLI entry point (`python manage.py <command>`)
- `config/settings.py` — all project config: installed apps, database,
  middleware, static files
- `config/urls.py` — root URL router; every app's URLs plug in here
- `config/asgi.py` / `config/wsgi.py` — entry points for async/sync
  servers, used when deploying

### Step 3: Environment variables wired into settings.py

```python
import environ

env = environ.Env(DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / '.env')

SECRET_KEY = env('SECRET_KEY')
DEBUG = env('DEBUG')
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=[])
```

`environ.Env.read_env()` loads key/value pairs from `.env` into environment
variables at startup. This is why it matters: `SECRET_KEY`, `DEBUG`, and
later the Claude/Adzuna API keys never get hardcoded into a file that lands
in git — they live in `.env` (git-ignored) locally, and in Railway's
environment variable settings in production.

Also added `'rest_framework'` to `INSTALLED_APPS` — without this, DRF's
serializers/viewsets/browsable API don't activate at all.

Created three new files:

- **`.env`** — real local values (generated secret key, `DEBUG=True`, DB
  credentials). Never committed.
- **`.env.example`** — placeholder template, safe to commit, so anyone
  cloning the repo knows what variables to set.
- **`.gitignore`** — excludes `venv/`, `.env`, `db.sqlite3`, caches, etc.

### Step 4: Postgres

Created the Postgres role and database (required `sudo -u postgres`, run
manually since it needs an interactive terminal):

```bash
sudo -u postgres psql -c "CREATE USER job_apply_user WITH PASSWORD 'devpassword' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE job_apply_automation OWNER job_apply_user;"
```

```bash
pip install psycopg2-binary
```

Switched `DATABASES` in `settings.py` from SQLite to Postgres, reading
`DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT` from `.env`.
Verified with `python manage.py migrate` — Django's built-in tables
(auth, sessions, admin, contenttypes) applied cleanly against Postgres.

### Step 5: Celery + Celery Beat (Redis-backed)

```bash
pip install celery redis
```

Two files make Celery share Django's settings and app registry:

- **`config/celery.py`** — creates the Celery `app` object, points it at
  Django's settings for config (`app.config_from_object('django.conf:settings', namespace='CELERY')`
  — any `CELERY_*` setting in `settings.py` becomes a Celery config option
  automatically), and calls `app.autodiscover_tasks()` so Celery finds a
  `tasks.py` in any installed app without manual registration.
- **`config/__init__.py`** — imports that `app` on Django startup
  (`from .celery import app as celery_app`). Standard pattern so Celery and
  Django share one process.

Added to `settings.py`:

```python
CELERY_BROKER_URL = env('CELERY_BROKER_URL')       # redis://localhost:6379/0
CELERY_RESULT_BACKEND = env('CELERY_RESULT_BACKEND')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
```

Verified both processes start and connect to Redis cleanly:

```bash
celery -A config worker --loglevel=info   # → "celery@... ready."
celery -A config beat --loglevel=info     # → "beat: Starting..."
```

### Step 6: Base apps

```bash
python manage.py startapp resumes
python manage.py startapp job_search
python manage.py startapp matching
python manage.py startapp applications
```

These four are real Django apps (they'll hold models) — registered in
`INSTALLED_APPS`.

`core` and `auto_apply` were created as **plain Python packages** instead
(just an `__init__.py`, no `startapp`) — they hold service/glue code (the
Claude client wrapper, Playwright scripts), not database models. Running
`startapp` for them would generate unused `admin.py`, `views.py`, and an
empty `migrations/` folder that would never get a migration — dead weight
for a module with no models.

`accounts` (for django-allauth) was scaffolded briefly, then removed —
auth is a later phase, not needed yet.

**State at end of Phase 0:** `python manage.py check` and
`python manage.py migrate` both run clean. Postgres and Redis are running
as local system services; Celery worker and Beat both start and connect.

`requirements.txt` reflects everything installed so far:

```
amqp, asgiref, billiard, celery, click(+plugins), Django, django-environ,
djangorestframework, kombu, packaging, prompt_toolkit, psycopg2-binary,
python-dateutil, redis, six, sqlparse, tzdata, tzlocal, vine, wcwidth
```

### Step 7: Claude API client wrapper

```bash
pip install anthropic
```

Added `ANTHROPIC_API_KEY = env('ANTHROPIC_API_KEY', default='')` to
`settings.py` (default `''` so `manage.py check` doesn't hard-fail if the
var is ever missing — the real failure surfaces later, at the first actual
API call, not at settings load). Added the `ANTHROPIC_API_KEY` slot to
`.env` (placeholder — **needs the real key pasted in**) and `.env.example`.

**`core/claude_client.py`** — the single wrapper every future Claude call
goes through (resume parsing, match scoring, cover letter generation all
import this instead of constructing their own `anthropic.Anthropic()`).
Centralizing it here means the model string, retry count, and API key
source are each defined in exactly one place:

```python
import anthropic
from django.conf import settings

MODEL = 'claude-sonnet-5'

_client = None

def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            max_retries=3,
        )
    return _client

def create_message(*, messages, system=None, max_tokens=4096, **kwargs):
    return get_client().messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
        **kwargs,
    )
```

- `get_client()` lazily builds one `anthropic.Anthropic` instance and
  reuses it (module-level `_client` cache) — avoids re-creating the HTTP
  client on every call. `max_retries=3` means the SDK automatically retries
  transient failures (429 rate limits, 5xx errors) with backoff, without
  every caller having to implement that themselves.
- `create_message()` is the actual call-site helper: pins the model to
  `claude-sonnet-5` (the project's chosen model — see the model catalog
  notes; this ID has no separate dated snapshot, it's already the pinned,
  specific string), and forwards everything else (`messages`, `system`,
  extra kwargs like `tools` or `output_config`) straight to the SDK.

**Model choice:** `claude-sonnet-5`, per the original project notes.

Verified: `manage.py check` passes, and the client constructs successfully
(`get_client()` returns an `anthropic.Anthropic` instance) — construction
doesn't validate the API key, so this confirms the wiring is correct, not
that the key itself works. That check happens on the first real API call,
in Phase 1.

**Real API key added and verified.** First live test call caught a bug in
the wrapper: `create_message()` passed `system=None` straight through to
`messages.create()`, which sends a literal `system: null` in the request
body — the API rejects that (`system: Input should be a valid array`),
it wants the key omitted entirely when there's no system prompt, not set
to null. Fixed by only adding `system` to the kwargs dict when it's
actually provided:

```python
def create_message(*, messages, system=None, max_tokens=4096, **kwargs):
    if system is not None:
        kwargs['system'] = system
    return get_client().messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=messages,
        **kwargs,
    )
```

Re-ran the test call (`"Reply with exactly one word: pong"`) — got back
`stop_reason: end_turn`, response text `"pong"`. Claude API integration is
confirmed working end to end.

---

## Phase 1 — Resume parsing

*(not started yet)*
