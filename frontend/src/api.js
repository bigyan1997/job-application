const API_URL = import.meta.env.VITE_API_URL
const API_TOKEN = import.meta.env.VITE_API_TOKEN

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Token ${API_TOKEN}`,
      'Content-Type': 'application/json',
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
