/**
 * Builds the browser URL for a stored KYC document path.
 *
 * The backend stores paths in several shapes ("uploads/kyc/<file>" from multer,
 * "./uploads/kyc/<file>" from its recovery path, Windows backslashes possible)
 * and serves them at GET /uploads/... on the API's own origin, which the browser
 * now requests DIRECTLY: a KYC document is an authenticated read and the session
 * cookie belongs to that host, so routing it through this app's origin would
 * arrive with no cookie and be refused. A naive re-prefix produced
 * /uploads/kyc/kyc/<file> and broke every document; keep this logic here,
 * covered by unit tests.
 */
import { API_BASE_URL } from './env';

export function buildKycDocUrl(filePath?: string): string {
  if (!filePath) return '';
  const rel = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  return rel.startsWith('uploads/')
    ? `${API_BASE_URL}/${rel}`
    : `${API_BASE_URL}/uploads/kyc/${rel}`;
}
