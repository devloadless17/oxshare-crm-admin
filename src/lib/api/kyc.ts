import { apiClient } from './client';

export interface KycField {
  id: string;
  fieldName: string;
  label: string;
  fieldType: 'text' | 'number' | 'select' | 'file' | 'date' | 'checkbox';
  options?: string[];
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
}

export const kycApi = {
  async getFields(): Promise<KycField[]> {
    const { data } = await apiClient.get<KycField[]>('/compliance/fields');
    return data;
  },

  async createField(dto: Partial<KycField>): Promise<KycField> {
    const { data } = await apiClient.post<KycField>('/compliance/fields', dto);
    return data;
  },

  async updateField(id: string, dto: Partial<KycField>): Promise<KycField> {
    const { data } = await apiClient.put<KycField>(`/compliance/fields/${id}`, dto);
    return data;
  },

  async deleteField(id: string) {
    const { data } = await apiClient.delete(`/compliance/fields/${id}`);
    return data;
  },

  async getAllSubmissions() {
    const { data } = await apiClient.get('/compliance/submissions');
    return data;
  },

  async reviewSubmission(id: string, status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED', rejectionReason?: string) {
    const { data } = await apiClient.put(`/compliance/submissions/${id}/review`, { status, rejectionReason });
    return data;
  },
};
