from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import JobSearchProfile
from .serializers import JobSearchProfileSerializer
from .tasks import search_jobs_for_profile_task


class JobSearchProfileViewSet(viewsets.ModelViewSet):
    serializer_class = JobSearchProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'head']

    def get_queryset(self):
        return JobSearchProfile.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        profile = serializer.save(user=self.request.user)
        search_jobs_for_profile_task.delay(profile.id)

    def perform_update(self, serializer):
        profile = serializer.save()
        search_jobs_for_profile_task.delay(profile.id)

    @action(detail=True, methods=['post'])
    def search_now(self, request, pk=None):
        profile = self.get_object()
        search_jobs_for_profile_task.delay(profile.id)
        return Response({'detail': 'search started'}, status=status.HTTP_202_ACCEPTED)
