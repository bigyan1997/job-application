from rest_framework import serializers

from .models import JobSearchProfile


class JobSearchProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobSearchProfile
        fields = [
            'id',
            'target_role',
            'location',
            'country',
            'keywords',
            'auto_apply_enabled',
            'search_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']
