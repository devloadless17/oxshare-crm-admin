import { apiClient } from './client';
import { authApi } from './auth';
import { kycApi } from './kyc';
import { adminApi } from './admin';

export const api = Object.assign(apiClient, {
  auth: authApi,
  kyc: kycApi,
  admin: adminApi,
});

export default api;
