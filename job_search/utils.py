def detect_ats_type(url: str) -> str:
    lowered = url.lower()
    if 'greenhouse.io' in lowered:
        return 'greenhouse'
    if 'lever.co' in lowered:
        return 'lever'
    return 'other'
