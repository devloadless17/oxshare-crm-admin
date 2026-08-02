/**
 * Builds the browser URL for a stored KYC document path.
 *
 * The backend stores paths in several shapes ("uploads/kyc/<file>" from multer,
 * "./uploads/kyc/<file>" from its recovery path, Windows backslashes possible)
 * and serves them at GET /uploads/... — reached through the frontend's /api
 * proxy, which strips the /api prefix. A naive re-prefix produced
 * /api/uploads/kyc/kyc/<file> and broke every document; keep this logic here,
 * covered by unit tests.
 */
export function buildKycDocUrl(filePath?: string): string {
  if (!filePath) return '';
  const rel = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  return rel.startsWith('uploads/') ? `/api/${rel}` : `/api/uploads/kyc/${rel}`;
}
