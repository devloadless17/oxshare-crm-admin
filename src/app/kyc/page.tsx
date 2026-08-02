'use client';

import * as React from 'react';
import {
  FileCheck,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Type,
  List,
  Calendar,
  CheckSquare,
  UploadCloud,
  MoveUp,
  MoveDown,
  Loader2,
} from 'lucide-react';

interface KycField {
  id: string;
  fieldName: string;
  label: string;
  fieldType: 'text' | 'number' | 'select' | 'file' | 'date' | 'checkbox';
  options?: string[];
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
}

export default function AdminKycPage() {
  const [activeTab, setActiveTab] = React.useState<'fields' | 'submissions'>('fields');
  const [fields, setFields] = React.useState<KycField[]>([
    {
      id: '1',
      fieldName: 'id_document',
      label: 'Government Photo ID (Passport / National ID)',
      fieldType: 'file',
      isRequired: true,
      isActive: true,
      sortOrder: 1,
    },
    {
      id: '2',
      fieldName: 'proof_of_address',
      label: 'Proof of Address (Utility Bill / Bank Statement)',
      fieldType: 'file',
      isRequired: true,
      isActive: true,
      sortOrder: 2,
    },
    {
      id: '3',
      fieldName: 'tax_id',
      label: 'Tax Identification Number (TIN / SSN)',
      fieldType: 'text',
      isRequired: false,
      isActive: true,
      sortOrder: 3,
    },
    {
      id: '4',
      fieldName: 'country_residence',
      label: 'Country of Residence',
      fieldType: 'select',
      options: ['United Arab Emirates', 'Saudi Arabia', 'Kuwait', 'Qatar', 'United Kingdom'],
      isRequired: true,
      isActive: true,
      sortOrder: 4,
    },
  ]);

  const [showAddFieldModal, setShowAddFieldModal] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState('');
  const [newFieldName, setNewFieldName] = React.useState('');
  const [newFieldType, setNewFieldType] = React.useState<'text' | 'number' | 'select' | 'file' | 'date' | 'checkbox'>('text');
  const [newOptions, setNewOptions] = React.useState('');
  const [newIsRequired, setNewIsRequired] = React.useState(true);

  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel || !newFieldName) return;

    const newField: KycField = {
      id: Date.now().toString(),
      fieldName: newFieldName.toLowerCase().replace(/\s+/g, '_'),
      label: newLabel,
      fieldType: newFieldType,
      options: newFieldType === 'select' ? newOptions.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      isRequired: newIsRequired,
      isActive: true,
      sortOrder: fields.length + 1,
    };

    setFields([...fields, newField]);
    setShowAddFieldModal(false);
    setNewLabel('');
    setNewFieldName('');
    setNewOptions('');
  };

  const toggleFieldStatus = (id: string) => {
    setFields(
      fields.map((f) => (f.id === id ? { ...f, isActive: !f.isActive } : f)),
    );
  };

  const deleteField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">KYC Verification Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dynamic KYC field builder & client verification queue
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('fields')}
            className={`h-9 px-4 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'fields'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'border border-input bg-card text-foreground hover:bg-muted'
            }`}
          >
            Form Field Builder
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('submissions')}
            className={`h-9 px-4 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'submissions'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'border border-input bg-card text-foreground hover:bg-muted'
            }`}
          >
            Verification Queue (3)
          </button>
        </div>
      </div>

      {activeTab === 'fields' ? (
        <div className="space-y-6">
          {/* Dynamic Field Builder Header */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-5 shadow-xs">
            <div>
              <h2 className="text-base font-semibold">Active Dynamic Fields</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fields created here render dynamically on the Client Portal KYC form.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddFieldModal(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Dynamic Field
            </button>
          </div>

          {/* Fields Table */}
          <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Order</th>
                  <th className="px-6 py-3">Field Label</th>
                  <th className="px-6 py-3">Variable Name</th>
                  <th className="px-6 py-3">Input Type</th>
                  <th className="px-6 py-3">Required</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fields.map((field, idx) => (
                  <tr key={field.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium">{idx + 1}</td>
                    <td className="px-6 py-4 font-semibold text-foreground">{field.label}</td>
                    <td className="px-6 py-4 font-mono text-blue-500">{field.fieldName}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        {field.fieldType === 'file' && <UploadCloud className="h-3.5 w-3.5" />}
                        {field.fieldType === 'text' && <Type className="h-3.5 w-3.5" />}
                        {field.fieldType === 'select' && <List className="h-3.5 w-3.5" />}
                        <span className="uppercase">{field.fieldType}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {field.isRequired ? (
                        <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-500">Required</span>
                      ) : (
                        <span className="rounded-md bg-slate-500/10 px-2 py-0.5 text-[11px] font-medium text-slate-400">Optional</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => toggleFieldStatus(field.id)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                          field.isActive
                            ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                            : 'bg-slate-500/10 text-slate-400 hover:bg-slate-500/20'
                        }`}
                      >
                        {field.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => deleteField(field.id)}
                        className="rounded-md p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                        title="Delete Field"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Submissions Queue */
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-xs">
          <FileCheck className="mx-auto h-12 w-12 text-blue-500" />
          <h3 className="mt-4 text-sm font-semibold">Verification Review Queue</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            Client document submissions and field values stream here for instant Admin approval or rejection.
          </p>
        </div>
      )}

      {/* Add Field Modal */}
      {showAddFieldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold">Add Dynamic KYC Field</h3>
            <form onSubmit={handleAddField} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold">Field Label (User Facing)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Proof of Wealth (Bank Statement)"
                  value={newLabel}
                  onChange={(e) => {
                    setNewLabel(e.target.value);
                    setNewFieldName(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_'));
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
                />
              </div>

              <div>
                <label className="font-semibold">Variable Name (Schema Key)</label>
                <input
                  type="text"
                  required
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold">Field Type</label>
                <select
                  value={newFieldType}
                  onChange={(e: any) => setNewFieldType(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
                >
                  <option value="file">File Upload (.pdf, .jpg, .png)</option>
                  <option value="text">Text Input</option>
                  <option value="select">Dropdown Select</option>
                  <option value="number">Number</option>
                  <option value="date">Date Picker</option>
                  <option value="checkbox">Checkbox Confirmation</option>
                </select>
              </div>

              {newFieldType === 'select' && (
                <div>
                  <label className="font-semibold">Dropdown Options (Comma Separated)</label>
                  <input
                    type="text"
                    placeholder="Option 1, Option 2, Option 3"
                    value={newOptions}
                    onChange={(e) => setNewOptions(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="req"
                  checked={newIsRequired}
                  onChange={(e) => setNewIsRequired(e.target.checked)}
                />
                <label htmlFor="req" className="font-semibold cursor-pointer">Mark as Required Field</label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddFieldModal(false)}
                  className="h-9 px-4 rounded-lg border border-input bg-card font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500"
                >
                  Save Field
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
