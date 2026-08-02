from rest_framework import serializers

from .models import Application


class ApplicationSerializer(serializers.ModelSerializer):
    job_title = serializers.CharField(source='job_listing.title', read_only=True)
    company = serializers.CharField(source='job_listing.company', read_only=True)
    job_url = serializers.URLField(source='job_listing.url', read_only=True)
    ats_type = serializers.CharField(source='job_listing.ats_type', read_only=True)

    class Meta:
        model = Application
        fields = [
            'id',
            'job_title',
            'company',
            'job_url',
            'ats_type',
            'match_score',
            'match_rationale',
            'cover_letter',
            'status',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'job_title',
            'company',
            'job_url',
            'ats_type',
            'match_score',
            'match_rationale',
            'created_at',
            'updated_at',
        ]
