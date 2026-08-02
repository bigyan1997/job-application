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

### Step 1: `Resume` model + migration

`resumes/models.py`:

```python
class Resume(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PARSED = 'parsed', 'Parsed'
        FAILED = 'failed', 'Failed'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='resumes')
    file = models.FileField(upload_to='resumes/')
    original_filename = models.CharField(max_length=255)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    parsed_data = models.JSONField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

- `user` FK matches the architecture doc's "User → many Resume" relationship.
- `status` tracks where the resume is in the pipeline (`pending` right
  after upload → `parsed` once Claude returns structured data, or `failed`
  if that call errors) — the frontend/API can poll this instead of the
  upload response having to block on the Claude call.
- `parsed_data` is a Postgres `JSONField` — the structured output from
  Claude (skills, titles, years of experience, achievements) lands here
  as-is, no separate columns per field.
- `error_message` captures why parsing failed, for debugging/display.

Added `MEDIA_URL` / `MEDIA_ROOT` to `settings.py` so uploaded files have
somewhere to land locally (plain disk storage for now — the architecture
doc calls for Cloudinary storage, which is a later swap, not needed to get
the pipeline working end to end).

```bash
python manage.py makemigrations resumes
python manage.py migrate
```

### Step 2: Claude parsing service + Celery task

Split into two files, matching the app-structure diagram in the
architecture doc:

**`resumes/services/claude_parser.py`** — the actual Claude call. Rather
than extracting text from the PDF ourselves (a separate parsing library,
one more thing that can go wrong), the file is sent to Claude directly as
a `document` content block (base64-encoded) when it's a PDF — Claude reads
PDFs natively. Plain-text resumes are decoded and sent as a text block
instead, since the `document` block type is specifically for PDFs.

The extraction uses **structured outputs** (`output_config.format` with a
JSON schema) rather than a "please respond only with JSON" prompt — this
guarantees the response is valid, schema-conforming JSON instead of hoping
the model doesn't wrap it in markdown or add commentary:

```python
RESUME_SCHEMA = {
    'type': 'object',
    'properties': {
        'skills': {'type': 'array', 'items': {'type': 'string'}},
        'titles': {'type': 'array', 'items': {'type': 'string'}},
        'years_experience': {'type': 'number'},
        'achievements': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['skills', 'titles', 'years_experience', 'achievements'],
    'additionalProperties': False,
}
```

`parse_resume_file(file_bytes, filename)` builds the right content blocks,
calls `create_message()` from `core/claude_client.py` with that schema,
and returns the parsed dict — matches the JSON shape from the original
project notes exactly (skills, titles, years_experience, achievements).

**`resumes/tasks.py`** — the Celery task wrapping that service call:

```python
@shared_task
def parse_resume(resume_id):
    resume = Resume.objects.get(id=resume_id)
    try:
        with resume.file.open('rb') as f:
            file_bytes = f.read()
        resume.parsed_data = parse_resume_file(file_bytes, resume.original_filename)
        resume.status = Resume.Status.PARSED
        resume.save(update_fields=['parsed_data', 'status', 'updated_at'])
    except Exception as exc:
        resume.status = Resume.Status.FAILED
        resume.error_message = str(exc)
        resume.save(update_fields=['status', 'error_message', 'updated_at'])
        raise
```

Runs as a background job (not inline in the request) because the Claude
call takes a few seconds — the upload endpoint returns immediately with
`status: pending`, and the frontend polls or refetches until it flips to
`parsed`.

### Step 3: Upload endpoint (DRF)

- `resumes/serializers.py` — `ResumeSerializer`, a `ModelSerializer` with
  `status`, `parsed_data`, `error_message`, and `created_at` marked
  read-only (client only ever supplies `file`).
- `resumes/views.py` — `ResumeViewSet`, a `ModelViewSet` restricted to
  `get`/`post`/`head`. `get_queryset()` scopes results to
  `request.user`'s own resumes. `perform_create()` sets `user` and
  `original_filename` from the request, saves the row, then kicks off the
  background task: `parse_resume.delay(resume.id)`.
- `resumes/urls.py` — a DRF `DefaultRouter` registered at `/resumes/`.
- Wired into `config/urls.py` under `/api/`, plus a dev-only static route
  for serving uploaded files (`MEDIA_URL`/`MEDIA_ROOT`, `DEBUG`-gated).

Auth: `IsAuthenticated` permission — DRF's default authentication classes
(session + HTTP Basic) work out of the box, no extra config needed yet.
Real login (Google via django-allauth) is a later phase; for now, a
superuser account is enough to test against.

### Step 4: End-to-end test

Created a test superuser and a plain-text sample resume, started the
Celery worker and dev server, and drove the whole pipeline with `curl`:

```bash
curl -u testuser:testpass123 -X POST http://127.0.0.1:8000/api/resumes/ \
  -F "file=@sample_resume.txt"
# → {"status": "pending", "parsed_data": null, ...}

# a few seconds later:
curl -u testuser:testpass123 http://127.0.0.1:8000/api/resumes/1/
# → {"status": "parsed", "parsed_data": {
#      "skills": ["Python", "Django", "React", "PostgreSQL", "Celery", "Docker", "Git", "REST APIs"],
#      "titles": ["Software Developer", "Junior Developer"],
#      "achievements": [...],
#      "years_experience": 4
#    }, ...}
```

Worker log confirmed the real API call: `POST
https://api.anthropic.com/v1/messages "HTTP/1.1 200 OK"`, task succeeded
in ~5s. Upload → background parse → structured JSON confirmed working
end to end.

---

## Phase 2 — Job search

### Step 1: `JobSearchProfile` + `JobListing` models

`job_search/models.py`:

```python
class JobSearchProfile(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='job_search_profiles')
    target_role = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=2, default='AU')
    keywords = ArrayField(models.CharField(max_length=100), default=list, blank=True)
    auto_apply_enabled = models.BooleanField(default=False)
    search_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class JobListing(models.Model):
    class AtsType(models.TextChoices):
        GREENHOUSE = 'greenhouse', 'Greenhouse'
        LEVER = 'lever', 'Lever'
        OTHER = 'other', 'Other'

    title = models.CharField(max_length=255)
    company = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    url = models.URLField(max_length=1000, unique=True)
    source = models.CharField(max_length=50)
    ats_type = models.CharField(max_length=10, choices=AtsType.choices, default=AtsType.OTHER)
    posted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

- `JobSearchProfile.keywords` uses Postgres's `ArrayField` — a native array
  column — rather than a separate `Keyword` model or a comma-joined
  string. Simpler for a small, unordered list of terms.
- `JobListing` has **no FK to `JobSearchProfile`** — it's a shared pool of
  raw postings, deduped globally on `url` (a DB-level `unique=True`
  constraint backs up the `get_or_create` dedup in the task). The same
  posting found by two different users' searches is stored once. Later
  phases (matching) will score each listing against each user's resume
  independently — the listing itself doesn't "belong" to a search.
- `ArrayField` requires `'django.contrib.postgres'` in `INSTALLED_APPS` —
  without it, Django's system check fails with `postgres.E005`.

```bash
python manage.py makemigrations job_search
python manage.py migrate
```

Registered both models in `job_search/admin.py` for inspection via
`/admin/`.

### Step 2: Adzuna integration

`job_search/services/adzuna.py` — `search_adzuna(target_role, location, country)`
hits Adzuna's real search API (`GET /v1/api/jobs/{country}/search/1`) with
`app_id`/`app_key` from settings, and normalizes each result into the
common shape (`title`, `company`, `location`, `description`, `url`,
`source`, `posted_at`) that the task expects from every source.

Added `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` to `settings.py` (read from
`.env`, same pattern as the Anthropic key). Verified with a real call
against `Sydney` / `software developer` — 20 relevant AU results.

### Step 3: RemoteOK integration

`job_search/services/remoteok.py` — RemoteOK's public feed
(`GET /api`) has no server-side search; it returns a rotating snapshot of
~100 listings that has to be filtered client-side.

**First version matched against both job title and tags** — this produced
false positives: several listings on the free feed are tag-stuffed with
30-40+ generic/unrelated tags (looks like spam or bad scraping on
RemoteOK's end), so a single stray tag like `python` showed up on
completely unrelated postings ("Deputy Manager Sales HR", a French tutor
listing). Tried tightening it to "only trust short tag lists" first — that
didn't fully fix it either, since junk tags weren't confined to long
lists. **Settled on matching against the job title only** — the one field
that's actually reliable on this feed. Verified: searching `'engineer'`
returned 3 clean, genuinely relevant results with zero junk.

Note for later: this free/unauthenticated feed only returns a rotating
~100-listing snapshot, not a searchable archive — a query with no live
matches in the current snapshot returns 0 results, which is expected
behavior, not a bug.

### Step 4: Celery Beat task + dedup

`job_search/utils.py` — `detect_ats_type(url)`, a plain substring check:
`greenhouse.io` → `greenhouse`, `lever.co` → `lever`, else `other`.

`job_search/tasks.py`:

```python
def search_jobs_for_profile(profile: JobSearchProfile) -> int:
    listings = search_adzuna(...) + search_remoteok(...)
    created_count = 0
    for item in listings:
        _, created = JobListing.objects.get_or_create(
            url=item['url'],
            defaults={..., 'ats_type': detect_ats_type(item['url']), ...},
        )
        if created:
            created_count += 1
    return created_count

@shared_task
def search_jobs():
    for profile in JobSearchProfile.objects.filter(search_active=True):
        search_jobs_for_profile(profile)
```

`get_or_create(url=...)` is the dedup mechanism — the DB-level `unique=True`
on `JobListing.url` backs it up so a race between two workers can't create
duplicates either.

Added to `settings.py` — this is what makes `search_jobs` actually run
automatically every 24 hours once Celery Beat is running, instead of only
ever running when called manually:

```python
CELERY_BEAT_SCHEDULE = {
    'search-jobs-every-24-hours': {
        'task': 'job_search.tasks.search_jobs',
        'schedule': 60 * 60 * 24,
    },
}
```

### Step 5: End-to-end test

Created a real `JobSearchProfile` (`software developer`, Sydney, AU,
keywords `[python, django]`) and ran `search_jobs()` directly:

- **First run:** 20 new `JobListing` rows created (all `ats_type: other`
  — Adzuna's redirect URLs aren't direct ATS links).
- **Rerun:** 5 new rows created, not 0 — this is real-world API variance
  (Adzuna's live/sponsored results shift slightly between calls), not a
  dedup failure.
- To prove the dedup logic itself is correct independent of live API
  noise, ran `search_jobs_for_profile()` twice with the Adzuna/RemoteOK
  calls mocked to return the exact same fixed listing (a fake
  `boards.greenhouse.io` URL): **first call created 1 row, second call
  created 0** — confirmed only one row exists for that URL.
- Same test confirmed `ats_type` detection end to end: the mocked
  `greenhouse.io` URL was correctly tagged `ats_type: greenhouse`.
  Spot-checked `lever.co` → `lever` and a plain `adzuna.com.au` URL →
  `other` directly against `detect_ats_type()` as well.

---

## Phase 3 — Matching + cover letters

*(not started yet)*
