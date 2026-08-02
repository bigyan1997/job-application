import base64
import json

from core.claude_client import create_message

PROMPT = (
    'Extract this resume into structured data: the skills mentioned, '
    'past job titles held, total years of professional experience '
    '(as a number), and key achievements.'
)

RESUME_SCHEMA = {
    'type': 'object',
    'properties': {
        'skills': {'type': 'array', 'items': {'type': 'string'}},
        'titles': {'type': 'array', 'items': {'type': 'string'}},
        'years_experience': {'type': 'number'},
        'achievements': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['skills', 'titles', 'years_experience', 'achievements'],
    'additionalProperties': False,
}


def _is_pdf(filename: str) -> bool:
    return filename.lower().endswith('.pdf')


def parse_resume_file(file_bytes: bytes, filename: str) -> dict:
    if _is_pdf(filename):
        content = [
            {
                'type': 'document',
                'source': {
                    'type': 'base64',
                    'media_type': 'application/pdf',
                    'data': base64.standard_b64encode(file_bytes).decode('utf-8'),
                },
            },
            {'type': 'text', 'text': PROMPT},
        ]
    else:
        resume_text = file_bytes.decode('utf-8', errors='ignore')
        content = [
            {'type': 'text', 'text': f'{PROMPT}\n\nResume text:\n{resume_text}'},
        ]

    response = create_message(
        messages=[{'role': 'user', 'content': content}],
        output_config={'format': {'type': 'json_schema', 'schema': RESUME_SCHEMA}},
    )

    text = next(block.text for block in response.content if block.type == 'text')
    return json.loads(text)
