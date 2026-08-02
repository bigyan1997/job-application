import json

from core.claude_client import create_message

SCORE_SCHEMA = {
    'type': 'object',
    'properties': {
        'score': {'type': 'integer'},
        'rationale': {'type': 'string'},
    },
    'required': ['score', 'rationale'],
    'additionalProperties': False,
}


def score_match(resume_data: dict, job_description: str) -> dict:
    prompt = (
        'Score how well this candidate matches this job on a scale of '
        '0-100, where 100 is a perfect match. Base the score on overlap '
        "between the candidate's skills/experience and the job's stated "
        'requirements. Give a brief 2-3 sentence rationale explaining the '
        'score.\n\n'
        f'Candidate profile (JSON):\n{json.dumps(resume_data)}\n\n'
        f'Job description:\n{job_description}'
    )
    response = create_message(
        messages=[{'role': 'user', 'content': prompt}],
        output_config={'format': {'type': 'json_schema', 'schema': SCORE_SCHEMA}},
    )
    text = next(block.text for block in response.content if block.type == 'text')
    result = json.loads(text)
    result['score'] = max(0, min(100, result['score']))
    return result


def generate_cover_letter(resume_data: dict, job_description: str, company_name: str) -> str:
    prompt = (
        'Write a tailored, ready-to-send cover letter for this candidate '
        f'applying to a role at {company_name}. Base it on their actual '
        'skills and achievements below — do not invent experience they '
        "don't have. Keep it professional, concise (under 350 words), and "
        'free of placeholder brackets like [Company Name] — fill in every '
        'detail you have. Do not include a letterhead/address block, just '
        'the letter body starting with a greeting.\n\n'
        f'Candidate profile (JSON):\n{json.dumps(resume_data)}\n\n'
        f'Job description:\n{job_description}'
    )
    response = create_message(
        messages=[{'role': 'user', 'content': prompt}],
        max_tokens=1024,
    )
    return next(block.text for block in response.content if block.type == 'text')
