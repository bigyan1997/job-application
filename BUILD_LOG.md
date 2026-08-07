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

### Step 1: `Application` model

`applications/models.py`:

```python
class Application(models.Model):
    class Status(models.TextChoices):
        COVER_LETTER_READY = 'cover_letter_ready', 'Cover letter ready'
        MANUAL_PENDING = 'manual_pending', 'Manual pending'
        AUTO_APPLIED = 'auto_applied', 'Auto applied'
        APPLIED = 'applied', 'Applied'
        INTERVIEW = 'interview', 'Interview'
        REJECTED = 'rejected', 'Rejected'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='applications')
    job_listing = models.ForeignKey(JobListing, on_delete=models.CASCADE, related_name='applications')
    resume = models.ForeignKey(Resume, on_delete=models.CASCADE, related_name='applications')
    match_score = models.PositiveSmallIntegerField(validators=[MinValueValidator(0), MaxValueValidator(100)])
    match_rationale = models.TextField()
    cover_letter = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.COVER_LETTER_READY)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['user', 'job_listing']
```

- Default `status` is `cover_letter_ready` — matches the architecture
  doc's data flow exactly: an `Application` row only comes into existence
  *after* scoring + cover letter generation succeed, not before.
- `unique_together = ['user', 'job_listing']` enforces "one Application
  per user per job" at the database level — the `JobListing ←→
  Application is one-to-many per user` relationship from the notes.

```bash
python manage.py makemigrations applications
python manage.py migrate
```

### Step 2: Claude matcher service

`matching/services/claude_matcher.py` — two independent functions, one
per Claude call (matches the architecture doc's two separate call types:
match scoring and cover letter generation).

**`score_match(resume_data, job_description)`** — structured output again
(`output_config.format` + a `{score, rationale}` JSON schema), same
reasoning as the resume parser: guarantees valid, parseable JSON instead
of hoping the model's prose-wrapped answer parses cleanly. Score is
clamped to `0-100` after parsing as a safety net.

**`generate_cover_letter(resume_data, job_description, company_name)`** —
plain text response, no schema (a cover letter is prose, not structured
data). Prompt explicitly says not to invent experience the candidate
doesn't have, to avoid placeholder brackets like `[Company Name]`, and to
keep it under 350 words.

### Step 3: The Celery task

`matching/tasks.py`:

```python
@shared_task
def score_and_generate_cover_letter(resume_id, job_listing_id):
    resume = Resume.objects.get(id=resume_id)
    job_listing = JobListing.objects.get(id=job_listing_id)

    if Application.objects.filter(user=resume.user, job_listing=job_listing).exists():
        return None

    match_result = score_match(resume.parsed_data, job_listing.description)
    cover_letter = generate_cover_letter(resume.parsed_data, job_listing.description, job_listing.company)

    return Application.objects.create(
        user=resume.user,
        job_listing=job_listing,
        resume=resume,
        match_score=match_result['score'],
        match_rationale=match_result['rationale'],
        cover_letter=cover_letter,
    ).id
```

The existence check before doing any Claude calls is a belt-and-suspenders
guard on top of the DB-level `unique_together` constraint — avoids paying
for two API calls just to hit an integrity error on save.

### Step 4: End-to-end test

Ran the task directly (not via `.delay()`, for immediate feedback) against
3 real `JobListing` rows from the Phase 2 Adzuna test data, using the
parsed resume from Phase 1:

| Job | Score | Why |
|---|---|---|
| Software Developer @ Home | 82 | Skills/experience overlap is strong |
| Software Development Intern @ Study and Work | 25 | Correctly flagged as overqualified for an entry-level program |
| Software Development Engineer @ Amazon | 25 | Description was actually AWS *Infrastructure Services* (hardware/ops), not general dev — scored on the real description content, not just the generic title |

Scores were directionally sound in all three cases, including correctly
penalizing a title/description mismatch rather than pattern-matching on
the job title alone. Cover letters were professional, cited the
candidate's actual achievements (the PHP→Django migration, the API
optimization) without inventing anything, and stayed close to the
350-word ceiling.

**One data-quality finding:** the first test run produced a rationale
string with garbled trailing characters baked into the JSON string value
itself (`...slightly limits a perfect match."}}}{ `) — still technically
valid JSON (it parsed fine), just corrupted prose inside the field.
Reproducing the exact same call immediately after came back clean, so
this reads as an occasional model-output anomaly rather than a bug in the
parsing code — structured outputs guarantee valid *JSON*, not that every
string field's content is always clean. Not building defensive
sanitization around a single non-reproducible occurrence; noting it here
in case it recurs.

Also confirmed the task's own dedup guard: calling it a second time for
the same `(resume, job_listing)` pair returned `None` and created zero
additional rows.

---

## Phase 4 — Dashboard (backend API + frontend)

### Step 1: DRF API for `Application`

`applications/serializers.py` — `ApplicationSerializer` flattens the
useful bits of the related `JobListing` (`job_title`, `company`,
`job_url`, `ats_type`) onto the `Application` response via
`source='job_listing.title'` etc., so the frontend gets one flat object
per row instead of having to make a second request. Every field except
`status` and `cover_letter` is read-only — a client can update the
status (from a dropdown) or edit the cover letter, but can't tamper with
`match_score` or fabricate a different job listing.

`applications/views.py` — `ApplicationViewSet`, restricted to
`get`/`patch`/`head` (Applications are created by the matching task, not
by users directly — no `post`/`delete`). `get_queryset()` scopes to
`request.user` and supports `?status=` filtering via a query param.

`applications/urls.py` wired into `config/urls.py` under `/api/`.

### Step 2: Token auth + CORS

Session authentication (DRF's other default) requires CSRF token
handling, which is real friction for a separate React SPA making
cross-origin requests — and full login (Google via django-allauth) is
still a later phase. Added **token authentication** instead:

- `'rest_framework.authtoken'` in `INSTALLED_APPS` (migrated — creates
  the token table).
- `REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES` now lists
  `TokenAuthentication` first, keeping `SessionAuthentication` +
  `BasicAuthentication` too (so the admin panel and `curl -u` testing
  still work unchanged).
- Generated a token for `testuser` via `Token.objects.get_or_create()`.
  The frontend sends it as `Authorization: Token <key>`.

Also added `django-cors-headers` (`corsheaders` in `INSTALLED_APPS`,
`CorsMiddleware` early in `MIDDLEWARE`) with `CORS_ALLOWED_ORIGINS`
defaulting to `http://localhost:5173` (Vite's dev port) — without this,
the browser blocks the frontend's requests to the API entirely since
they're on different origins (`5173` vs `8000`).

Verified via `curl` with `Authorization: Token ...`: listing, `?status=`
filtering, and `PATCH` all work; confirmed read-only fields (tried
setting `match_score` to `999` via PATCH) are silently ignored while
`status` still updates.

### Step 3: React + Vite + Tailwind frontend

```bash
npm create vite@latest frontend -- --template react
cd frontend && npm install
npm install -D tailwindcss @tailwindcss/vite
```

Tailwind v4 configuration is CSS-based (no `tailwind.config.js` needed)
— `@tailwindcss/vite` plugin added to `vite.config.js`, and
`src/index.css` defines the design tokens as an `@theme` block:

```css
@theme {
  --font-display: 'Space Grotesk', sans-serif;
  --font-body: 'Public Sans', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --color-bg: #faf9f7;
  --color-accent: #1f6f54;
  --color-amber: #a9762c;
  --color-rust: #c4746a;
  /* ...etc, matching the mockup's design direction */
}
```

Tailwind v4 auto-generates utility classes from `--color-*`/`--font-*`
theme variables (e.g. `--color-accent` → `bg-accent`, `text-accent`,
`border-accent`), so components just use `bg-accent` etc. directly.

**`src/api.js`** — a thin fetch wrapper. `VITE_API_URL` and
`VITE_API_TOKEN` come from `frontend/.env` (git-ignored;
`frontend/.env.example` has the template). The token is a stopgap for
local dev — once real login exists, this gets replaced with a proper
session/OAuth flow instead of a hardcoded token.

**`src/components/PipelineTrail.jsx`** — the signature element from the
design mockup: a 5-dot trail (found → matched → letter ready → applied →
response) instead of a generic status badge. A config map translates
each `Application.status` value into how many dots are "done" (green),
which one is "current" (amber, or rust if `rejected`), and the label text
underneath.

**`src/components/ApplicationRow.jsx`** — one row per application: title,
company, the pipeline trail, match score + tier label, date, a status
dropdown (PATCHes on change), an "Open" link to the job posting, and a
"letter" toggle that expands an inline view of the match rationale plus
an editable cover letter textarea with a "Save letter" button (disabled
until the text actually changes).

**`src/App.jsx`** — the dashboard shell: header with live stats (found /
pending / applied / interview, computed from the loaded applications),
filter tabs that re-fetch with `?status=`, and the row list.

### Step 4: Browser-verified end to end

Started the Django dev server and the Vite dev server together, then
drove a real headless Chromium (Playwright) against the running frontend
— not just "it compiles," an actual rendered page hitting the real API:

- Dashboard loaded with 3 real `Application` rows from earlier phases —
  correct scores, correct pipeline-trail stage per status, zero console
  errors, zero failed network requests.
- Expanded the cover letter panel on a row — rationale and editable
  letter text rendered correctly, "Save letter" correctly disabled with
  no unsaved changes.
- Changed a row's status via the dropdown (`cover_letter_ready` →
  `interview`) — confirmed the `PATCH` round-tripped and the UI updated
  live: pipeline trail advanced to "interview scheduled," and the header
  stats recalculated (interview 0→1, pending 2→1) without a page reload.

Screenshots confirmed the visual direction matches the mockup: warm
off-white background, green/amber/rust dot trail, JetBrains Mono for
numeric data, black pill buttons.

**Not done yet:** deployment (backend → Railway, frontend → Vercel) —
holding off since it means creating real cloud resources under your
accounts, which needs your go-ahead first.

---

## Phase 4b — Setup screen (resume upload + search profile)

The mockups included a second screen (resume upload + search profile
form) that the Phase 4 checklist didn't explicitly call out — went back
and built it.

### Step 1: `JobSearchProfile` DRF API

Same shape as `Application`'s: `job_search/serializers.py`
(`JobSearchProfileSerializer`), `job_search/views.py`
(`JobSearchProfileViewSet`, scoped to `request.user`, `perform_create`
sets `user`), `job_search/urls.py`. Wired into `config/urls.py`.

**Bug caught during this work:** `resumes/views.py`'s `get_queryset()` had
no `order_by()`, so "the user's resume" (`resumes[0]` on the frontend)
was actually the *oldest* uploaded resume, not the latest — a new upload
would silently never show up as current. Fixed with
`.order_by('-created_at')`.

### Step 2: Setup page (resume upload + profile form)

`frontend/src/pages/Setup.jsx` — two panels matching the mockup:

- **Resume panel** — upload button (no drag-and-drop, click-to-select
  only, for reliability), a status badge (`parsing…` / `parsed` /
  `failed`) that polls `GET /resumes/{id}/` every 2s while `pending`,
  and once parsed, chips for detected roles, skills, and years of
  experience — reusing the same `parsed_data` shape from Phase 1.
- **Search profile panel** — target role, location, a keyword tag input
  (add on Enter, remove with ×), auto-apply and search-active toggles,
  and a Save button. On save: `PATCH` if a profile already exists,
  `POST` if not.
- Deliberately did **not** fabricate the mockup's "next search runs in
  Xh Ym" countdown — there's no real data source for it (Celery Beat's
  internal schedule isn't exposed via the API), so the toggle's subtext
  just says "Runs every 24 hours," which is true, instead of a fake
  countdown.

Added `react-router-dom` and a `TopNav` component (Tracker / Setup links)
so `App.jsx` is now a router shell instead of directly rendering the
dashboard.

Extended `frontend/src/api.js` with resume and job-search-profile calls,
including a `uploadResume()` that sends `FormData` — had to make the
shared `request()` helper skip setting `Content-Type` for `FormData`
bodies, since a manually-set `Content-Type: application/json` would
clobber the multipart boundary the browser needs to add itself.

### Step 3: Browser-verified — and a real mistake caught mid-test

Drove the Setup page with headless Chromium as before. Partway through,
noticed the "before" screenshot showed data I hadn't entered — a resume
called `Bigyan_Karki_Resume.pdf` with real, specific skills (Stripe
integration, JWT auth, Google Gemini API, etc.), and a job search profile
with `target_role: "Django Pythin Developer"` (a plausible real typo, not
something a test script would produce).

**What had happened:** the Django + Vite dev servers from testing were
still running and reachable at `localhost`, and it looks like you opened
the Setup page yourself and tried it out with your real resume while I
was mid-test. My test script's synthetic resume upload (`resume2.txt`,
fake "Jamie Chen" data) landed with a *later* timestamp than your real
upload, so — combined with the `order_by` fix above — my fake resume
briefly became "the current resume" instead of yours. I'd also reset
`target_role` twice while debugging what I thought was a display bug,
which overwrote what you'd actually typed.

**What was and wasn't affected:** your actual `Resume` row (id 3) and its
parsed data were never touched — only which resume the frontend treated
as "current," and the `JobSearchProfile.target_role` field. Fixed by:
deleting the synthetic test resume rows, and restoring `target_role` to
`"Django Pythin Developer"` — the exact value visible in the first
screenshot before I touched anything, rather than silently correcting
the likely typo.

**Side effect:** deleting my old Phase 1 test resume (id 1) cascaded
(`on_delete=CASCADE`) and removed the 3 `Application` rows from Phase 3's
test matching run, since they referenced it via FK. That was my own
demo data, not anything of yours — but it means the Dashboard will show
empty until matching is re-run against a real `JobListing` + your resume.

Re-verified with a final screenshot after cleanup: real resume showing
as `parsed` with correct chips, search profile showing the restored,
correct values, zero data loss on anything real.

**Lesson for next time:** a locally-running dev server is reachable by
anyone with the URL, including the user, while automated testing is in
progress — worth checking for concurrent real usage before resetting or
overwriting "test" data that might not be mine.

---

## Phase 4c — Wiring search → matching together automatically

After the Setup screen shipped, walked through what actually happens
when you click "Save & Start Searching" — and the honest answer was
"nothing yet." Saving the profile only writes it to the database.
Nothing was listening for it: Celery Beat wasn't running, and even when
it is, `search_jobs` finding a new listing never triggered matching —
that only ever happened when I ran it manually during testing. Fixed the
second half of that gap.

### The fix

`job_search/tasks.py` — `search_jobs_for_profile()` now dispatches
`matching.tasks.score_and_generate_cover_letter` for every listing the
search touches (new **or** already-known from a different user's
search), using the profile owner's most recently parsed resume:

```python
resume = Resume.objects.filter(
    user=profile.user, status=Resume.Status.PARSED,
).order_by('-created_at').first()

if resume:
    for listing_id in touched_listing_ids:
        score_and_generate_cover_letter.delay(resume.id, listing_id)
```

Deliberately **not** just dispatching for newly-*created* listings: since
`JobListing` dedup is global (not per-user), a listing already discovered
by one user's search would otherwise never get matched against a
*different* user's resume when their search independently finds the same
posting. Firing for every touched listing and relying on
`score_and_generate_cover_letter`'s existing internal existence check
(added back in Phase 3) to no-op cheaply for already-matched pairs is
simpler and correct for both cases — no wasted Claude calls, since that
check happens before either API call.

### Real-world debugging along the way

Ran the corrected pipeline against your actual saved profile
(`target_role: "Django Pythin Developer"`) and got **zero** results from
both Adzuna and RemoteOK. Traced it to the typo, fixed it — still zero.
Dug into Adzuna's raw API response directly and found `count: 0`, a
genuine result, not an error. Tested narrower vs. broader queries against
the real API:

| Query | Adzuna result count |
|---|---|
| `"Django Python Developer"` | 0 |
| `"Django Developer"` | 1 |
| `"Python Developer"` | 83 |

**Finding:** Adzuna's `what` parameter ANDs every word together — a
compound multi-technology target role narrows the search to almost
nothing. Settled on `"Python Developer"` for a working demo (your call,
not something I picked silently).

### Confirmed working, fully automatically

Re-ran `search_jobs()` — 20 new listings created, and the worker log
showed 20 `matching.tasks.score_and_generate_cover_letter` tasks fire
**on their own**, no manual dispatch. All 20 succeeded, creating real
`Application` rows scored against your actual resume — sensible
variation (Senior Backend Engineer / Python roles scoring 62–68, a Cyber
Security or 3D Geometry role scoring 8–15). Screenshotted the Dashboard
showing all 20 real results.

This closes the loop: once Celery Beat is running continuously (still
not started in this dev session — needs `celery -A config beat` alongside
the worker), the 24-hour cycle described in the architecture doc is now
actually wired end to end, not just individually-tested pieces.

---

## Phase 4d — Real sign-off + regenerate-with-instructions

Two requested fixes to cover letter generation: the closing was a
`[Candidate Name]` placeholder instead of the real person, and there was
no way to ask for a revision without hand-editing the text yourself.

### Real name/email/phone in the sign-off

The resume parser never extracted contact details in the first place —
`RESUME_SCHEMA` only had `skills`/`titles`/`years_experience`/
`achievements`. Added `name`, `email`, `phone` as required string fields
(instructed to return `""` when a resume doesn't list one, rather than
inventing something).

`matching/services/claude_matcher.py` gained a `_contact_instruction()`
helper, shared by both cover-letter functions, that turns whatever
contact fields are actually present into an explicit prompt instruction:
sign off with the real name/email/phone verbatim, or — if none are on
file — just `"Sincerely,"` with nothing invented after it. This replaces
the old free-floating "don't use placeholder brackets" instruction, which
was general enough that the model filled the gap with `[Candidate Name]`
anyway.

Re-parsed the real resume with the updated schema and regenerated a
cover letter to confirm the fix — the sign-off now reads:

```
Sincerely,
Bigyan Karki
karkibigyan05@gmail.com
0430 556 905
```

Existing `Resume` rows won't have `name`/`email`/`phone` in their
`parsed_data` until re-parsed (schema changes don't retroactively apply)
— not a problem going forward since every new upload gets the new
fields, but worth knowing if older parsed resumes are still in a
database somewhere.

### Regenerate with instructions

`matching/services/claude_matcher.py` — new `regenerate_cover_letter()`,
sibling to `generate_cover_letter()`: takes the existing letter text plus
free-text instructions from the candidate, and asks Claude to revise
(not rewrite from scratch) while staying grounded in the real resume
data and keeping the same contact-info sign-off rules.

`applications/views.py` — `ApplicationViewSet` is now composed from DRF
mixins (`ListModelMixin`, `RetrieveModelMixin`, `UpdateModelMixin` +
`GenericViewSet`) instead of `ModelViewSet`, specifically so there's no
`create`/`destroy` at all — safer than relying on `http_method_names` to
block POST, since a custom `@action` on this endpoint needs `'post'` in
that list anyway (it's checked at Django's `View.dispatch()` before
routing even happens). Added `@action(detail=True, methods=['post'])
regenerate_cover_letter` — validates `instructions` is non-empty, calls
the service function, saves, returns the updated `Application`.

Frontend: `api.js` gained `regenerateCoverLetter(id, instructions)`.
`Dashboard.jsx` owns the call (mirroring the existing `handleUpdate`
pattern) and passes `onRegenerate` down. `ApplicationRow.jsx` — a new
"Regenerate with instructions" section below the existing cover-letter
textarea: a small input for what to change, a button (disabled until
something's typed), and on success the textarea updates with the new
text and the instructions field clears.

**Browser-tested end to end:** expanded a real application's cover
letter, typed an instruction ("mention that I'm comfortable working in a
fully remote, async-first team"), clicked Regenerate — confirmed the
letter text actually changed, the new text incorporated the instruction
(verified programmatically, not just visually), and the sign-off still
correctly showed the real name/email/phone after the rewrite. Zero
console errors.

---

## Phase 4e — Dashboard filters: sort, min score, ATS type

Requested: filter by match score and by date found. Suggested adding an
`ats_type` filter alongside it (Greenhouse/Lever are the only auto-apply
candidates, so it's directly useful) — confirmed before building.

Landed on **sort + threshold together** rather than picking one: a sort
dropdown (newest/oldest, highest/lowest match) covers "order by date" and
"order by score," and a separate minimum-score dropdown covers "only show
me the good ones" — different needs, so both stayed.

### Backend

`applications/views.py` — added DRF's built-in `OrderingFilter`
(`ordering_fields = ['match_score', 'created_at']`, default
`ordering = ['-created_at']`) rather than hand-rolling sort-direction
parsing — it already handles the `?ordering=-match_score` /
`?ordering=match_score` convention correctly. Added two more manual
filters in `get_queryset()` alongside the existing `status` one:
`min_score` (`match_score__gte`) and `ats_type`
(`job_listing__ats_type`).

### Frontend

`api.js` — `listApplications()` now takes an options object
(`{status, ordering, minScore, atsType}`) instead of a bare status
string, building the query string from whichever are set.

`Dashboard.jsx` — three new `<select>` controls next to the existing
status tabs (sort, min score, ATS source), each driving a query param;
changing any of them re-fetches. Stats header recalculates from
whatever's currently loaded, so it reflects the filtered set, not the
full unfiltered total.

**Verified both at the API and through the UI:** `?ordering=-match_score`
returned scores in correct descending order; `?min_score=60` correctly
returned only the 2 matching rows; `?ats_type=greenhouse` correctly
returned 0 (no Greenhouse-hosted listings in the current test data — all
from Adzuna, which returns `adzuna.com.au` redirect URLs, `ats_type:
other`). Same checks repeated by driving the actual dropdowns in a
browser — sort and min-score filter both produced the exact same
results as the direct API calls, zero console errors.

---

## Phase 4f — "Last crawled" indicator

The original mockup's dashboard header had a `last search 3h ago` meta
line that never got built. Rather than fabricate it from an indirect
signal (e.g. the newest `JobListing.created_at`, which only reflects
when something *new* was found — a search that ran but found nothing new
would look like it never ran), added a real field for it.

`job_search/models.py` — `JobSearchProfile.last_searched_at`
(nullable `DateTimeField`). `job_search/tasks.py` —
`search_jobs_for_profile()` stamps it with `timezone.now()` at the very
end, after the search + dedup + matching-dispatch all complete without
error — so it reflects a finished run, not an attempted one. Exposed as
read-only on `JobSearchProfileSerializer`.

Added `frontend/src/utils/time.js` — a small `timeAgo(isoString)` helper
(`"just now"` / `"Xm ago"` / `"Xh ago"` / `"Xd ago"`), shared by both
places that needed it:

- **Setup page**: the "Search active" toggle's subtext now reads `Runs
  every 24 hours · last crawled Xh ago` (or `not yet crawled` before the
  first run) instead of just the static schedule text.
- **Dashboard header**: now shows `{target_role} · {location} · last
  search Xh ago`, matching the original mockup line for line — replacing
  the static "Job Application Automation" placeholder subtitle.

**Verified:** ran `search_jobs()` for real, confirmed
`last_searched_at` populated in the DB, then confirmed both pages
render it correctly in a browser — Dashboard header read `"Python
Developer · Sydney · last search just now"`, Setup page read `"Runs
every 24 hours · last crawled just now"`. Zero console errors.

**Also found and fixed in passing:** two real resume uploads
(`Bigyan_resume.pdf`, `Bina Resume.pdf`) were stuck in `pending` —
you'd uploaded them live against the dev server while only Django and
Vite were running, with no Celery worker to actually process the parse
job sitting in the Redis queue. Started the worker; both drained and
parsed successfully (~10s each) with no data loss — they'd been queued
correctly the whole time, just waiting for a consumer.

---

## Phase 5 — Real authentication (Google + email/password)

Replaced the hardcoded dev token with actual login. Frontend and backend
are separate origins (`:5173` / `:8000`), which rules out the "vanilla"
django-allauth flow the original notes named — that's built around
server-rendered redirects and session cookies, which means fighting
cross-origin cookie/CSRF config for no real benefit here. Went with a
different, simpler shape instead (confirmed with you before building):
**Google Identity Services on the frontend + a verification endpoint on
the backend that mints one of our existing DRF tokens** — reuses the
token-auth plumbing that was already there instead of introducing a
second auth mechanism.

### Backend — `accounts` app

Plain package (no models — just Django's built-in `User` +
`rest_framework.authtoken.Token`, same reasoning as `core`/`auto_apply`
earlier: no models means no reason for the full `startapp` scaffold).

**`POST /api/auth/google/`** — takes `{credential}` (the ID token
Google's JS SDK hands the frontend), verifies it server-side against
Google's public keys via the `google-auth` library
(`id_token.verify_oauth2_token(credential, google_requests.Request(),
settings.GOOGLE_CLIENT_ID)` — the audience check against
`GOOGLE_CLIENT_ID` is what stops someone handing us a token meant for a
*different* app), then `get_or_create`s a `User` keyed on email as the
username. First-time Google sign-ins get `set_unusable_password()`
explicitly — makes it impossible to password-guess into a Google-only
account later.

**`POST /api/auth/register/`** and **`POST /api/auth/login/`** — added
after you asked for a normal email/password option alongside Google.
`register` runs the password through Django's built-in
`validate_password()` (rejects short/common/all-numeric passwords —
confirmed with a real 400 response body listing all three reasons) and
409s on a duplicate email. `login` uses `django.contrib.auth.authenticate()`
directly — works out of the box against `username=email` with the
default `ModelBackend`, no custom backend needed.

All three converge on one `_token_response(user)` helper —
`Token.objects.get_or_create(user=user)`, return `{token, email, name}`.
Same response shape regardless of which of the three ways the user signed
in, so the frontend doesn't care which one was used.

### Frontend

`api.js` — the static `VITE_API_TOKEN` env var is gone. `authToken` is
now a module-level variable seeded from `localStorage`, with
`setAuthToken()` / `getAuthToken()` to read and update it (and
`localStorage`) together. Also improved `request()`'s error handling
while here: failed requests now surface the backend's actual `{detail:
"..."}` message instead of a bare status code — needed so the login
form can show *why* a sign-in failed instead of a generic error.

`src/context/AuthContext.jsx` — a small React context wrapping the token
store so components re-render on login/logout (the module-level variable
in `api.js` alone doesn't trigger React re-renders). `login(token, user)`
commits both the token and a `{email, name}` object to state +
`localStorage`; `logout()` clears both.

`src/pages/Login.jsx` — one page, two paths: an email/password form
(toggles between sign-in and sign-up copy/fields) and Google's official
button below an "or" divider. Both paths converge on the same
`AuthContext.login()` call once the backend responds.

`App.jsx` — wrapped in `GoogleOAuthProvider` (needs
`VITE_GOOGLE_CLIENT_ID`, same client ID as the backend's — the ID token
audience has to match on both ends) and `AuthProvider`. Renders `Login`
when not authenticated, the real router (Dashboard/Setup/TopNav)
otherwise — no separate "protected route" wrapper needed since the
whole app sits behind one `isAuthenticated` check at the top.

`TopNav.jsx` — shows the signed-in user's email and a "Sign out" button
when logged in.

### Browser-tested end to end

- **Backend, directly**: register → 200 with token; duplicate email →
  400; login with correct password → same token as register; wrong
  password → 401; weak password (`"123"`) → 400 with Django's real
  validator messages.
- **Frontend, in a real browser**: signed up with a fresh email/password
  (`Browser Test User` / `browsertest@example.com`) → landed on the
  Dashboard, TopNav correctly showed the new email, correctly showed 0
  applications (proper per-user data isolation — the real account has
  20). Signed out → back to the login screen. Signed back in with the
  same credentials → back on the Dashboard. Zero console errors on any
  step.
- **Google button**: renders as Google's real official button (their
  actual iframe, not a mock) once `GOOGLE_CLIENT_ID` was wired in on
  both ends. Clicking it currently fails with `GSI_LOGGER: The given
  origin is not allowed for the given client ID` — expected, not a bug:
  the Google Cloud Console OAuth client needs `http://localhost:5173`
  added under **Authorized JavaScript origins** before Google will
  actually complete a sign-in from the dev server. That's a one-time
  step only doable from your Google Cloud Console account.

Cleaned up test users (`smoketest@example.com`, `weakpass@example.com`,
`browsertest@example.com`) after verification — none of this is real
account data.

---

## Phase 5a — Search on save, not just every 24 hours

Real usage surfaced this directly: a second real account
(`bhandaribina4@gmail.com`) created a `JobSearchProfile` via the Setup
page, clicked "Save & Start Searching," and — correctly, per the
original design — nothing searched. Saving a profile only ever wrote it
to the database; the only things that actually ran a search were Celery
Beat's 24-hour cycle or a manual trigger. That's a real gap between what
the button says and what it does.

`job_search/tasks.py` — added `search_jobs_for_profile_task(profile_id)`,
a thin `@shared_task` wrapper around the existing
`search_jobs_for_profile()` function (which takes a model instance, not
serializable — Celery tasks need plain arguments like an ID).

`job_search/views.py` — `JobSearchProfileViewSet.perform_create()` and
`perform_update()` both now call `search_jobs_for_profile_task.delay()`
after saving. Covers both "first profile ever" and "edited an existing
one" — the Setup page uses the same button/handler for both, so both
should behave the same way.

**Also fixed while investigating:** triggering a real search for the
new profile immediately surfaced a live Adzuna 503 (`Service Temporarily
Unavailable`) — and `search_jobs()`'s loop over active profiles had no
per-profile error isolation, so one profile hitting a flaky upstream API
killed the whole batch before it reached any other user's profile.
Wrapped each profile's search in the loop with `try`/`except` +
`logger.exception()` so one failure is logged and skipped rather than
silently blocking every other account's search.

**Also confirmed (re-discovered, same root cause as the earlier "Django
Python Developer" issue):** the new account's target role — `"Personal
Care Worker, Assistant in Nursing"` — returned 0 Adzuna results as one
phrase (Adzuna ANDs every word together), versus 7 results each for
`"Personal Care Worker"`, `"Assistant in Nursing"`, or `"Aged Care
Worker"` individually. Left as-is for the account owner to fix via the
Setup page rather than editing their profile myself.

**Process-management mistake, corrected:** while restarting services to
pick up the new Celery task, ran `pkill -f` against `celery worker`,
`celery beat`, and `runserver` by name without first checking whether
those PIDs belonged to processes I'd started versus the user's own
open terminals (they run their own dev servers in parallel with my
testing sessions). Stopped immediately, confirmed Django/Vite were
unaffected, and left Celery worker restart to the user rather than
continuing to guess at process ownership. Saved this as a standing
rule in memory — checking tracked PIDs (and the TTY column in `ps aux`)
before killing anything dev-server-shaped in this project, going
forward.

---

## Phase 5b — Duplicate job listings

Visible directly in real results: `bhandaribina4@gmail.com`'s search
showed "First Nations Trainee - Personal Care Worker - Darwin" three
times, under three different company-name spellings (`ARRCS Australian
Regional and Remote Community Services` / `Arrcs` / `Australian Regional
and Remote Community Services`) and three different URLs — the same real
posting, syndicated by Adzuna from multiple source feeds. The existing
dedup (`JobListing.url` unique) only catches an *exact* repeat URL, which
doesn't help when the aggregator hands out a different URL each time for
what's actually the same job.

### The fix

`job_search/tasks.py` — added `_find_duplicate(item)`, checked *before*
creating each `JobListing`, using two independent signals:

```python
query = Q(url=item['url'])
if title and location:
    query |= Q(title__iexact=title, location__iexact=location)
if description:
    query |= Q(description=description)
return JobListing.objects.filter(query).first()
```

**Deliberately title+location together, not title alone** — two
"Software Engineer" postings in different cities are almost certainly
different jobs at different companies, and collapsing those would be a
real regression, not a fix. Verified this directly: a same-title,
different-city, different-description pair correctly stayed separate.
The exact-description-match branch catches the remaining case (a
syndicated repost with a differently-worded title but identical body
text). Verified the actual duplicate pattern too — three synthetic items
mimicking the real ARRCS spelling variations all correctly collapsed to
one.

When a duplicate is found, the *existing* listing's ID still gets added
to `touched_listing_ids` — so matching still runs for a user who hasn't
seen that listing yet, it just doesn't create a second `JobListing` row
for it.

### Existing duplicates in the database

The fix stops new duplicates going forward, but doesn't retroactively
touch what's already there. Wrote a one-off cleanup script (not a
management command — one-time job, not a recurring need) that:

1. Groups existing `JobListing` rows using the same duplicate signal as
   `_find_duplicate()`.
2. For each group with more than one member, keeps the one with the
   **highest `match_score`** among any `Application`s already generated
   for it (not just the earliest-created one) — so a better-quality
   match doesn't get discarded in favor of an arbitrary pick.
3. Deletes the rest, which cascades to their `Application` rows too
   (confirmed and accepted before running — those cover letters are
   genuinely redundant, generated against the same real posting).

Ran a **dry run first** or exactly this reason — printed every group and
which one would be kept, before touching anything. Found 9 duplicate
groups across the whole database (including several `Amazon` postings
from much earlier Adzuna testing with zero `Application`s attached, and
groups from both real user accounts). Confirmed with you before executing. Result: 17 duplicate `JobListing`
rows removed across the whole database, 6 redundant `Application` rows
removed as an expected side effect. Verified after on
`bhandaribina4@gmail.com`'s account specifically — the First Nations
Trainee group (previously 3 near-identical rows, scores 15/25/30) and
Home Care Support Coordinator group (previously 3 rows, scores 25/35/38)
each correctly collapsed to a single entry, keeping the higher-scored
version (30 and 38 respectively) in both cases.

---

## Phase 5c — TopNav: welcome name + user menu

Two requested changes to `TopNav.jsx`: show the signed-in user's name
instead of their raw email, and move the Setup page (resume upload +
search profile) out of the permanent top-level nav and under a
hover-triggered menu on the user's name — standard "account menu" UX
instead of two equal-weight nav links plus a bare email string.

- The `LINKS` array (Tracker + Setup as equal top-level links) is gone.
  `Tracker` stays a direct link next to the branding; `Setup` moved into
  the dropdown.
- The right side is now a `group`/`group-hover` Tailwind hover card — no
  JS state needed. `Welcome, {user.name}` as the trigger; the dropdown
  (Setup link + Sign out button) is an absolutely-positioned child of
  the same `group` div, so hovering onto the dropdown itself keeps it
  open (no dead zone between trigger and menu).
- `user.name` was already returned by every auth endpoint (Google login,
  password login, and register all converge on the same
  `_token_response()` helper from the Phase 5 auth work) — no backend
  change needed, this was frontend-only.

**Browser-tested** against the already-running dev server (no processes
started or touched, learned from the earlier incident) with a disposable
test signup: header correctly read `"Welcome, Topnav Test User"`,
hovering revealed the dropdown, and clicking "Setup" inside it navigated
correctly to `/setup`. Cleaned up the test account after.

---

## Phase 5d — Manual "Search now" button

Proposed a 2-hour automatic search interval (down from 24h); pushed back
on that specific number first — Adzuna is already rate-limited (we've
hit real 503s) and every search that finds something new also spends
real Claude API money on matching + cover letters, so 2h is a 12x jump
in both API load and cost for freshness most job postings don't actually
need. Given the choice between 6h, 2h, or leaving it, the call was to
**keep the 24-hour automatic cycle unchanged** and rely on manual
triggering for anything more immediate — which is what this button is
for.

### Backend

`job_search/views.py` — `JobSearchProfileViewSet` gained
`@action(detail=True, methods=['post']) search_now`, dispatching the
same `search_jobs_for_profile_task.delay()` used by create/update,
returning `202 Accepted` immediately (the work happens in the
background — there's nothing meaningful to return synchronously).

### Frontend

`api.js` — `searchNow(id)`. `Dashboard.jsx` — a "Search now" button
under the profile meta line (only rendered once a profile exists),
disabled with "Starting search…" while the dispatch request is
in-flight, and a one-shot refresh of both the profile and the
applications list ~8 seconds after clicking — enough time for the
Adzuna/RemoteOK fetch itself to finish and update `last_searched_at`,
though matching against however many new listings turned up keeps
running in the background past that point (explicitly not trying to
track full completion — same reasoning as not fabricating a "next
search in Xh Ym" countdown earlier: show what's actually known, not an
approximation dressed up as precise).

### Testing — surfaced a real environment issue, not a code bug

Registered a disposable test account via the real API, created a
profile via a direct API call, then drove the actual button in a
browser against the already-running dev server. The click correctly
fired the request (no console errors, button correctly returned to its
enabled state) — but `last_searched_at` never updated, even after
waiting. Traced it to the actual cause: **no Celery worker was running
at all** at that point in the session (confirmed via `ps aux` — zero
matching processes) — 3 dispatched tasks (the profile-creation
auto-search, the button click, and one more) were sitting queued in
Redis with nothing to consume them. Not a bug in the new endpoint or
button — both dispatched correctly; there was simply nothing running to
process the result. Asked you to restart the worker rather than
starting one myself in the background, to avoid ending up with an
untracked worker process alongside whatever you start in your own
terminal.
