from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from job_search.models import JobListing
from resumes.models import Resume


class Application(models.Model):
    class Status(models.TextChoices):
        COVER_LETTER_READY = 'cover_letter_ready', 'Cover letter ready'
        MANUAL_PENDING = 'manual_pending', 'Manual pending'
        AUTO_APPLIED = 'auto_applied', 'Auto applied'
        APPLIED = 'applied', 'Applied'
        INTERVIEW = 'interview', 'Interview'
        REJECTED = 'rejected', 'Rejected'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='applications',
    )
    job_listing = models.ForeignKey(
        JobListing,
        on_delete=models.CASCADE,
        related_name='applications',
    )
    resume = models.ForeignKey(
        Resume,
        on_delete=models.CASCADE,
        related_name='applications',
    )
    match_score = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    match_rationale = models.TextField()
    cover_letter = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.COVER_LETTER_READY,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['user', 'job_listing']

    def __str__(self):
        return f'{self.job_listing.title} ({self.user}) — {self.status}'
