'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ActionState = { error?: string; notice?: string };

function safeRelativePath(raw: FormDataEntryValue | null): string | null {
  if (
    typeof raw !== 'string' ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.startsWith('/\\') ||
    raw.startsWith('\\')
  ) {
    return null;
  }
  return raw;
}

async function panelHomeForCurrentUser(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const role = (data?.claims as { app_metadata?: Record<string, unknown> } | null | undefined)
    ?.app_metadata?.['role'];
  return role === 'admin' ? '/admin' : '/portal';
}

export async function signInWithPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = safeRelativePath(formData.get('next'));

  if (!email || !password) return { error: 'Email and password are required.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Invalid email or password.' };

  if (next) redirect(next);
  redirect(await panelHomeForCurrentUser());
}

export async function requestMagicLinkAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) return { error: 'Email is required.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  // Uniform message regardless of account existence.
  if (error && error.status !== 429) {
    return { notice: 'If that address has an account, a sign-in link is on its way.' };
  }
  if (error && error.status === 429) {
    return { error: 'Too many requests. Please wait a minute and try again.' };
  }
  return { notice: 'If that address has an account, a sign-in link is on its way.' };
}

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) return { error: 'Email is required.' };

  // Build redirectTo from request headers so localhost probes receive
  // links that land locally and production links land on the deployed origin.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'redwan.work';
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const redirectTo = `${proto}://${host}/reset-password`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error && error.status === 429) {
    return { error: 'Too many requests. Please wait a minute and try again.' };
  }
  return { notice: 'If that address has an account, a reset link is on its way.' };
}
