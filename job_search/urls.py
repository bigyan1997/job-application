from rest_framework.routers import DefaultRouter

from .views import JobSearchProfileViewSet

router = DefaultRouter()
router.register('job-search-profiles', JobSearchProfileViewSet, basename='job-search-profile')

urlpatterns = router.urls
