import { authApi } from './auth';
import { kycApi } from './kyc';

export const api = {
  auth: authApi,
  kyc: kycApi,
};

export default api;
