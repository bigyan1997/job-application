from rest_framework import permissions, viewsets

from .models import JobSearchProfile
from .serializers import JobSearchProfileSerializer


class JobSearchProfileViewSet(viewsets.ModelViewSet):
    serializer_class = JobSearchProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'head']

    def get_queryset(self):
        return JobSearchProfile.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
