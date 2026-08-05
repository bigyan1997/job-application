from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


def _token_response(user):
    token, _ = Token.objects.get_or_create(user=user)
    return Response({
        'token': token.key,
        'email': user.email,
        'name': f'{user.first_name} {user.last_name}'.strip() or user.email,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def google_login(request):
    credential = request.data.get('credential')
    if not credential:
        return Response({'detail': 'credential is required'}, status=400)

    try:
        payload = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError:
        return Response({'detail': 'invalid Google credential'}, status=401)

    email = payload.get('email')
    if not email:
        return Response({'detail': 'Google account has no email'}, status=400)

    user, created = User.objects.get_or_create(
        username=email,
        defaults={
            'email': email,
            'first_name': payload.get('given_name', ''),
            'last_name': payload.get('family_name', ''),
        },
    )
    if created:
        # No password sign-in for accounts that started as Google accounts,
        # unless they explicitly register one later with the same email.
        user.set_unusable_password()
        user.save(update_fields=['password'])

    return _token_response(user)


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password') or ''
    name = (request.data.get('name') or '').strip()

    if not email or not password:
        return Response({'detail': 'email and password are required'}, status=400)

    if User.objects.filter(username=email).exists():
        return Response({'detail': 'an account with this email already exists'}, status=400)

    try:
        validate_password(password)
    except DjangoValidationError as exc:
        return Response({'detail': ' '.join(exc.messages)}, status=400)

    first_name, _, last_name = name.partition(' ')
    user = User.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
    )
    return _token_response(user)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password') or ''

    user = authenticate(request, username=email, password=password)
    if user is None:
        return Response({'detail': 'invalid email or password'}, status=401)

    return _token_response(user)
