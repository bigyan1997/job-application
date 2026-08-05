from django.urls import path

from .views import google_login, login_view, register

urlpatterns = [
    path('auth/google/', google_login),
    path('auth/register/', register),
    path('auth/login/', login_view),
]
