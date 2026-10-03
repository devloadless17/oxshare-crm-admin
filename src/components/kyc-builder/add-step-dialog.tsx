'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { t } from '@/lib/i18n';
import { ArabicHelper, ArabicInput } from './arabic-input';

/** What the dialog hands back: the English, and its optional Arabic twin (0179). */
export interface NewStep {
  title: string;
  description: string;
  titleAr?: string;
  descriptionAr?: string;
}

/**
 * Adds a step of the broker's own: a NAME and what it is for.
 *
 * There is no address ("slug") box any more. The address is where a step's
 * answers are filed and what the client's browser opens, so the server gives a
 * new step one from its title and it never changes (`newCustomSlug`) — a typed
 * one could clash with a built-in step, or carry spaces ("custom slug 1" is on
 * the dev database), and a renamed one would orphan every answer given under it.
 */
export function AddStepDialog({
  onAdd,
  onClose,
}: {
  onAdd: (step: NewStep) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [titleAr, setTitleAr] = React.useState('');
  const [descriptionAr, setDescriptionAr] = React.useState('');
  const dialog = React.useRef<HTMLDivElement>(null);
  useFocusTrap(dialog, true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-step-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl duration-150 animate-in fade-in-0 zoom-in-95"
      >
        <div className="mb-1 flex items-center gap-2 text-link">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          <h3 id="add-step-title" className="text-lg font-bold text-foreground">
            {t('builder.newStepTitle')}
          </h3>
        </div>
        <p className="mb-6 text-xs text-muted-foreground">{t('builder.newStepBody')}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            onAdd({
              title: title.trim(),
              description: description.trim(),
              titleAr: titleAr.trim() || undefined,
              descriptionAr: descriptionAr.trim() || undefined,
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-step-title">
              {t('builder.stepTitle')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="new-step-title"
              required
              placeholder={t('builder.titlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-step-desc">{t('builder.guidance')}</Label>
            <Input
              id="new-step-desc"
              placeholder={t('builder.guidancePlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-3">
            <ArabicInput
              id="new-step-title-ar"
              label={t('arabic.title')}
              value={titleAr}
              onChange={setTitleAr}
              maxLength={200}
            />
            <ArabicInput
              id="new-step-desc-ar"
              label={t('arabic.description')}
              value={descriptionAr}
              onChange={setDescriptionAr}
              maxLength={2000}
            />
            <ArabicHelper />
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('builder.addStep')}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
