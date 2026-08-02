from django.contrib import admin

from .models import JobListing, JobSearchProfile


@admin.register(JobSearchProfile)
class JobSearchProfileAdmin(admin.ModelAdmin):
    list_display = ['target_role', 'user', 'country', 'search_active', 'auto_apply_enabled']
    list_filter = ['search_active', 'auto_apply_enabled', 'country']


@admin.register(JobListing)
class JobListingAdmin(admin.ModelAdmin):
    list_display = ['title', 'company', 'source', 'ats_type', 'created_at']
    list_filter = ['source', 'ats_type']
    search_fields = ['title', 'company']
