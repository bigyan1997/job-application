import logging

from celery import shared_task
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime

logger = logging.getLogger(__name__)

from matching.tasks import score_and_generate_cover_letter
from resumes.models import Resume

from .models import JobListing, JobSearchProfile
from .services.adzuna import search_adzuna
from .services.remoteok import search_remoteok
from .utils import detect_ats_type


def _parse_date(value):
    if not value:
        return None
    try:
        return parse_datetime(value)
    except (TypeError, ValueError):
        return None


def _find_duplicate(item: dict):
    # Job aggregators (Adzuna especially) re-post the same real posting
    # under multiple URLs, sometimes with slightly different company-name
    # formatting ("ARRCS" vs "Arrcs" vs the full name). A bare URL match
    # misses those. Title+location together is a much stronger "same
    # posting" signal than title alone (two "Software Engineer" postings
    # in different cities are almost certainly different jobs); an exact
    # description match catches the rest, e.g. syndicated postings with a
    # differently-formatted title.
    query = Q(url=item['url'])
    title = (item.get('title') or '').strip()
    location = (item.get('location') or '').strip()
    description = (item.get('description') or '').strip()
    if title and location:
        query |= Q(title__iexact=title, location__iexact=location)
    if description:
        query |= Q(description=description)
    return JobListing.objects.filter(query).first()


def search_jobs_for_profile(profile: JobSearchProfile) -> int:
    listings = []
    listings += search_adzuna(profile.target_role, profile.location, profile.country)
    listings += search_remoteok(profile.target_role, profile.keywords)

    created_count = 0
    touched_listing_ids = []
    for item in listings:
        if not item.get('url'):
            continue

        existing = _find_duplicate(item)
        if existing:
            touched_listing_ids.append(existing.id)
            continue

        listing = JobListing.objects.create(
            title=item['title'],
            company=item['company'],
            location=item['location'],
            description=item['description'],
            url=item['url'],
            source=item['source'],
            ats_type=detect_ats_type(item['url']),
            posted_at=_parse_date(item.get('posted_at')),
        )
        created_count += 1
        touched_listing_ids.append(listing.id)

    # Every listing this search touched — new or already known from a
    # different user's search — needs to be matched against *this* user's
    # resume specifically. score_and_generate_cover_letter already no-ops
    # cheaply (a single existence check, no Claude calls) if this user has
    # already been matched against a given listing, so it's safe to queue
    # unconditionally rather than re-deriving which pairs are new here.
    resume = Resume.objects.filter(
        user=profile.user,
        status=Resume.Status.PARSED,
    ).order_by('-created_at').first()

    if resume:
        for listing_id in touched_listing_ids:
            score_and_generate_cover_letter.delay(resume.id, listing_id)

    # Stamped only once the search actually completes, so "last crawled"
    # reflects a real finished run — not attempted, not partial.
    profile.last_searched_at = timezone.now()
    profile.save(update_fields=['last_searched_at'])

    return created_count


@shared_task
def search_jobs():
    total_created = 0
    for profile in JobSearchProfile.objects.filter(search_active=True):
        # One profile's search hitting a flaky upstream API (Adzuna 503s,
        # etc.) shouldn't stop every other user's search from running.
        try:
            total_created += search_jobs_for_profile(profile)
        except Exception:
            logger.exception('search_jobs failed for profile %s', profile.id)
    return total_created


@shared_task
def search_jobs_for_profile_task(profile_id):
    profile = JobSearchProfile.objects.get(id=profile_id)
    return search_jobs_for_profile(profile)
