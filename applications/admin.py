from django.contrib import admin

from .models import Application


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ['job_listing', 'user', 'match_score', 'status', 'created_at']
    list_filter = ['status']
    search_fields = ['job_listing__title', 'job_listing__company']
