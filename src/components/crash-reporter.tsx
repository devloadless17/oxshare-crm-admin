'use client';

import { useEffect } from 'react';
import { installCrashListeners } from '@/lib/crash-report';

/**
 * TWIN of the same path in the sibling app (scripts/check-twins.sh).
 *
 * Mounted once in the root layout: sends any crash report still waiting on this
 * device, and listens for errors no error screen catches (lib/crash-report.ts).
 */
export function CrashReporter() {
  useEffect(() => installCrashListeners(), []);
  return null;
}
