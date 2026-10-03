'use client';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

/**
 * The Arabic twin of an operator-authored text field.
 *
 * The English stays the canonical value; the Arabic is optional and the portal
 * falls back to the English wherever it is blank (`localized(en, ar)` on the
 * client side). So this field is never `required`, and a cleared box is sent as
 * `null` — see `arabicOrNull` — which is what makes clearing a translation work:
 * an omitted key on an update means "keep what is stored".
 *
 * `dir="rtl"` + `lang="ar"` so the caret, the alignment and the screen reader's
 * voice are right for Arabic while the rest of the console stays English.
 * `className` is the INPUT's class: each form has its own input look, and this
 * field must match the English one it sits under. Without one, a single-line
 * field is the shared `ui/input` (the forms built on it), a textarea gets
 * `TEXTAREA_CLASS`.
 */
export function ArabicTextField({
  id,
  label,
  value,
  onChange,
  maxLength,
  multiline = false,
  rows = 2,
  disabled,
  placeholder,
  className,
  wrapperClassName,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  wrapperClassName?: string;
}) {
  const hintId = `${id}-hint`;
  const shared = {
    id,
    value,
    disabled,
    maxLength,
    placeholder,
    dir: 'rtl' as const,
    lang: 'ar',
    'aria-describedby': hintId,
  };

  return (
    <div className={cn('space-y-1.5', wrapperClassName)}>
      <Label htmlFor={id} className="block">
        {label}
      </Label>
      {multiline ? (
        <textarea
          {...shared}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
          className={cn(className ?? TEXTAREA_CLASS, 'text-right')}
        />
      ) : className === undefined ? (
        <Input
          {...shared}
          type="text"
          onChange={(event) => onChange(event.target.value)}
          className="text-right text-xs"
        />
      ) : (
        <input
          {...shared}
          type="text"
          onChange={(event) => onChange(event.target.value)}
          className={cn(className, 'text-right')}
        />
      )}
      <p id={hintId} className="text-[11px] text-muted-foreground">
        {t('arabic.fieldHint')}
      </p>
    </div>
  );
}

const TEXTAREA_CLASS =
  'focus-outline w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-xs leading-relaxed disabled:opacity-50';

/** What an Arabic box sends: the trimmed text, or `null` so a cleared box clears. */
export function arabicOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The Arabic under an English name in a catalogue table, or a quiet "No Arabic"
 * marker so an operator can see at a glance which entries still need one.
 */
export function ArabicSubline({ value, className }: { value?: string | null; className?: string }) {
  if (value && value.trim() !== '') {
    return (
      <span
        dir="rtl"
        lang="ar"
        className={cn('block text-[11px] font-normal text-muted-foreground', className)}
      >
        {value}
      </span>
    );
  }
  return (
    <span
      title={t('arabic.missingTitle')}
      className={cn(
        'mt-0.5 inline-flex w-fit items-center rounded border border-dashed border-border px-1 text-[10px] font-normal text-muted-foreground',
        className,
      )}
    >
      {t('arabic.missing')}
    </span>
  );
}
