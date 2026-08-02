from rest_framework import serializers

from .models import Resume


class ResumeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resume
        fields = [
            'id',
            'file',
            'original_filename',
            'status',
            'parsed_data',
            'error_message',
            'created_at',
        ]
        read_only_fields = [
            'original_filename',
            'status',
            'parsed_data',
            'error_message',
            'created_at',
        ]
