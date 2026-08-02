from rest_framework import permissions, viewsets

from .models import Application
from .serializers import ApplicationSerializer


class ApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = ApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]
    # Applications are created by the matching task, not directly by users —
    # no 'post'/'delete' here, only reading and status/cover-letter edits.
    http_method_names = ['get', 'patch', 'head']

    def get_queryset(self):
        queryset = Application.objects.filter(
            user=self.request.user,
        ).select_related('job_listing').order_by('-created_at')

        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)

        return queryset
