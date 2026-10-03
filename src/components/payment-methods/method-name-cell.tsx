import { assetUrl } from '@/lib/asset-url';
import { ArabicSubline } from '@/components/arabic-text-field';
import { t } from '@/lib/i18n';

/**
 * How a payment or withdrawal method is named in the console's lists.
 *
 * The INTERNAL name leads: it is what the desk calls the method and what every
 * transaction, approval and export shows (backend 0161). What the client sees is
 * written beneath it only when it differs, so the common case reads as one name.
 * The method's key is never shown — it is a permanent ID, not a name.
 *
 * `nameAr`, when the caller passes it, adds the client-facing Arabic name (or a
 * "No Arabic" marker) so the catalogue shows which methods still need one.
 */
export function MethodNameCell({
  internalLabel,
  name,
  logoUrl,
  nameAr,
}: {
  internalLabel: string;
  name: string;
  logoUrl: string | null;
  nameAr?: string | null;
}) {
  const logo = assetUrl(logoUrl);
  return (
    <div className="flex items-center gap-2">
      {/*
        Through `assetUrl`, NEVER the stored value raw: the API returns
        `/v1/uploads/…`, which the browser would resolve against THIS app's
        origin. Fixed height, auto width — a payment mark is usually a wordmark,
        and a square box shrinks it to an unreadable sliver.
      */}
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          aria-hidden="true"
          className="h-5 w-auto max-w-20 shrink-0 rounded object-contain"
        />
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold">{internalLabel}</p>
        {name.trim() !== internalLabel.trim() && (
          <p className="truncate text-[11px] text-muted-foreground">
            {t('paymentMethods.clientSees', { name })}
          </p>
        )}
        {nameAr !== undefined && <ArabicSubline value={nameAr} className="truncate" />}
      </div>
    </div>
  );
}
