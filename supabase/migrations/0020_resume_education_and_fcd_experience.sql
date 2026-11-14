-- =============================================================================
-- 0020_resume_education_and_fcd_experience.sql
-- 1. Adds Founder & CEO at Fast Cyber Defense to Professional Experience if missing.
-- 2. Updates Education periods/GPAs to verified graduation years and grades.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.resume_items
    WHERE section = 'experience'
      AND organization = 'Fast Cyber Defense'
  ) THEN
    INSERT INTO public.resume_items (
      section,
      title,
      organization,
      role_type,
      location,
      period,
      highlights,
      verification_url,
      sort_order,
      is_visible
    )
    VALUES (
      'experience',
      'Founder & CEO',
      'Fast Cyber Defense',
      'Self-employed',
      'Dhaka, Bangladesh · Hybrid',
      '10/2024 - Present',
      ARRAY[
        'Start-up Leadership — Founded and lead Fast Cyber Defense (fastcyberdefense.com), delivering penetration testing (VAPT), incident response, OSINT threat intelligence, and security engineering engagements.',
        'Direct client security architecture, Rules of Engagement (RoE) governance, and rapid incident recovery across Bangladesh and international markets.'
      ],
      'https://fastcyberdefense.com',
      5,
      true
    );
  END IF;

  UPDATE public.resume_items
  SET period = '2022 · CGPA: 2.88/4.0'
  WHERE section = 'education'
    AND title = 'MSc in Computer Science & Engineering';

  UPDATE public.resume_items
  SET period = '2020 · CGPA: 3.15/4.00'
  WHERE section = 'education'
    AND title = 'BSc in Computer Science & Engineering';

  UPDATE public.resume_items
  SET period = '2016 · GPA: 4.83/5.0'
  WHERE section = 'education'
    AND title = 'Higher Secondary Certificate';

  UPDATE public.resume_items
  SET period = '2014 · GPA: 4.56/5.0'
  WHERE section = 'education'
    AND title = 'Secondary School Certificate';
END
$$;
