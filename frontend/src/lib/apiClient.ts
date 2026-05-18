import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let isRefreshing = false

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const store = useAuthStore.getState()

    if (error.response?.status === 401 && !original._retry && !isRefreshing && store.refreshToken) {
      original._retry = true
      isRefreshing = true
      try {
        const { data } = await axios.post('/api/v1/auth/refresh', {
          refresh_token: store.refreshToken,
        })
        store.setTokens(data.access_token, data.refresh_token)
        original.headers.Authorization = `Bearer ${data.access_token}`
        return apiClient(original)
      } catch {
        store.logout()
        window.location.href = '/login'
      } finally {
        isRefreshing = false
      }
    }

    if (error.response?.status === 401) {
      store.logout()
      window.location.href = '/login'
    }

    return Promise.reject(error)
  },
)

export default apiClient
