from celery import shared_task
from django.utils.dateparse import parse_datetime

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


def search_jobs_for_profile(profile: JobSearchProfile) -> int:
    listings = []
    listings += search_adzuna(profile.target_role, profile.location, profile.country)
    listings += search_remoteok(profile.target_role, profile.keywords)

    created_count = 0
    for item in listings:
        if not item.get('url'):
            continue
        _, created = JobListing.objects.get_or_create(
            url=item['url'],
            defaults={
                'title': item['title'],
                'company': item['company'],
                'location': item['location'],
                'description': item['description'],
                'source': item['source'],
                'ats_type': detect_ats_type(item['url']),
                'posted_at': _parse_date(item.get('posted_at')),
            },
        )
        if created:
            created_count += 1
    return created_count


@shared_task
def search_jobs():
    total_created = 0
    for profile in JobSearchProfile.objects.filter(search_active=True):
        total_created += search_jobs_for_profile(profile)
    return total_created
