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
            'last_searched_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['last_searched_at', 'created_at', 'updated_at']
