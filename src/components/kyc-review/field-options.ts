/**
 * The fields a reviewer can flag for re-submission, grouped as they appear in the
 * reject dialog. The ids are what `PATCH /admin/kyc/:id/reject` receives as
 * `rejectedFields`, and the client portal reads them back to highlight what needs
 * fixing — so they are a contract, not labels.
 */
export const FIELD_OPTIONS = [
  {
    group: 'Personal Information',
    fields: [
      { id: 'firstName', label: 'First Name' },
      { id: 'lastName', label: 'Last Name' },
      { id: 'dateOfBirth', label: 'Date of Birth' },
      { id: 'phone', label: 'Phone Number' },
      { id: 'nationality', label: 'Nationality' },
      { id: 'country', label: 'Country' },
      { id: 'address', label: 'Address' },
    ],
  },
  {
    group: 'Documents & Verification',
    fields: [
      { id: 'doc_front', label: 'ID / Passport Photo' },
      { id: 'doc_back', label: 'ID Back Side' },
      { id: 'selfie', label: 'Selfie Photo' },
      { id: 'address_proof', label: 'Proof of Address' },
    ],
  },
];
