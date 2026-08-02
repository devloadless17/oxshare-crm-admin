import { apiClient } from './client';
import { authApi } from './auth';
import { adminApi } from './admin';

export const api = Object.assign(apiClient, {
  auth: authApi,
  admin: adminApi,
});

export default api;
