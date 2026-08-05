const API_URL = import.meta.env.VITE_API_URL
const API_TOKEN = import.meta.env.VITE_API_TOKEN

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Token ${API_TOKEN}`,
      // Don't set Content-Type for FormData — the browser needs to add
      // its own multipart boundary, which a manual header would clobber.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status}`)
  }
  return response.status === 204 ? null : response.json()
}

export function listApplications(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return request(`/applications/${query}`)
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
