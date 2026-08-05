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


def _contact_instruction(resume_data: dict) -> str:
    name = (resume_data.get('name') or '').strip()
    email = (resume_data.get('email') or '').strip()
    phone = (resume_data.get('phone') or '').strip()
    parts = [f'name: {name}' if name else None, f'email: {email}' if email else None, f'phone: {phone}' if phone else None]
    parts = [p for p in parts if p]

    if not parts:
        return (
            'The candidate profile has no name, email, or phone number on '
            'file — sign off with "Sincerely," and nothing after it; do '
            'not invent a name or use a placeholder like [Candidate Name].'
        )
    return (
        'End the letter with "Sincerely," followed by the candidate\'s '
        f'real contact details ({", ".join(parts)}) — use these exact '
        'values verbatim, formatted naturally for a sign-off (e.g. name '
        'on its own line, then email and phone). Never use a placeholder '
        'like [Candidate Name], [Email], or [Phone Number], and never '
        'invent a value that was not provided above.'
    )


def generate_cover_letter(resume_data: dict, job_description: str, company_name: str) -> str:
    prompt = (
        'Write a tailored, ready-to-send cover letter for this candidate '
        f'applying to a role at {company_name}. Base it on their actual '
        'skills and achievements below — do not invent experience they '
        "don't have. Keep it professional, concise (under 350 words), and "
        'free of placeholder brackets like [Company Name] — fill in every '
        'detail you have. Do not include a letterhead/address block, just '
        f'the letter body starting with a greeting. {_contact_instruction(resume_data)}\n\n'
        f'Candidate profile (JSON):\n{json.dumps(resume_data)}\n\n'
        f'Job description:\n{job_description}'
    )
    response = create_message(
        messages=[{'role': 'user', 'content': prompt}],
        max_tokens=1024,
    )
    return next(block.text for block in response.content if block.type == 'text')


def regenerate_cover_letter(
    resume_data: dict,
    job_description: str,
    company_name: str,
    existing_letter: str,
    instructions: str,
) -> str:
    prompt = (
        'Revise the cover letter below for this candidate\'s application '
        f'to a role at {company_name}, following their instructions for '
        'this revision. Stay grounded in their actual background from the '
        "profile JSON — don't invent experience they don't have. Keep it "
        f'professional, under 350 words, free of placeholder brackets. {_contact_instruction(resume_data)}\n\n'
        f'Candidate profile (JSON):\n{json.dumps(resume_data)}\n\n'
        f'Job description:\n{job_description}\n\n'
        f'Current cover letter:\n{existing_letter}\n\n'
        f"Candidate's instructions for this revision:\n{instructions}"
    )
    response = create_message(
        messages=[{'role': 'user', 'content': prompt}],
        max_tokens=1024,
    )
    return next(block.text for block in response.content if block.type == 'text')
