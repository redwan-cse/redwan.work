import { CEH_VERIFICATION_URL, SITE } from '@/lib/content/site';

export interface ResumeItemRecord {
  id: string;
  section:
    | 'experience'
    | 'leadership'
    | 'education'
    | 'vendor_certification'
    | 'professional_certificate'
    | 'research';
  title: string;
  organization: string;
  role_type: string | null;
  location: string | null;
  period: string | null;
  description: string | null;
  highlights: string[];
  verification_url: string | null;
  badge_label: string | null;
  sort_order: number;
  is_visible: boolean;
}

export interface SiteSettingsRecord {
  id: string;
  full_name: string;
  role_title: string;
  short_role: string;
  subtitle: string;
  tagline: string;
  executive_summary: string;
  email: string;
  phone: string;
  whatsapp_number: string;
  location: string;
  cal_com_url: string;
  company_name: string;
  company_url: string;
  linkedin_url: string;
  github_url: string;
  website_url: string;
  resume_pdf_url: string;
  credentials: Array<{ code: string; label: string }>;
  research_interests: string[];
  technical_skills: Record<string, string[]>;
  soft_skills: string[];
  other_skills: string[];
  hobbies: Array<{ name: string; description: string }>;
  references_list: Array<{
    name: string;
    title: string;
    institution: string;
    email: string;
    phone: string;
    scholarUrl?: string;
  }>;
}

export const DEFAULT_RESUME_ITEMS: ResumeItemRecord[] = [
  // 1. Vendor / Exam Certifications
  {
    id: 'fallback-cert-ceh',
    section: 'vendor_certification',
    title: 'Certified Ethical Hacker (C|EH)',
    organization: 'EC-Council (ANSI / ISO/IEC 17024 Accredited · Cert #ECC8126370954)',
    role_type: null,
    location: null,
    period: 'Nov 2026',
    description: null,
    highlights: [],
    verification_url: CEH_VERIFICATION_URL,
    badge_label: 'C|EH',
    sort_order: 5,
    is_visible: true,
  },
  {
    id: 'fallback-cert-ccep',
    section: 'vendor_certification',
    title: 'Certified Cybersecurity Educator Professional (CCEP)',
    organization: 'Red Team Leaders',
    role_type: null,
    location: null,
    period: 'Nov 2025',
    description: null,
    highlights: [],
    verification_url: 'https://courses.redteamleaders.com/exam-completion/8c0a8dde8e93c63e',
    badge_label: null,
    sort_order: 10,
    is_visible: true,
  },
  {
    id: 'fallback-cert-gh',
    section: 'vendor_certification',
    title: 'GitHub Foundations',
    organization: 'GitHub',
    role_type: null,
    location: null,
    period: 'Oct 2024',
    description: null,
    highlights: [],
    verification_url: 'https://www.credly.com/badges/f98045ea-b50d-4d57-82a0-af7863ca99b3',
    badge_label: null,
    sort_order: 20,
    is_visible: true,
  },
  {
    id: 'fallback-cert-cnsp',
    section: 'vendor_certification',
    title: 'Certified Network Security Practitioner (CNSP)',
    organization: 'The SecOps Group',
    role_type: null,
    location: null,
    period: 'Jun 2024',
    description: null,
    highlights: [],
    verification_url:
      'https://candidate.speedexam.net/certificate.aspx?SSTATE=am4131EniU8ntjp4bO5mXXavp+YURgGKbVJXOmMyS+V2I8II4rmpHeukqY/dquFBgL7CG9IflgMKW24kDcDENaTU5tQ+NGz8g6ZJkXWlvdU=',
    badge_label: null,
    sort_order: 30,
    is_visible: true,
  },
  {
    id: 'fallback-cert-cap',
    section: 'vendor_certification',
    title: 'Certified AppSec Practitioner (CAP)',
    organization: 'The SecOps Group',
    role_type: null,
    location: null,
    period: 'Mar 2023',
    description: null,
    highlights: [],
    verification_url:
      'https://candidate.speedexam.net/certificate.aspx?SSTATE=am4131EniU8ntjp4bO5mXeivFC8I+nhKTJxcDik4I8GciDzBMMaLBCQtwD6nT3sskY1NsNO4LbFS/u4FEzLyN+iKTamOZcv+Bk3aSG/Ez+I=',
    badge_label: null,
    sort_order: 40,
    is_visible: true,
  },

  // 2. Professional Certificates & Course Completions
  {
    id: 'fallback-prof-cert-1',
    section: 'professional_certificate',
    title: 'Mastering Ethical Hacking Tools',
    organization: 'EC-Council | Learning',
    role_type: null,
    location: null,
    period: 'Nov 2025',
    description: null,
    highlights: [],
    verification_url:
      'https://learn.eccouncil.org/certificate/30e719db-9782-4f31-89a6-4c491b814e76?logged=true',
    badge_label: null,
    sort_order: 10,
    is_visible: true,
  },
  {
    id: 'fallback-prof-cert-2',
    section: 'professional_certificate',
    title: 'IBM Cybersecurity Analyst (V2)',
    organization: 'Coursera',
    role_type: null,
    location: null,
    period: 'Jul 2025',
    description: null,
    highlights: [],
    verification_url: 'https://www.coursera.org/account/accomplishments/specialization/RQLW1C63J7EP',
    badge_label: null,
    sort_order: 20,
    is_visible: true,
  },
  {
    id: 'fallback-prof-cert-3',
    section: 'professional_certificate',
    title: 'Cloud Computing',
    organization: 'ICT Division, Bangladesh',
    role_type: null,
    location: null,
    period: 'Sep 2024',
    description: null,
    highlights: [],
    verification_url:
      'https://drive.google.com/file/d/1nLkBFU1f4eDN6f19236i4Jk3BXC7MMdc/view?usp=sharing',
    badge_label: null,
    sort_order: 30,
    is_visible: true,
  },
  {
    id: 'fallback-prof-cert-4',
    section: 'professional_certificate',
    title: 'Jr Penetration Tester',
    organization: 'TryHackMe',
    role_type: null,
    location: null,
    period: 'Apr 2024',
    description: null,
    highlights: [],
    verification_url:
      'https://tryhackme-certificates.s3-eu-west-1.amazonaws.com/THM-1F9FZJ3YIU.png',
    badge_label: null,
    sort_order: 40,
    is_visible: true,
  },
  {
    id: 'fallback-prof-cert-5',
    section: 'professional_certificate',
    title: '21st Century Employability Skilling Program - Advanced',
    organization: 'Wadhwani Foundation',
    role_type: null,
    location: null,
    period: 'Nov 2023',
    description: null,
    highlights: [],
    verification_url:
      'https://web.certificate.wfglobal.org/en/certificate?certificateId=655e4528cbe74e70300d680a',
    badge_label: null,
    sort_order: 50,
    is_visible: true,
  },
  {
    id: 'fallback-prof-cert-6',
    section: 'professional_certificate',
    title: 'Cyber Security',
    organization: 'Arena Web Security',
    role_type: null,
    location: null,
    period: 'Jul 2023',
    description: null,
    highlights: [],
    verification_url:
      'https://admission.arenawebsecurity.net/certificate/apiview/verify/?query=A43W1911S016',
    badge_label: null,
    sort_order: 60,
    is_visible: true,
  },

  // 3. Research & Publications
  {
    id: 'fallback-pub-q1',
    section: 'research',
    title: 'Data-Driven Strategies for Digital Native Market Segmentation Using Clustering',
    organization: 'Journal Paper',
    role_type: 'Journal Paper',
    location: null,
    period: '2024',
    description: 'Peer-reviewed Q1 Scopus journal article on clustering and market segmentation.',
    highlights: [
      'Journal: International Journal of Cognitive Computing in Engineering',
      'Indexing: Scopus (Open Access)',
      'Quartile: Q1',
      'Publisher: Elsevier',
      'Online ISSN: 2666-3074',
    ],
    verification_url: 'https://doi.org/10.1016/j.ijcce.2024.04.002',
    badge_label: 'Q1 · Scopus',
    sort_order: 10,
    is_visible: true,
  },
  {
    id: 'fallback-pub-ieee',
    section: 'research',
    title:
      'Phishing URL Detection Using Comprehensive Feature Extraction and Machine Learning Techniques',
    organization: 'Conference Paper',
    role_type: 'Conference Paper',
    location: 'Jagannath University, Dhaka, Bangladesh',
    period: 'Nov 2024',
    description: 'Peer-reviewed IEEE symposium paper on phishing URL detection.',
    highlights: [
      'Conference: IEEE CS BDC SYMPOSIUM 2024',
      'Date: November 22-23, 2024',
      'Location: Jagannath University, Dhaka, Bangladesh',
    ],
    verification_url: 'https://s24.ieeecsbdc.org/papers/156',
    badge_label: 'IEEE',
    sort_order: 20,
    is_visible: true,
  },

  // 4. Professional Experience
  {
    id: 'fallback-exp-fcd',
    section: 'experience',
    title: 'Founder & CEO',
    organization: 'Fast Cyber Defense',
    role_type: 'Self-employed',
    location: 'Dhaka, Bangladesh · Hybrid',
    period: '10/2024 - Present',
    description: null,
    highlights: [
      'Start-up Leadership — Founded and lead Fast Cyber Defense (fastcyberdefense.com), delivering penetration testing (VAPT), incident response, OSINT threat intelligence, and security engineering engagements.',
      'Direct client security architecture, Rules of Engagement (RoE) governance, and rapid incident recovery across Bangladesh and international markets.',
    ],
    verification_url: 'https://fastcyberdefense.com',
    badge_label: null,
    sort_order: 5,
    is_visible: true,
  },
  {
    id: 'fallback-exp-1',
    section: 'experience',
    title: 'Information Security Freelancer',
    organization: 'Upwork',
    role_type: 'Remote',
    location: 'Worldwide',
    period: '04/2023 - Present',
    description: null,
    highlights: [
      'Completed penetration testing (VAPT) projects for international clients.',
      'Performed an OSINT investigation on a scam website and related scammer network.',
      'Helped clients recover hacked or transferred online accounts, including social media and business assets.',
      'Restored permanently deleted Google Drive files and a lost Word document from OneDrive.',
      'Provided technical and cybersecurity support, from proxy and fingerprint consulting to e-commerce and website tasks.',
    ],
    verification_url: 'https://www.upwork.com/freelancers/~01bd47ab2da223b848',
    badge_label: null,
    sort_order: 10,
    is_visible: true,
  },
  {
    id: 'fallback-exp-2',
    section: 'experience',
    title: 'Trainer – Machine Learning with Python',
    organization: 'EDGE Project, Jagannath University',
    role_type: 'Training',
    location: 'Dhaka',
    period: '09/2024 - 05/2025',
    description: null,
    highlights: [
      'Conducted hands-on training on Python-based machine learning concepts.',
      'Guided participants through supervised and unsupervised learning techniques, data preprocessing, and model evaluation.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 20,
    is_visible: true,
  },
  {
    id: 'fallback-exp-3',
    section: 'experience',
    title: 'Trainer – Basic Computer Course',
    organization: 'Jagannath University IT Society',
    role_type: 'Training',
    location: 'Dhaka',
    period: '08/2024 - 02/2025',
    description: null,
    highlights: [
      'Conducted training on computer fundamentals and MS Office (Word, PowerPoint, Excel).',
      'Helped participants build confidence in everyday digital tasks and professional documentation.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 30,
    is_visible: true,
  },
  {
    id: 'fallback-exp-4',
    section: 'experience',
    title: 'Trainer – Microsoft Office',
    organization: 'EDGE Project, Jagannath University',
    role_type: 'Training',
    location: 'Dhaka',
    period: '08/2024 - 12/2024',
    description: null,
    highlights: [
      'Conducted practical sessions on Microsoft Office applications including Word, Excel, and PowerPoint.',
      'Delivered foundational IT training as part of the national EDGE capacity-building initiative.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 40,
    is_visible: true,
  },
  {
    id: 'fallback-exp-5',
    section: 'experience',
    title: 'Assistant Trainer (Linux Server Administration)',
    organization: 'AsiaInfo Innovation Technologies (Nanjing) Co. Ltd.',
    role_type: 'Contract',
    location: 'Dhaka',
    period: '04/2024 - 04/2024',
    description: null,
    highlights: [
      'Trained Bangladesh Telecommunications Company Limited (BTCL) billing staff on CentOS Linux system and server administration.',
      'Covered CentOS system configuration, user management, and service hardening (on behalf of AsiaInfo Innovation Technologies (Nanjing) Co. Ltd).',
      'Credential: Certificate of completion received for the module delivered.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 50,
    is_visible: true,
  },
  {
    id: 'fallback-exp-6',
    section: 'experience',
    title: 'Cloud Computing Trainee',
    organization: 'Prime Tech Solutions Ltd.',
    role_type: 'Internship',
    location: 'Dhaka',
    period: '09/2023 - 03/2024',
    description: null,
    highlights: [
      'Implemented cloud technology initiatives, gaining hands-on experience with Linux Server (Ubuntu), Git, GitHub, MySQL, Nginx, AWS, Heroku, and DigitalOcean Droplets.',
      'Applied skills in web development with Django framework and CI/CD, optimizing project workflows through GitHub Actions.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 60,
    is_visible: true,
  },
  {
    id: 'fallback-exp-7',
    section: 'experience',
    title: 'Cybersecurity Internship',
    organization: "Arena Web Security - The Hacker's Arena",
    role_type: 'Internship',
    location: 'Dhaka',
    period: '06/2023 - 07/2023',
    description: null,
    highlights: [
      'Completed comprehensive 5-month Cybersecurity course with 1-month hands-on internship.',
      'Conducted vulnerability assessments and penetration testing on web applications and networks.',
      'Implemented Wazuh as a SIEM platform in a lab environment to centralize log collection, alerts, and basic security event analysis.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 70,
    is_visible: true,
  },

  // 5. Leadership Experience
  {
    id: 'fallback-lead-1',
    section: 'leadership',
    title: 'Research Fellow',
    organization: 'ITRRC Cybersecurity Research Lab, Jagannath University',
    role_type: null,
    location: 'Dhaka',
    period: '06/2024 - Present',
    description: null,
    highlights: [
      'Coordinate lab activities and maintain the cybersecurity research community.',
      'Lead bi-weekly training and assessments for lab members on cybersecurity topics.',
      'Conduct cybersecurity research and support trainees working on security-focused projects and publications under lab mentors.',
      'Help lab members connect and discuss ideas with Jagannath University faculty and Bangladeshi-origin professors now based abroad.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 10,
    is_visible: true,
  },
  {
    id: 'fallback-lead-2',
    section: 'leadership',
    title: 'Former President',
    organization: 'Jagannath University IT Society',
    role_type: null,
    location: 'Dhaka',
    period: '07/2023 - 07/2025',
    description: null,
    highlights: [
      'Led a 200+ member student IT society, coordinating IT-focused events and workshops.',
      'Mentored members through learning activities and career-focused guidance.',
      'Organized and supported programs to build practical tech skills and peer collaboration.',
      'Now serve as an alumni / advisor to the new committee, sharing context and guidance when needed.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 20,
    is_visible: true,
  },
  {
    id: 'fallback-lead-3',
    section: 'leadership',
    title: 'General Member to Vice President',
    organization: 'Jagannath University IT Society',
    role_type: null,
    location: 'Dhaka',
    period: '11/2017 - 07/2023',
    description: null,
    highlights: [
      'Progressed from general member to elected Vice President of the society.',
      'Helped plan and organize IT events, seminars, and workshops for students.',
      'Developed strong organizational and leadership skills through coordinating activities and working with members.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 30,
    is_visible: true,
  },
  {
    id: 'fallback-lead-4',
    section: 'leadership',
    title: 'Former Vice-President',
    organization: 'Sherpur District Student Welfare Council, Jagannath University',
    role_type: null,
    location: 'Dhaka',
    period: '01/2018 - 11/2021',
    description: null,
    highlights: [
      'Co-founded and helped lead the council to support the educational and social needs of students from Sherpur District.',
      'Organized welfare and fundraising activities to assist underprivileged students with access to education and essential resources.',
    ],
    verification_url: null,
    badge_label: null,
    sort_order: 40,
    is_visible: true,
  },

  // 6. Education
  {
    id: 'fallback-edu-msc',
    section: 'education',
    title: 'MSc in Computer Science & Engineering',
    organization: 'Jagannath University',
    role_type: null,
    location: 'Dhaka, Bangladesh',
    period: '2022 · CGPA: 2.88/4.0',
    description: null,
    highlights: [],
    verification_url: null,
    badge_label: null,
    sort_order: 10,
    is_visible: true,
  },
  {
    id: 'fallback-edu-bsc',
    section: 'education',
    title: 'BSc in Computer Science & Engineering',
    organization: 'Jagannath University',
    role_type: null,
    location: 'Dhaka, Bangladesh',
    period: '2020 · CGPA: 3.15/4.00',
    description: null,
    highlights: [],
    verification_url: null,
    badge_label: null,
    sort_order: 20,
    is_visible: true,
  },
  {
    id: 'fallback-edu-hsc',
    section: 'education',
    title: 'Higher Secondary Certificate',
    organization: 'Cambrian College',
    role_type: null,
    location: 'Dhaka, Bangladesh',
    period: '2016 · GPA: 4.83/5.0',
    description: null,
    highlights: [],
    verification_url: null,
    badge_label: null,
    sort_order: 30,
    is_visible: true,
  },
  {
    id: 'fallback-edu-ssc',
    section: 'education',
    title: 'Secondary School Certificate',
    organization: 'Sonkanda Dr. M. T Hossain High School',
    role_type: null,
    location: 'Sherpur, Bangladesh',
    period: '2014 · GPA: 4.56/5.0',
    description: null,
    highlights: [],
    verification_url: null,
    badge_label: null,
    sort_order: 40,
    is_visible: true,
  },
];

export const DEFAULT_ROLE_TITLE = 'Founder & CEO, Fast Cyber Defense · CSE Professional';
export const DEFAULT_RESUME_SUBTITLE =
  'Certified Ethical Hacker (C|EH) · Offensive Security & Full-Stack/Cloud Architect · Researcher';

export const ACADEMIC_REFERENCE_SCHOLAR_URLS = {
  abuLayek: 'https://scholar.google.com/citations?user=pDEC0p4AAAAJ&hl=en',
  manowarulIslam: 'https://scholar.google.com/citations?user=MBF7Y_4AAAAJ&hl=en',
} as const;

export const MANOWARUL_ISLAM_REFERENCE: SiteSettingsRecord['references_list'][number] = {
  name: 'Dr. Md. Manowarul Islam',
  title: 'Professor, Department of Computer Science and Engineering',
  institution: 'Jagannath University, Dhaka-1100, Bangladesh',
  email: 'manowar@cse.jnu.ac.bd',
  phone: '+880 1717-816554',
  scholarUrl: ACADEMIC_REFERENCE_SCHOLAR_URLS.manowarulIslam,
};

export function reconcileRoleTitle(rawRoleTitle: string | null | undefined): string {
  const value = (rawRoleTitle ?? '').trim();
  if (
    !value ||
    value === 'Computer Science & Engineering Professional' ||
    value === 'Cybersecurity Specialist, Full-Stack Engineer & Founder of Fast Cyber Defense'
  ) {
    return DEFAULT_ROLE_TITLE;
  }
  return value;
}

export function reconcileResumeSubtitle(rawSubtitle: string | null | undefined): string {
  const value = (rawSubtitle ?? '').trim();
  if (
    !value ||
    value === 'Cybersecurity Researcher | Information Security Freelancer | Educator' ||
    value ===
      'Offensive Security & VAPT Specialist | Full-Stack & Cloud Consultant | Q1 Scopus & IEEE Researcher | Educator' ||
    value ===
      'Certified Ethical Hacker (C|EH) · Offensive Security & Full-Stack/Cloud Architect · Q1 IEEE Researcher' ||
    value ===
      'Certified Ethical Hacker (C|EH) · Offensive Security & Full-Stack/Cloud Architect · Q1 Scopus Researcher'
  ) {
    return DEFAULT_RESUME_SUBTITLE;
  }
  return value;
}

export function reconcileCredentials(
  rawCredentials: unknown,
  fallback: Array<{ code: string; label: string }>
): Array<{ code: string; label: string }> {
  if (!Array.isArray(rawCredentials) || rawCredentials.length === 0) {
    return fallback;
  }
  const normalized = (rawCredentials as Array<{ code: string; label: string }>).map((cred) =>
    cred.code === 'Q1 / IEEE'
      ? { code: 'Q1 Scopus', label: cred.label || 'Published AI & Security Researcher' }
      : cred
  );
  return normalized.some((c) => c.code === 'C|EH')
    ? normalized
    : [{ code: 'C|EH', label: 'Certified Ethical Hacker (EC-Council)' }, ...normalized];
}

export function reconcileTechnicalSkills(
  rawSkills: unknown,
  fallback: Record<string, string[]>
): Record<string, string[]> {
  if (!rawSkills || typeof rawSkills !== 'object' || Array.isArray(rawSkills)) {
    return fallback;
  }
  const record = rawSkills as Record<string, string[]>;
  const keys = Object.keys(record);
  if (keys.length === 0) {
    return fallback;
  }
  const hasLegacyStack =
    (keys.includes('Tools & Cloud') || keys.includes('Networking & Systems')) &&
    !Object.values(record).some(
      (list) => Array.isArray(list) && list.includes('Next.js (App Router) & React')
    );
  const hasUnalignedV1Skills =
    keys.includes('Cloud, Edge & DevOps') &&
    Array.isArray(record['Cloud, Edge & DevOps']) &&
    record['Cloud, Edge & DevOps'].includes('AWS (EC2, IAM) & Azure IAM');
  return hasLegacyStack || hasUnalignedV1Skills ? fallback : record;
}

export function reconcileStringList(
  rawList: unknown,
  legacyValues: string[],
  fallback: string[]
): string[] {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return fallback;
  }
  const normalized = rawList.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  if (normalized.length === 0) {
    return fallback;
  }
  const matchesLegacy =
    normalized.length === legacyValues.length &&
    normalized.every((item, idx) => item === legacyValues[idx]);
  return matchesLegacy ? fallback : normalized;
}

export function reconcileReferencesList(
  rawRefs: unknown,
  fallback: SiteSettingsRecord['references_list']
): SiteSettingsRecord['references_list'] {
  if (!Array.isArray(rawRefs) || rawRefs.length === 0) {
    return fallback;
  }
  return (rawRefs as SiteSettingsRecord['references_list']).map((ref) => {
    if (/Uzzal/i.test(ref.name)) {
      return MANOWARUL_ISLAM_REFERENCE;
    }
    if (/Abu Layek/i.test(ref.name)) {
      return {
        ...ref,
        scholarUrl: ref.scholarUrl || ACADEMIC_REFERENCE_SCHOLAR_URLS.abuLayek,
      };
    }
    if (/Manowarul/i.test(ref.name)) {
      return {
        ...ref,
        scholarUrl: ref.scholarUrl || ACADEMIC_REFERENCE_SCHOLAR_URLS.manowarulIslam,
      };
    }
    return ref;
  });
}

export const DEFAULT_SITE_SETTINGS: SiteSettingsRecord = {
    id: 'default',
    full_name: 'Md. Redwan Ahmed',
    role_title: DEFAULT_ROLE_TITLE,
    short_role: SITE.shortRole,
    subtitle: DEFAULT_RESUME_SUBTITLE,
    tagline: SITE.tagline,
    executive_summary:
      "Computer Science & Engineering professional developing practical skills in information security, cyber defense, and system administration, with growing experience as a freelancer and trainer. I am actively building my expertise through hands-on security work, teaching activities, and continuous self-learning, with a focus on applying Machine Learning and Artificial Intelligence to real-world security problems. I'm particularly interested in roles and environments that allow me to strengthen my technical foundations, contribute to secure system design, support others through mentoring and training, and gradually transition into more advanced responsibilities in both the information security industry and research.",
    email: SITE.email,
    phone: SITE.phoneDisplay,
    whatsapp_number: SITE.whatsappNumber,
    location: 'Dhaka, BD',
    cal_com_url: SITE.calComUrl,
    company_name: SITE.company.name,
    company_url: SITE.company.url,
    linkedin_url: SITE.socials.linkedin,
    github_url: SITE.socials.github,
    website_url: SITE.url,
    resume_pdf_url: '/resume.pdf',
    credentials: [...SITE.credentials],
    research_interests: [
      'Cyber Security',
      'Machine Learning',
      'Artificial Intelligence',
    ],
    technical_skills: {
      'Cybersecurity & Offensive Security': [
        'Penetration Testing & Ethical Hacking (C|EH)',
        'Vulnerability Assessment & Penetration Testing (VAPT)',
        'Web & Application Security / OWASP Top 10 (CAP)',
        'Network & Protocol Security (CNSP)',
        'Open-Source Intelligence (OSINT)',
        'Active Directory & AD CS Hardening',
        'SOC, Incident Response & Threat Analysis (IBM / Wazuh)',
      ],
      'Security, SIEM & Assessment Tooling': [
        'Burp Suite Pro',
        'OWASP ZAP',
        'Wazuh (SIEM / XDR)',
        'Kali Linux',
        'Nmap',
        'Metasploit',
        'Nessus',
        'OpenVAS',
        'SQLmap',
        'Hydra',
        'Gobuster',
        'WPScan',
      ],
      'Full-Stack, Databases & Programming': [
        'TypeScript / JavaScript',
        'Next.js (App Router) & React',
        'Tailwind CSS & shadcn/ui',
        'Python (Django & Security/ML Scripting)',
        'PostgreSQL & Row Level Security (RLS)',
        'MySQL',
        'C / C++',
        'Java',
        'REST APIs & Zod Validation',
        'Bash & PowerShell Scripting',
      ],
      'Cloud, Linux & DevSecOps': [
        'Linux System & Server Administration (Ubuntu, CentOS)',
        'AWS & DigitalOcean',
        'Nginx & Heroku',
        'Vercel & Edge Runtime',
        'Supabase (Postgres, Auth, Storage)',
        'Cloudflare (R2, Turnstile, WAF & Edge)',
        'Git & GitHub (GitHub Foundations)',
        'CI/CD (GitHub Actions)',
        'Docker & Containerization',
      ],
      'Applied AI, Machine Learning & CS Foundations': [
        'Machine Learning & Clustering (Scikit-Learn)',
        'Feature Engineering & Classification',
        'Data Analysis (Pandas & NumPy)',
        'AI Workflow & LLM Agent Integration',
        'Computer Networks & TCP/IP',
        'Data Structures, Algorithms & OOP',
        'Backup & Disaster Recovery',
      ],
    },
    soft_skills: [
      'Analytical Thinking & Problem Solving',
      'Technical Training & Mentorship (CCEP / EDGE)',
      'Executive & Client Communication',
      'Team Leadership & Coordination',
      'Public Speaking & Workshops',
    ],
    other_skills: [
      'Security & Technical Documentation',
      'Microsoft Office Suite (Word, Excel, PowerPoint)',
      'Google Workspace Administration',
      'Executive Tech Support & Account Recovery',
    ],
    hobbies: [
      {
        name: 'Cybersecurity Research',
        description:
          'Actively researching emerging threats, vulnerabilities, and security methodologies to stay ahead in the field.',
      },
      {
        name: 'Open Source Contribution',
        description:
          'Contributing to security tools and frameworks on GitHub, collaborating with the global developer community.',
      },
      {
        name: 'Capture The Flag (CTF) Challenges',
        description:
          'Participating in cybersecurity competitions to sharpen problem-solving skills and explore ethical hacking techniques.',
      },
      {
        name: 'Technical Writing & Documentation',
        description:
          'Creating guides, tutorials, and technical documentation to share knowledge with the security community.',
      },
      {
        name: 'Teaching & Mentoring',
        description:
          'Training aspiring cybersecurity professionals and students, sharing practical knowledge and industry best practices.',
      },
      {
        name: 'Technology Exploration',
        description:
          'Continuously learning new programming languages, frameworks, and security tools to expand technical expertise.',
      },
    ],
    references_list: [
      {
        name: 'Prof. Dr. Md. Abu Layek',
        title: 'Professor, Department of Computer Science and Engineering',
        institution: 'Jagannath University, Dhaka-1100, Bangladesh',
        email: 'abulayek@yahoo.com',
        phone: '+880 1841-465733',
        scholarUrl: ACADEMIC_REFERENCE_SCHOLAR_URLS.abuLayek,
      },
      MANOWARUL_ISLAM_REFERENCE,
    ],
  };
