const API_URL = import.meta.env.VITE_API_URL

let authToken = localStorage.getItem('auth_token') || ''

export function setAuthToken(token) {
  authToken = token || ''
  if (token) {
    localStorage.setItem('auth_token', token)
  } else {
    localStorage.removeItem('auth_token')
  }
}

export function getAuthToken() {
  return authToken
}

export function googleLogin(credential) {
  return request('/auth/google/', {
    method: 'POST',
    body: JSON.stringify({ credential }),
    skipAuth: true,
  })
}

export function signInWithPassword(email, password) {
  return request('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  })
}

export function signUpWithPassword(email, password, name) {
  return request('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
    skipAuth: true,
  })
}

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.skipAuth ? {} : { Authorization: `Token ${authToken}` }),
      // Don't set Content-Type for FormData — the browser needs to add
      // its own multipart boundary, which a manual header would clobber.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail || `${options.method || 'GET'} ${path} failed: ${response.status}`)
  }
  return response.status === 204 ? null : response.json()
}

export function listApplications({ status, ordering, minScore, atsType } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (ordering) params.set('ordering', ordering)
  if (minScore) params.set('min_score', minScore)
  if (atsType) params.set('ats_type', atsType)
  const query = params.toString()
  return request(`/applications/${query ? `?${query}` : ''}`)
}

export function updateApplication(id, fields) {
  return request(`/applications/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })
}

export function regenerateCoverLetter(id, instructions) {
  return request(`/applications/${id}/regenerate_cover_letter/`, {
    method: 'POST',
    body: JSON.stringify({ instructions }),
  })
}

export function listResumes() {
  return request('/resumes/')
}

export function uploadResume(file) {
  const formData = new FormData()
  formData.append('file', file)
  return request('/resumes/', { method: 'POST', body: formData })
}

export function getResume(id) {
  return request(`/resumes/${id}/`)
}

export function listJobSearchProfiles() {
  return request('/job-search-profiles/')
}

export function createJobSearchProfile(fields) {
  return request('/job-search-profiles/', {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

export function updateJobSearchProfile(id, fields) {
  return request(`/job-search-profiles/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })
}

export function searchNow(id) {
  return request(`/job-search-profiles/${id}/search_now/`, { method: 'POST' })
}
