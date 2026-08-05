from rest_framework import permissions, viewsets

from .models import Resume
from .serializers import ResumeSerializer
from .tasks import parse_resume


class ResumeViewSet(viewsets.ModelViewSet):
    serializer_class = ResumeSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'head']

    def get_queryset(self):
        return Resume.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        resume = serializer.save(
            user=self.request.user,
            original_filename=self.request.FILES['file'].name,
        )
        parse_resume.delay(resume.id)
