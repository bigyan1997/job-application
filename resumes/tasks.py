from celery import shared_task

from .models import Resume
from .services.claude_parser import parse_resume_file


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
