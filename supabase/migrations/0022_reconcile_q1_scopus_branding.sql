-- 0022_reconcile_q1_scopus_branding.sql
-- Removes IEEE Symposium from profile titles, credential chips, service blurbs, and portfolio headlines
-- while keeping Q1 Scopus as the flagship research showcase and preserving the IEEE CS BDC Symposium
-- paper inside the Peer-Reviewed Research section of resume_items plus all earned vendor certifications.

update public.site_settings
set
  subtitle = 'Certified Ethical Hacker (C|EH) · Offensive Security & Full-Stack/Cloud Architect · Q1 Scopus Researcher',
  executive_summary = 'Computer Science & Engineering professional specializing in offensive security (VAPT & OSINT), full-stack software engineering, Linux/cloud infrastructure, and applied machine learning. Proven track record delivering international penetration testing, digital fraud investigations, incident recovery, and custom web platforms alongside peer-reviewed Q1 Scopus research publications.',
  credentials = '[
    {"code": "C|EH", "label": "Certified Ethical Hacker (EC-Council)"},
    {"code": "CCEP", "label": "Certified Cybersecurity Educator Professional"},
    {"code": "GitHub", "label": "GitHub Foundations Certified"},
    {"code": "CNSP", "label": "Certified Network Security Practitioner"},
    {"code": "CAP", "label": "Certified AppSec Practitioner"},
    {"code": "Q1 Scopus", "label": "Published AI & Security Researcher"}
  ]'::jsonb
where id = 'default';

update public.services
set
  description = 'Backed by Q1 Scopus published research in machine learning and cybersecurity. Build production AI assistants, automated document/lead triage pipelines, or custom classification models.'
where slug = 'ai-ml-automation';

update public.portfolio_items
set
  title = 'Published Q1 Scopus (Elsevier) Machine Learning Pipelines',
  headline_metric = 'Published in Elsevier IJCCE (Q1 Scopus) · Applied ML Pipelines',
  approach = array[
    'Engineered end-to-end preprocessing, feature extraction, and clustering/classification benchmarking in Python and Scikit-Learn.',
    'Developed comprehensive URL lexical, host, and structural feature extraction pipelines for phishing detection (redwan-cse/PhishDF).',
    'Published peer-reviewed findings in Elsevier International Journal of Cognitive Computing in Engineering (Q1 Scopus).'
  ],
  outcomes = array[
    'Peer-reviewed Q1 Scopus publication with DOI verification links on the public curriculum vitae.',
    'Applied curriculum in hands-on Machine Learning with Python training for the EDGE Project at Jagannath University.'
  ],
  stack = array['Python', 'Scikit-Learn', 'PhishDF', 'Feature Engineering', 'K-Means Clustering', 'Elsevier Q1 Scopus']
where code in ('CS-105', 'CS-110')
   or slug = 'q1-ml-healthcare-security';
