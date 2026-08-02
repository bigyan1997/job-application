import requests
from django.conf import settings

BASE_URL = 'https://api.adzuna.com/v1/api/jobs/{country}/search/1'


def search_adzuna(target_role: str, location: str = '', country: str = 'AU') -> list[dict]:
    params = {
        'app_id': settings.ADZUNA_APP_ID,
        'app_key': settings.ADZUNA_APP_KEY,
        'what': target_role,
        'where': location,
        'content-type': 'application/json',
        'results_per_page': 20,
    }
    response = requests.get(
        BASE_URL.format(country=country.lower()),
        params=params,
        timeout=15,
    )
    response.raise_for_status()
    data = response.json()

    return [
        {
            'title': job['title'],
            'company': job.get('company', {}).get('display_name', ''),
            'location': job.get('location', {}).get('display_name', ''),
            'description': job.get('description', ''),
            'url': job['redirect_url'],
            'source': 'adzuna',
            'posted_at': job.get('created'),
        }
        for job in data.get('results', [])
    ]
