from celery import shared_task

from applications.models import Application
from job_search.models import JobListing
from resumes.models import Resume

from .services.claude_matcher import generate_cover_letter, score_match


@shared_task
def score_and_generate_cover_letter(resume_id, job_listing_id):
    resume = Resume.objects.get(id=resume_id)
    job_listing = JobListing.objects.get(id=job_listing_id)

    if Application.objects.filter(user=resume.user, job_listing=job_listing).exists():
        return None

    match_result = score_match(resume.parsed_data, job_listing.description)
    cover_letter = generate_cover_letter(
        resume.parsed_data,
        job_listing.description,
        job_listing.company,
    )

    application = Application.objects.create(
        user=resume.user,
        job_listing=job_listing,
        resume=resume,
        match_score=match_result['score'],
        match_rationale=match_result['rationale'],
        cover_letter=cover_letter,
    )
    return application.id
