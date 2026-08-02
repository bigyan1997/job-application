import requests

BASE_URL = 'https://remoteok.com/api'


def search_remoteok(target_role: str, keywords: list[str] | None = None) -> list[dict]:
    # RemoteOK's feed has no server-side search — fetch everything and
    # filter client-side against the job title and tags.
    response = requests.get(
        BASE_URL,
        headers={'User-Agent': 'job-apply-automation'},
        timeout=15,
    )
    response.raise_for_status()
    data = response.json()

    terms = [target_role.lower()] + [k.lower() for k in (keywords or [])]

    listings = []
    for job in data:
        if 'position' not in job:
            continue  # the first element of the feed is metadata, not a job
        position = job.get('position', '').lower()

        # Tags on this free feed are unreliable — many listings are stuffed
        # with dozens of generic/unrelated tags (spam or bad scraping on
        # RemoteOK's end), so a stray tag match isn't trustworthy signal
        # even with a short tag list. The job title is the only field
        # worth matching against.
        if not any(term in position for term in terms):
            continue
        listings.append({
            'title': job.get('position', ''),
            'company': job.get('company', ''),
            'location': job.get('location') or 'Remote',
            'description': job.get('description', ''),
            'url': job.get('url', ''),
            'source': 'remoteok',
            'posted_at': job.get('date'),
        })
    return listings
