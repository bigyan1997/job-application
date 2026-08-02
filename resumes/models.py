from django.conf import settings
from django.db import models


class Resume(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PARSED = 'parsed', 'Parsed'
        FAILED = 'failed', 'Failed'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='resumes',
    )
    file = models.FileField(upload_to='resumes/')
    original_filename = models.CharField(max_length=255)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )
    parsed_data = models.JSONField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.original_filename} ({self.user})'
