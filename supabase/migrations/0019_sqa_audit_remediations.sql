-- =============================================================================
-- 0019_sqa_audit_remediations.sql
-- Remediates SQA audit findings while preserving locked migrations 0001..0010:
--   1. Expand rate_limits_kind_check to accept 'password-login' and 'register-ip'
--      in addition to all existing kinds from 0012.
--   2. Add atomic SECURITY DEFINER RPC public.increment_vault_file_download(uuid)
--      restricted exclusively to service_role.
--   3. Safely schedule run_auto_accept_deliverables via pg_cron only when present.
-- =============================================================================

ALTER TABLE public.rate_limits
  DROP CONSTRAINT IF EXISTS rate_limits_kind_check;

ALTER TABLE public.rate_limits
  ADD CONSTRAINT rate_limits_kind_check CHECK (
    kind IN (
      'ip',
      'turnstile',
      'presign',
      'presign-ip',
      'otp',
      'otp-ip',
      'auth',
      'retry-recovery',
      'retry-invite',
      'portal-presign',
      'password-login',
      'register-ip'
    )
  );

CREATE OR REPLACE FUNCTION public.increment_vault_file_download(p_file_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.vault_files
  SET download_count = COALESCE(download_count, 0) + 1,
      last_downloaded_at = now()
  WHERE id = p_file_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_vault_file_download(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_vault_file_download(uuid) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $cron$
      SELECT cron.schedule(
        'auto-accept-deliverables-hourly',
        '15 * * * *',
        'SELECT public.run_auto_accept_deliverables();'
      );
    $cron$;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END
$$;
