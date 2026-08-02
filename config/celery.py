import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('config')

# Read CELERY_* settings from Django's settings.py (the CELERY_ prefix is
# stripped automatically), instead of duplicating config in two places.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks.py in every installed app, so each app's Celery
# tasks (e.g. resumes/tasks.py) are found without manual registration.
app.autodiscover_tasks()
