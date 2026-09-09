"""Offline synthetic tests. Never load production environment or make HTTP requests."""
import importlib.util,pathlib,unittest,io,contextlib
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('preflight',pathlib.Path(__file__).parents[1]/'scripts/production-preflight.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Safety(unittest.TestCase):
 def test_destinations_and_methods(self):
  with patch.object(m.http.client,'HTTPSConnection',side_effect=AssertionError('network attempted')):
   for host,path,method in [('evil.test','/domains','GET'),('api.resend.com','/emails','POST'),('api.supabase.com','/v1/projects/x/database/query','POST'),('a'*20+'.supabase.co','/rest/v1/profiles?select=*','GET'),('a'*32+'.r2.cloudflarestorage.com','/private?list-type=2','GET')]:
    with self.assertRaises(ValueError):m.request(host,path,method=method)
 def test_unsafe_endpoints(self):
  for value in ['http://'+('a'*20)+'.supabase.co','https://evil.test','https://'+('a'*20)+'.supabase.co@evil.test','https://'+('a'*20)+'.supabase.co/path','https://'+('a'*20)+'.supabase.co?token=x']:
   with self.assertRaises(ValueError):m.hostname(value,'supabase')
 def test_network_failures_redacted(self):
  fake={'NEXT_PUBLIC_SUPABASE_URL':'https://'+'a'*20+'.supabase.co','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY':'sb_publishable_synthetic','SUPABASE_SECRET_KEY':'sb_secret_DO_NOT_PRINT','SUPABASE_ACCESS_TOKEN':'DO_NOT_PRINT','RESEND_API_KEY':'DO_NOT_PRINT'}
  out=io.StringIO()
  with patch.object(m,'request',side_effect=RuntimeError('DO_NOT_PRINT')),contextlib.redirect_stdout(out):m.supabase(fake);m.resend(fake)
  self.assertNotIn('DO_NOT_PRINT',out.getvalue())
 def test_template_and_cors(self):
  self.assertTrue(m.recovery_template('<a href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&amp;type=recovery">Reset</a>'))
  self.assertFalse(m.recovery_template('<a href="{{ .ConfirmationURL }}">Reset</a>'))
  self.assertTrue(m.cors_allows(b'<CORSConfiguration><CORSRule><AllowedOrigin>https://redwan.work</AllowedOrigin><AllowedMethod>PUT</AllowedMethod><AllowedHeader>content-type</AllowedHeader></CORSRule></CORSConfiguration>'))
  self.assertFalse(m.cors_allows(b'<CORSConfiguration/>'))
 def test_fixed_output_only(self):
  with self.assertRaises(AssertionError):m.emit('preflight','provider secret')
 def test_restricted_resend_is_not_invalid_key(self):
  out=io.StringIO()
  with patch.object(m,'json_get',return_value=(401,{'name':'restricted_api_key','message':'DO_NOT_PRINT'})),contextlib.redirect_stdout(out):m.resend({'RESEND_API_KEY':'synthetic'})
  self.assertIn('RESTRICTED',out.getvalue());self.assertNotIn('DO_NOT_PRINT',out.getvalue())
if __name__=='__main__':unittest.main()
