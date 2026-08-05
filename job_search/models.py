from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models


class JobSearchProfile(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='job_search_profiles',
    )
    target_role = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=2, default='AU')
    keywords = ArrayField(models.CharField(max_length=100), default=list, blank=True)
    auto_apply_enabled = models.BooleanField(default=False)
    search_active = models.BooleanField(default=True)
    last_searched_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.target_role} ({self.user})'


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
    ats_type = models.CharField(
        max_length=10,
        choices=AtsType.choices,
        default=AtsType.OTHER,
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.title} @ {self.company}'
