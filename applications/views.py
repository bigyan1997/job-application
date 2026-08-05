from rest_framework import filters, mixins, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from matching.services.claude_matcher import regenerate_cover_letter as regenerate_cover_letter_text

from .models import Application
from .serializers import ApplicationSerializer


class ApplicationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    # Applications are created by the matching task, not directly by users —
    # composed from mixins (no CreateModelMixin/DestroyModelMixin) rather
    # than ModelViewSet, so there's no way to POST/DELETE one via the API
    # regardless of http_method_names.
    serializer_class = ApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'patch', 'post', 'head']
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['match_score', 'created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = Application.objects.filter(
            user=self.request.user,
        ).select_related('job_listing', 'resume')

        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)

        min_score = self.request.query_params.get('min_score')
        if min_score:
            queryset = queryset.filter(match_score__gte=min_score)

        ats_type = self.request.query_params.get('ats_type')
        if ats_type:
            queryset = queryset.filter(job_listing__ats_type=ats_type)

        return queryset

    @action(detail=True, methods=['post'])
    def regenerate_cover_letter(self, request, pk=None):
        application = self.get_object()
        instructions = (request.data.get('instructions') or '').strip()
        if not instructions:
            return Response({'detail': 'instructions is required'}, status=400)

        application.cover_letter = regenerate_cover_letter_text(
            application.resume.parsed_data,
            application.job_listing.description,
            application.job_listing.company,
            application.cover_letter,
            instructions,
        )
        application.save(update_fields=['cover_letter', 'updated_at'])
        return Response(self.get_serializer(application).data)
