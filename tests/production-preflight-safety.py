"""Current retirement invariant. Historical safety tests ran before credential use."""
import pathlib,unittest
class Retirement(unittest.TestCase):
 def test_no_active_production_access(self):
  root=pathlib.Path(__file__).parents[1]
  workflow=(root/'.github/workflows/production-readonly-preflight.yml').read_text()
  script=(root/'scripts/production-preflight.py').read_text()
  for token in ['secrets.','environment:','statuses: write']:self.assertNotIn(token,workflow)
  for token in ['http.client','urllib.request','requests.','os.environ','subprocess']:self.assertNotIn(token,script)
if __name__=='__main__':unittest.main()
