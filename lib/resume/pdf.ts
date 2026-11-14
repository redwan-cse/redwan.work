import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFPage,
  PDFString,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type RGB,
} from 'pdf-lib';
import type { ResumeItemRecord, SiteSettingsRecord } from '@/lib/cms/queries';
import { CEH_CERT_NUMBER, CEH_VERIFICATION_URL } from '@/lib/content/site';
import { sanitizeHttpUrl } from '@/lib/security/safe-redirect';

export interface GenerateResumePdfInput {
  settings: SiteSettingsRecord;
  items: ResumeItemRecord[];
  cehLogoBytes?: Uint8Array | null;
  generatedAt?: Date;
}

const A4_WIDTH = PageSizes.A4[0]; // 595.28 pt
const A4_HEIGHT = PageSizes.A4[1]; // 841.89 pt
const MARGIN_X = 42;
const MARGIN_TOP = 42;
const MARGIN_BOTTOM = 44;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_X * 2;

const COLORS = {
  inkDark: rgb(15 / 255, 23 / 255, 42 / 255),
  inkBody: rgb(51 / 255, 65 / 255, 85 / 255),
  inkMuted: rgb(100 / 255, 116 / 255, 139 / 255),
  inkLight: rgb(148 / 255, 163 / 255, 184 / 255),
  blue: rgb(37 / 255, 99 / 255, 235 / 255),
  emerald: rgb(5 / 255, 150 / 255, 105 / 255),
  violet: rgb(124 / 255, 58 / 255, 237 / 255),
  crimson: rgb(220 / 255, 38 / 255, 38 / 255),
  surface: rgb(248 / 255, 250 / 255, 252 / 255),
  pillBg: rgb(241 / 255, 245 / 255, 249 / 255),
  border: rgb(203 / 255, 213 / 255, 225 / 255),
  divider: rgb(226 / 255, 232 / 255, 240 / 255),
  white: rgb(1, 1, 1),
};

const WINANSI_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201A]/g, "'"],
  [/[\u201C\u201D\u201E]/g, '"'],
  [/\u2026/g, '...'],
  [/\u25B8|\u25BA|\u25B6/g, '>'],
  [/\u00A0|\u2009|\u202F/g, ' '],
  [/\u2192/g, '->'],
  [/\u2713|\u2714/g, 'v'],
];

/**
 * Normalizes arbitrary CMS strings into WinAnsi-safe text for pdf-lib StandardFonts
 * so unexpected Unicode characters never crash runtime PDF generation.
 */
export function sanitizePdfText(raw: string | null | undefined): string {
  if (!raw) return '';
  let text = String(raw);
  for (const [pattern, replacement] of WINANSI_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return Array.from(text)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (
        (code >= 0x20 && code <= 0x7e) ||
        code === 0x0a ||
        code === 0x09 ||
        (code >= 0xa0 && code <= 0xff) ||
        code === 0x2013 ||
        code === 0x2014 ||
        code === 0x2022
      ) {
        return ch;
      }
      return '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const cleaned = sanitizePdfText(text);
  if (!cleaned) return [];

  const lines: string[] = [];
  const words = cleaned.split(' ');
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = '';
    }

    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }

    // Hard-wrap long unbroken tokens (such as long URLs or IDs)
    let chunk = '';
    for (const ch of word) {
      const nextChunk = chunk + ch;
      if (font.widthOfTextAtSize(nextChunk, size) <= maxWidth) {
        chunk = nextChunk;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  }

  if (current) lines.push(current);
  return lines;
}

function safeHref(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^tel:\+?[0-9-]{6,}$/i.test(trimmed)) {
    return trimmed;
  }
  return sanitizeHttpUrl(trimmed);
}

function addUriAnnotation(
  pdfDoc: PDFDocument,
  page: PDFPage,
  x: number,
  yBottom: number,
  width: number,
  height: number,
  uri: string
) {
  const safe = safeHref(uri);
  if (!safe || width <= 0 || height <= 0) return;

  const linkAnnotation = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x, yBottom, x + width, yBottom + height],
    Border: [0, 0, 0],
    A: {
      Type: 'Action',
      S: 'URI',
      URI: PDFString.of(safe),
    },
  });

  const existing = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (existing) {
    existing.push(linkAnnotation);
  } else {
    page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([linkAnnotation]));
  }
}

interface PillLayoutItem {
  label: string;
  x: number;
  rowOffset: number;
  width: number;
}

function layoutPills(
  labels: string[],
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  padX = 6,
  gapX = 4,
  rowHeight = 16
): { items: PillLayoutItem[]; totalHeight: number } {
  const items: PillLayoutItem[] = [];
  let cursorX = 0;
  let row = 0;

  for (const raw of labels) {
    const label = sanitizePdfText(raw);
    if (!label) continue;
    const textWidth = font.widthOfTextAtSize(label, fontSize);
    const pillWidth = Math.min(maxWidth, textWidth + padX * 2);

    if (cursorX > 0 && cursorX + pillWidth > maxWidth) {
      row += 1;
      cursorX = 0;
    }

    items.push({
      label,
      x: cursorX,
      rowOffset: row * rowHeight,
      width: pillWidth,
    });
    cursorX += pillWidth + gapX;
  }

  return {
    items,
    totalHeight: items.length === 0 ? 0 : (row + 1) * rowHeight,
  };
}

interface BadgeDef {
  text: string;
  bg: RGB;
}

class ResumePdfBuilder {
  readonly pdfDoc: PDFDocument;
  readonly pages: PDFPage[] = [];
  currentPage!: PDFPage;
  y = A4_HEIGHT - MARGIN_TOP;

  serifBold!: PDFFont;
  sans!: PDFFont;
  sansBold!: PDFFont;
  sansItalic!: PDFFont;

  private constructor(pdfDoc: PDFDocument) {
    this.pdfDoc = pdfDoc;
  }

  static async create(title: string, author: string, now: Date): Promise<ResumePdfBuilder> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(sanitizePdfText(title));
    pdfDoc.setAuthor(sanitizePdfText(author));
    pdfDoc.setSubject(
      'Curriculum Vitae — Offensive Security, Full-Stack Engineering & AI Security Research'
    );
    pdfDoc.setKeywords([
      'Md. Redwan Ahmed',
      'Certified Ethical Hacker',
      'C|EH',
      'Penetration Testing',
      'VAPT',
      'Fast Cyber Defense',
      'Full-Stack Engineer',
    ]);
    pdfDoc.setCreator('redwan.work Live Resume Engine');
    pdfDoc.setProducer('redwan.work Dynamic PDF Generator (pdf-lib)');
    pdfDoc.setCreationDate(now);
    pdfDoc.setModificationDate(now);

    const builder = new ResumePdfBuilder(pdfDoc);
    builder.serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    builder.sans = await pdfDoc.embedFont(StandardFonts.Helvetica);
    builder.sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    builder.sansItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    builder.addPage(true);
    return builder;
  }

  addPage(isFirst = false) {
    const page = this.pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    this.pages.push(page);
    this.currentPage = page;
    this.y = A4_HEIGHT - (isFirst ? MARGIN_TOP : MARGIN_TOP + 2);

    // Subtle executive top accent strip
    page.drawRectangle({
      x: 0,
      y: A4_HEIGHT - 3,
      width: A4_WIDTH,
      height: 3,
      color: COLORS.blue,
    });
  }

  ensureSpace(requiredHeight: number) {
    if (this.y - requiredHeight < MARGIN_BOTTOM) {
      this.addPage(false);
    }
  }

  drawDivider(spaceBefore = 5, spaceAfter = 7) {
    this.y -= spaceBefore;
    this.ensureSpace(spaceAfter + 2);
    this.currentPage.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: MARGIN_X + CONTENT_WIDTH, y: this.y },
      thickness: 0.6,
      color: COLORS.divider,
    });
    this.y -= spaceAfter;
  }

  drawSectionHeader(title: string, minimumBodyHeight = 36) {
    const cleaned = sanitizePdfText(title);
    this.ensureSpace(24 + minimumBodyHeight);
    this.y -= 4;

    const textY = this.y - 11;
    // Left vertical blue bar matching PrintableResume
    this.currentPage.drawRectangle({
      x: MARGIN_X,
      y: textY - 1,
      width: 3,
      height: 11.5,
      color: COLORS.blue,
    });

    this.currentPage.drawText(cleaned, {
      x: MARGIN_X + 8,
      y: textY,
      size: 12,
      font: this.serifBold,
      color: COLORS.inkDark,
    });

    const ruleY = textY - 5;
    this.currentPage.drawLine({
      start: { x: MARGIN_X, y: ruleY },
      end: { x: MARGIN_X + CONTENT_WIDTH, y: ruleY },
      thickness: 1.2,
      color: COLORS.blue,
    });

    this.y = ruleY - 9;
  }

  drawWrappedParagraph(
    text: string,
    options?: {
      x?: number;
      maxWidth?: number;
      font?: PDFFont;
      size?: number;
      lineHeight?: number;
      color?: RGB;
    }
  ) {
    const x = options?.x ?? MARGIN_X;
    const maxWidth = options?.maxWidth ?? CONTENT_WIDTH;
    const font = options?.font ?? this.sans;
    const size = options?.size ?? 9;
    const lineHeight = options?.lineHeight ?? size * 1.45;
    const color = options?.color ?? COLORS.inkBody;

    const lines = wrapText(text, font, size, maxWidth);
    for (const line of lines) {
      this.ensureSpace(lineHeight + 2);
      this.currentPage.drawText(line, {
        x,
        y: this.y - size,
        size,
        font,
        color,
      });
      this.y -= lineHeight;
    }
  }

  drawPillList(labels: string[], x = MARGIN_X, maxWidth = CONTENT_WIDTH) {
    const { items } = layoutPills(labels, this.sans, 7.6, maxWidth, 5.5, 4, 15.5);
    if (items.length === 0) return;

    // Draw row-by-row so pills never get split across page breaks mid-row
    const rows = new Map<number, PillLayoutItem[]>();
    for (const item of items) {
      const list = rows.get(item.rowOffset) ?? [];
      list.push(item);
      rows.set(item.rowOffset, list);
    }

    for (const [, rowItems] of Array.from(rows.entries()).sort((a, b) => a[0] - b[0])) {
      this.ensureSpace(17);
      const rowBottomY = this.y - 13;
      for (const pill of rowItems) {
        this.currentPage.drawRectangle({
          x: x + pill.x,
          y: rowBottomY,
          width: pill.width,
          height: 12.5,
          color: COLORS.pillBg,
          borderColor: COLORS.border,
          borderWidth: 0.45,
        });
        this.currentPage.drawText(pill.label, {
          x: x + pill.x + 5.5,
          y: rowBottomY + 3.6,
          size: 7.6,
          font: this.sans,
          color: COLORS.inkBody,
        });
      }
      this.y -= 16;
    }
  }

  drawPeriodBadge(period: string, rightX: number, baselineY: number) {
    const cleaned = sanitizePdfText(period);
    if (!cleaned) return 0;
    const textW = this.sansBold.widthOfTextAtSize(cleaned, 7.6);
    const badgeW = textW + 10;
    const badgeX = rightX - badgeW;
    this.currentPage.drawRectangle({
      x: badgeX,
      y: baselineY - 3,
      width: badgeW,
      height: 12.5,
      color: COLORS.pillBg,
    });
    this.currentPage.drawText(cleaned, {
      x: badgeX + 5,
      y: baselineY + 0.3,
      size: 7.6,
      font: this.sansBold,
      color: COLORS.inkMuted,
    });
    return badgeW + 6;
  }

  drawBullets(highlights: string[], x = MARGIN_X + 6, maxWidth = CONTENT_WIDTH - 6) {
    for (const item of highlights) {
      const lines = wrapText(item, this.sans, 8.6, maxWidth - 10);
      if (lines.length === 0) continue;
      this.ensureSpace(13 * Math.min(2, lines.length));
      lines.forEach((line, idx) => {
        this.ensureSpace(12.5);
        if (idx === 0) {
          this.currentPage.drawText('•', {
            x,
            y: this.y - 8.5,
            size: 8.6,
            font: this.sansBold,
            color: COLORS.blue,
          });
        }
        this.currentPage.drawText(line, {
          x: x + 9,
          y: this.y - 8.5,
          size: 8.6,
          font: this.sans,
          color: COLORS.inkBody,
        });
        this.y -= 12.2;
      });
    }
  }

  drawFooters(ownerName: string, generatedAt: Date) {
    const total = this.pages.length;
    const isoDate = generatedAt.toISOString().slice(0, 10);
    const safeOwner = sanitizePdfText(ownerName);

    this.pages.forEach((page, index) => {
      const lineY = 27;
      page.drawLine({
        start: { x: MARGIN_X, y: lineY },
        end: { x: MARGIN_X + CONTENT_WIDTH, y: lineY },
        thickness: 0.4,
        color: COLORS.divider,
      });

      const leftText = `${safeOwner} · Live CV from redwan.work · Generated ${isoDate}`;
      page.drawText(leftText, {
        x: MARGIN_X,
        y: 16,
        size: 7.2,
        font: this.sans,
        color: COLORS.inkLight,
      });

      const pageLabel = `Page ${index + 1} of ${total}`;
      const labelW = this.sans.widthOfTextAtSize(pageLabel, 7.2);
      page.drawText(pageLabel, {
        x: MARGIN_X + CONTENT_WIDTH - labelW,
        y: 16,
        size: 7.2,
        font: this.sans,
        color: COLORS.inkLight,
      });
    });
  }
}

export async function generateResumePdf(input: GenerateResumePdfInput): Promise<Uint8Array> {
  const { settings, items, cehLogoBytes } = input;
  const generatedAt = input.generatedAt ?? new Date();

  const fullName = settings.full_name || 'Md. Redwan Ahmed';
  const roleTitle =
    settings.role_title || 'Founder & CEO, Fast Cyber Defense · CSE Professional';
  const subtitle =
    settings.subtitle ||
    'Certified Ethical Hacker (C|EH) · Offensive Security & Full-Stack/Cloud Architect · Researcher';
  const email = settings.email || 'contact@redwan.work';
  const phone = settings.phone || '+88017-7638-7624';
  const location = settings.location || 'Dhaka, BD';
  const linkedinUrl = settings.linkedin_url || 'https://www.linkedin.com/in/redwancse';
  const githubUrl = settings.github_url || 'https://github.com/redwan-cse';
  const rawWebsiteUrl = settings.website_url || 'https://redwan.work';
  const websiteUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(rawWebsiteUrl)
    ? 'https://redwan.work'
    : rawWebsiteUrl;

  const builder = await ResumePdfBuilder.create(`${fullName} Resume`, fullName, generatedAt);
  const { pdfDoc } = builder;

  let cehImage: PDFImage | null = null;
  if (cehLogoBytes && cehLogoBytes.byteLength > 0) {
    try {
      cehImage = await pdfDoc.embedJpg(cehLogoBytes);
    } catch {
      try {
        cehImage = await pdfDoc.embedPng(cehLogoBytes);
      } catch {
        cehImage = null;
      }
    }
  }

  // ===== 1. HEADER =====
  builder.currentPage.drawText(sanitizePdfText(fullName), {
    x: MARGIN_X,
    y: builder.y - 22,
    size: 23,
    font: builder.serifBold,
    color: COLORS.inkDark,
  });
  builder.y -= 28;

  builder.drawWrappedParagraph(roleTitle.toUpperCase(), {
    font: builder.sansBold,
    size: 9.5,
    lineHeight: 13,
    color: COLORS.blue,
  });
  builder.y -= 1;

  builder.drawWrappedParagraph(subtitle, {
    font: builder.sans,
    size: 8.8,
    lineHeight: 12,
    color: COLORS.inkBody,
  });
  builder.y -= 3;

  // Clickable contact metadata bar
  const contactLinks: Array<{ label: string; href: string | null }> = [
    { label: email, href: `mailto:${email}` },
    { label: phone, href: `tel:${phone.replace(/[^+\d]/g, '')}` },
    { label: location, href: null },
    {
      label: `LinkedIn: ${linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, '')}`,
      href: linkedinUrl,
    },
    {
      label: `GitHub: ${githubUrl.replace(/^https?:\/\/(www\.)?github\.com\//i, '')}`,
      href: githubUrl,
    },
    {
      label: websiteUrl.replace(/^https?:\/\//i, ''),
      href: websiteUrl,
    },
  ];

  let contactX = MARGIN_X;
  let contactRowY = builder.y - 9;
  for (let i = 0; i < contactLinks.length; i += 1) {
    const item = contactLinks[i];
    const clean = sanitizePdfText(item.label);
    const sep = i < contactLinks.length - 1 ? '  |  ' : '';
    const itemW = builder.sans.widthOfTextAtSize(clean, 8.2);
    const sepW = builder.sans.widthOfTextAtSize(sep, 8.2);

    if (contactX > MARGIN_X && contactX + itemW > MARGIN_X + CONTENT_WIDTH) {
      contactX = MARGIN_X;
      contactRowY -= 12;
      builder.y -= 12;
    }

    builder.currentPage.drawText(clean, {
      x: contactX,
      y: contactRowY,
      size: 8.2,
      font: item.href ? builder.sansBold : builder.sans,
      color: item.href ? COLORS.blue : COLORS.inkMuted,
    });
    if (item.href) {
      addUriAnnotation(pdfDoc, builder.currentPage, contactX, contactRowY - 2, itemW, 11, item.href);
    }

    contactX += itemW;
    if (sep && contactX + sepW <= MARGIN_X + CONTENT_WIDTH) {
      builder.currentPage.drawText(sep, {
        x: contactX,
        y: contactRowY,
        size: 8.2,
        font: builder.sans,
        color: COLORS.inkLight,
      });
      contactX += sepW;
    }
  }
  builder.y = contactRowY - 6;
  builder.drawDivider(2, 6);

  // ===== 2. SUMMARY =====
  if (settings.executive_summary) {
    builder.drawSectionHeader('Summary', 42);
    builder.drawWrappedParagraph(settings.executive_summary, {
      font: builder.sans,
      size: 8.8,
      lineHeight: 12.6,
      color: COLORS.inkBody,
    });
    builder.y -= 3;
  }

  // ===== 3. RESEARCH INTERESTS =====
  const researchInterests =
    settings.research_interests && settings.research_interests.length > 0
      ? settings.research_interests
      : ['Cyber Security', 'Machine Learning', 'Artificial Intelligence'];

  if (researchInterests.length > 0) {
    builder.drawSectionHeader('Research Interests', 26);
    builder.drawPillList(researchInterests);
    builder.y -= 2;
  }

  // ===== 4. PROFESSIONAL EXPERIENCE =====
  const experience = items.filter((i) => i.section === 'experience');
  if (experience.length > 0) {
    builder.drawSectionHeader('Professional Experience', 56);
    for (const exp of experience) {
      const titleLines = wrapText(exp.title, builder.sansBold, 9.6, CONTENT_WIDTH - 120);
      const headerHeight = titleLines.length * 12.5 + 24;
      builder.ensureSpace(headerHeight + Math.min(exp.highlights.length, 1) * 14);

      const firstBaselineY = builder.y - 10;
      titleLines.forEach((line, idx) => {
        builder.currentPage.drawText(line, {
          x: MARGIN_X,
          y: firstBaselineY - idx * 12,
          size: 9.6,
          font: builder.sansBold,
          color: COLORS.inkDark,
        });
      });

      if (exp.period) {
        builder.drawPeriodBadge(exp.period, MARGIN_X + CONTENT_WIDTH, firstBaselineY);
      }

      builder.y -= titleLines.length * 12 + 2;

      const orgText = sanitizePdfText(exp.organization);
      const orgBaselineY = builder.y - 8;
      builder.currentPage.drawText(orgText, {
        x: MARGIN_X,
        y: orgBaselineY,
        size: 8.9,
        font: builder.sansBold,
        color: COLORS.blue,
      });
      if (exp.verification_url) {
        const orgW = builder.sansBold.widthOfTextAtSize(orgText, 8.9);
        addUriAnnotation(
          pdfDoc,
          builder.currentPage,
          MARGIN_X,
          orgBaselineY - 2,
          orgW,
          11,
          exp.verification_url
        );
      }
      builder.y -= 11;

      const metaParts = [exp.role_type, exp.location].filter(Boolean).join(' · ');
      if (metaParts) {
        builder.currentPage.drawText(sanitizePdfText(metaParts), {
          x: MARGIN_X,
          y: builder.y - 7.5,
          size: 8,
          font: builder.sansItalic,
          color: COLORS.inkMuted,
        });
        builder.y -= 10.5;
      }

      if (exp.highlights.length > 0) {
        builder.drawBullets(exp.highlights);
      }
      builder.y -= 5;
    }
  }

  // ===== 5. EDUCATION =====
  const education = items.filter((i) => i.section === 'education');
  if (education.length > 0) {
    builder.drawSectionHeader('Education', 42);
    for (const edu of education) {
      builder.ensureSpace(34);
      const baselineY = builder.y - 9.5;
      builder.currentPage.drawText(sanitizePdfText(edu.title), {
        x: MARGIN_X,
        y: baselineY,
        size: 9.5,
        font: builder.sansBold,
        color: COLORS.inkDark,
      });
      if (edu.period) {
        builder.drawPeriodBadge(edu.period, MARGIN_X + CONTENT_WIDTH, baselineY);
      }
      builder.y -= 13;

      const orgLocation = [edu.organization, edu.location].filter(Boolean).join(' · ');
      builder.currentPage.drawText(sanitizePdfText(orgLocation), {
        x: MARGIN_X,
        y: builder.y - 8,
        size: 8.5,
        font: builder.sans,
        color: COLORS.blue,
      });
      builder.y -= 15;
    }
  }

  // ===== 6. TECHNICAL SKILLS =====
  const techEntries = Object.entries(settings.technical_skills ?? {});
  if (techEntries.length > 0) {
    builder.drawSectionHeader('Technical Skills', 44);
    for (const [category, skills] of techEntries) {
      if (!Array.isArray(skills) || skills.length === 0) continue;
      builder.ensureSpace(28);
      builder.currentPage.drawText(sanitizePdfText(category), {
        x: MARGIN_X,
        y: builder.y - 9,
        size: 8.8,
        font: builder.sansBold,
        color: COLORS.inkDark,
      });
      builder.y -= 13;
      builder.drawPillList(skills);
      builder.y -= 2;
    }
  }

  // ===== 7 & 8. CERTIFICATIONS GRIDS (2-Column Cards) =====
  const drawCertificateGrid = (heading: string, certs: ResumeItemRecord[]) => {
    if (certs.length === 0) return;
    builder.drawSectionHeader(heading, 52);

    const colGap = 10;
    const cardWidth = (CONTENT_WIDTH - colGap) / 2;

    for (let i = 0; i < certs.length; i += 2) {
      const pair = [certs[i], certs[i + 1]].filter(Boolean) as ResumeItemRecord[];
      const cardHeights = pair.map((cert) => {
        const titleLines = wrapText(cert.title, builder.sansBold, 8.6, cardWidth - 16);
        const orgLines = wrapText(cert.organization, builder.sans, 7.8, cardWidth - 16);
        return Math.max(40, 12 + titleLines.length * 10.5 + orgLines.length * 9.5 + 11);
      });
      const rowH = Math.max(...cardHeights);
      builder.ensureSpace(rowH + 6);

      const cardTopY = builder.y;
      pair.forEach((cert, colIdx) => {
        const cardX = MARGIN_X + colIdx * (cardWidth + colGap);
        const cardBottomY = cardTopY - rowH;

        builder.currentPage.drawRectangle({
          x: cardX,
          y: cardBottomY,
          width: cardWidth,
          height: rowH,
          color: COLORS.surface,
        });
        builder.currentPage.drawRectangle({
          x: cardX,
          y: cardBottomY,
          width: 2.2,
          height: rowH,
          color: COLORS.blue,
        });

        let textY = cardTopY - 12;
        const titleLines = wrapText(cert.title, builder.sansBold, 8.6, cardWidth - 16);
        for (const line of titleLines) {
          builder.currentPage.drawText(line, {
            x: cardX + 8,
            y: textY,
            size: 8.6,
            font: builder.sansBold,
            color: cert.verification_url ? COLORS.blue : COLORS.inkDark,
          });
          textY -= 10.5;
        }

        const orgLines = wrapText(cert.organization, builder.sans, 7.8, cardWidth - 16);
        for (const line of orgLines) {
          builder.currentPage.drawText(line, {
            x: cardX + 8,
            y: textY,
            size: 7.8,
            font: builder.sans,
            color: COLORS.inkMuted,
          });
          textY -= 9.5;
        }

        if (cert.period) {
          builder.currentPage.drawText(sanitizePdfText(cert.period), {
            x: cardX + 8,
            y: cardBottomY + 5.5,
            size: 7.3,
            font: builder.sansItalic,
            color: COLORS.inkLight,
          });
        }

        if (cert.verification_url) {
          addUriAnnotation(
            pdfDoc,
            builder.currentPage,
            cardX,
            cardBottomY,
            cardWidth,
            rowH,
            cert.verification_url
          );
        }
      });

      builder.y = cardTopY - rowH - 6;
    }
  };

  drawCertificateGrid(
    'Certifications',
    items.filter((i) => i.section === 'vendor_certification')
  );
  drawCertificateGrid(
    'Professional Certificates & Course Completions',
    items.filter((i) => i.section === 'professional_certificate')
  );

  // ===== 9. RESEARCH & PUBLICATIONS =====
  const researchItems = items.filter((i) => i.section === 'research');
  if (researchItems.length > 0) {
    builder.drawSectionHeader('Research & Publications', 68);
    for (const pub of researchItems) {
      const titleLines = wrapText(pub.title, builder.sansBold, 9.2, CONTENT_WIDTH - 20);
      const wrappedDetails = pub.highlights.map((detail) =>
        wrapText(detail, builder.sans, 8.2, CONTENT_WIDTH - 28)
      );
      const detailLineCount = wrappedDetails.reduce((sum, lines) => sum + lines.length, 0);
      const cardH = 26 + titleLines.length * 11.5 + detailLineCount * 11.2 + 10;
      builder.ensureSpace(cardH + 6);

      const cardTopY = builder.y;
      const cardBottomY = cardTopY - cardH;
      builder.currentPage.drawRectangle({
        x: MARGIN_X,
        y: cardBottomY,
        width: CONTENT_WIDTH,
        height: cardH,
        color: COLORS.surface,
      });
      builder.currentPage.drawRectangle({
        x: MARGIN_X,
        y: cardBottomY,
        width: 2.4,
        height: cardH,
        color: COLORS.blue,
      });

      const badges: BadgeDef[] = [];
      const orgLabel = (pub.organization || 'Research').toUpperCase();
      badges.push({ text: orgLabel, bg: COLORS.blue });
      const badgeStr = pub.badge_label || '';
      if (/Q1/i.test(badgeStr)) badges.push({ text: 'Q1', bg: COLORS.emerald });
      if (/SCOPUS/i.test(badgeStr)) badges.push({ text: 'SCOPUS', bg: COLORS.violet });
      if (/IEEE/i.test(badgeStr)) badges.push({ text: 'IEEE', bg: COLORS.crimson });
      if (badges.length === 1 && badgeStr) {
        badges.push({ text: badgeStr.toUpperCase(), bg: COLORS.emerald });
      }

      let bx = MARGIN_X + 9;
      const badgeY = cardTopY - 16;
      for (const b of badges) {
        const safeB = sanitizePdfText(b.text);
        const bw = builder.sansBold.widthOfTextAtSize(safeB, 6.8) + 9;
        builder.currentPage.drawRectangle({
          x: bx,
          y: badgeY,
          width: bw,
          height: 11,
          color: b.bg,
        });
        builder.currentPage.drawText(safeB, {
          x: bx + 4.5,
          y: badgeY + 3,
          size: 6.8,
          font: builder.sansBold,
          color: COLORS.white,
        });
        bx += bw + 4;
      }

      let cursorY = badgeY - 13;
      const titleTopY = cursorY;
      for (const line of titleLines) {
        builder.currentPage.drawText(line, {
          x: MARGIN_X + 9,
          y: cursorY,
          size: 9.2,
          font: builder.sansBold,
          color: pub.verification_url ? COLORS.blue : COLORS.inkDark,
        });
        cursorY -= 11.5;
      }
      if (pub.verification_url) {
        addUriAnnotation(
          pdfDoc,
          builder.currentPage,
          MARGIN_X + 9,
          cursorY + 3,
          CONTENT_WIDTH - 20,
          titleTopY - cursorY + 8,
          pub.verification_url
        );
      }

      cursorY -= 2;
      for (const detail of pub.highlights) {
        const detailLines = wrapText(detail, builder.sans, 8.2, CONTENT_WIDTH - 28);
        detailLines.forEach((line, lineIdx) => {
          if (lineIdx === 0) {
            builder.currentPage.drawText('•', {
              x: MARGIN_X + 12,
              y: cursorY,
              size: 8.2,
              font: builder.sansBold,
              color: COLORS.blue,
            });
          }
          builder.currentPage.drawText(line, {
            x: MARGIN_X + 20,
            y: cursorY,
            size: 8.2,
            font: builder.sans,
            color: COLORS.inkBody,
          });
          cursorY -= 11.2;
        });
      }

      builder.y = cardBottomY - 6;
    }
  }

  // ===== 10. LEADERSHIP EXPERIENCE =====
  const leadership = items.filter((i) => i.section === 'leadership');
  if (leadership.length > 0) {
    builder.drawSectionHeader('Leadership Experience', 46);
    for (const role of leadership) {
      builder.ensureSpace(32 + Math.min(role.highlights.length, 1) * 14);
      const baselineY = builder.y - 9.5;
      builder.currentPage.drawText(sanitizePdfText(role.title), {
        x: MARGIN_X,
        y: baselineY,
        size: 9.4,
        font: builder.sansBold,
        color: COLORS.inkDark,
      });
      if (role.period) {
        builder.drawPeriodBadge(role.period, MARGIN_X + CONTENT_WIDTH, baselineY);
      }
      builder.y -= 13;

      builder.currentPage.drawText(sanitizePdfText(role.organization), {
        x: MARGIN_X,
        y: builder.y - 8,
        size: 8.7,
        font: builder.sansBold,
        color: COLORS.blue,
      });
      builder.y -= 12;

      if (role.highlights.length > 0) {
        builder.drawBullets(role.highlights);
      }
      builder.y -= 4;
    }
  }

  // ===== 11. ADDITIONAL SKILLS & LANGUAGES =====
  const softSkills = settings.soft_skills ?? [];
  const otherSkills = settings.other_skills ?? [];
  if (softSkills.length > 0 || otherSkills.length > 0) {
    builder.drawSectionHeader('Additional Skills', 44);
    if (softSkills.length > 0) {
      builder.ensureSpace(24);
      builder.currentPage.drawText('Soft & Leadership Skills', {
        x: MARGIN_X,
        y: builder.y - 8.5,
        size: 8.6,
        font: builder.sansBold,
        color: COLORS.inkDark,
      });
      builder.y -= 12;
      builder.drawPillList(softSkills);
      builder.y -= 2;
    }
    if (otherSkills.length > 0) {
      builder.ensureSpace(24);
      builder.currentPage.drawText('Workplace & Operational Tools', {
        x: MARGIN_X,
        y: builder.y - 8.5,
        size: 8.6,
        font: builder.sansBold,
        color: COLORS.inkDark,
      });
      builder.y -= 12;
      builder.drawPillList(otherSkills);
      builder.y -= 2;
    }
  }

  // Languages (2-col clean boxes)
  builder.drawSectionHeader('Languages', 26);
  builder.ensureSpace(24);
  const langBoxW = (CONTENT_WIDTH - 10) / 2;
  const languages = [
    { name: 'Bengali', level: 'Native' },
    { name: 'English', level: 'Fluent' },
  ];
  const langBottomY = builder.y - 18;
  languages.forEach((lang, idx) => {
    const lx = MARGIN_X + idx * (langBoxW + 10);
    builder.currentPage.drawRectangle({
      x: lx,
      y: langBottomY,
      width: langBoxW,
      height: 18,
      color: COLORS.surface,
    });
    builder.currentPage.drawText(lang.name, {
      x: lx + 8,
      y: langBottomY + 6,
      size: 8.5,
      font: builder.sansBold,
      color: COLORS.inkDark,
    });
    const lvlW = builder.sansBold.widthOfTextAtSize(lang.level, 8.2);
    builder.currentPage.drawText(lang.level, {
      x: lx + langBoxW - lvlW - 8,
      y: langBottomY + 6,
      size: 8.2,
      font: builder.sansBold,
      color: COLORS.blue,
    });
  });
  builder.y = langBottomY - 8;

  // ===== 12. HOBBIES & INTERESTS =====
  const hobbies = settings.hobbies ?? [];
  if (hobbies.length > 0) {
    builder.drawSectionHeader('Hobbies & Interests', 48);
    const colGap = 10;
    const cardW = (CONTENT_WIDTH - colGap) / 2;
    for (let i = 0; i < hobbies.length; i += 2) {
      const pair = [hobbies[i], hobbies[i + 1]].filter(Boolean);
      const heights = pair.map((h) => {
        const descLines = wrapText(h.description, builder.sans, 7.6, cardW - 14);
        return Math.max(36, 18 + descLines.length * 10);
      });
      const rowH = Math.max(...heights);
      builder.ensureSpace(rowH + 6);

      const topY = builder.y;
      const bottomY = topY - rowH;
      pair.forEach((hobby, colIdx) => {
        const cx = MARGIN_X + colIdx * (cardW + colGap);
        builder.currentPage.drawRectangle({
          x: cx,
          y: bottomY,
          width: cardW,
          height: rowH,
          color: COLORS.surface,
        });
        builder.currentPage.drawRectangle({
          x: cx,
          y: bottomY,
          width: 2,
          height: rowH,
          color: COLORS.divider,
        });
        builder.currentPage.drawText(sanitizePdfText(hobby.name), {
          x: cx + 7,
          y: topY - 12,
          size: 8.5,
          font: builder.sansBold,
          color: COLORS.inkDark,
        });
        const descLines = wrapText(hobby.description, builder.sans, 7.6, cardW - 14);
        let dy = topY - 22;
        for (const line of descLines) {
          builder.currentPage.drawText(line, {
            x: cx + 7,
            y: dy,
            size: 7.6,
            font: builder.sans,
            color: COLORS.inkMuted,
          });
          dy -= 10;
        }
      });
      builder.y = bottomY - 6;
    }
  }

  // ===== 13. ACADEMIC REFERENCES =====
  const references = settings.references_list ?? [];
  if (references.length > 0) {
    builder.drawSectionHeader('References', 66);
    const colGap = 10;
    const cardW = (CONTENT_WIDTH - colGap) / 2;
    for (let i = 0; i < references.length; i += 2) {
      const pair = [references[i], references[i + 1]].filter(Boolean);
      const heights = pair.map((ref) => {
        const titleLines = wrapText(ref.title, builder.sans, 7.8, cardW - 16);
        const instLines = wrapText(ref.institution, builder.sans, 7.6, cardW - 16);
        return Math.max(66, 20 + titleLines.length * 10 + instLines.length * 9.5 + 24);
      });
      const rowH = Math.max(...heights);
      builder.ensureSpace(rowH + 6);

      const topY = builder.y;
      const bottomY = topY - rowH;
      pair.forEach((ref, colIdx) => {
        const cx = MARGIN_X + colIdx * (cardW + colGap);
        builder.currentPage.drawRectangle({
          x: cx,
          y: bottomY,
          width: cardW,
          height: rowH,
          color: COLORS.surface,
        });
        builder.currentPage.drawRectangle({
          x: cx,
          y: bottomY,
          width: 2.2,
          height: rowH,
          color: COLORS.blue,
        });

        let ty = topY - 12;
        const safeName = sanitizePdfText(ref.name);
        const scholarHref = ref.scholarUrl ? sanitizeHttpUrl(ref.scholarUrl) : null;
        builder.currentPage.drawText(safeName, {
          x: cx + 8,
          y: ty,
          size: 9,
          font: builder.sansBold,
          color: COLORS.inkDark,
        });
        if (scholarHref) {
          const nameW = builder.sansBold.widthOfTextAtSize(safeName, 9);
          addUriAnnotation(pdfDoc, builder.currentPage, cx + 8, ty - 2, nameW, 11, scholarHref);
        }
        ty -= 11.5;

        const titleLines = wrapText(ref.title, builder.sans, 7.8, cardW - 16);
        for (const line of titleLines) {
          builder.currentPage.drawText(line, {
            x: cx + 8,
            y: ty,
            size: 7.8,
            font: builder.sans,
            color: COLORS.blue,
          });
          ty -= 10;
        }

        const instLines = wrapText(ref.institution, builder.sans, 7.6, cardW - 16);
        for (const line of instLines) {
          builder.currentPage.drawText(line, {
            x: cx + 8,
            y: ty,
            size: 7.6,
            font: builder.sans,
            color: COLORS.inkMuted,
          });
          ty -= 9.5;
        }

        ty -= 2;
        const safeEmail = sanitizePdfText(ref.email);
        builder.currentPage.drawText(safeEmail, {
          x: cx + 8,
          y: ty,
          size: 7.6,
          font: builder.sans,
          color: COLORS.inkMuted,
        });
        const emailW = builder.sans.widthOfTextAtSize(safeEmail, 7.6);
        addUriAnnotation(pdfDoc, builder.currentPage, cx + 8, ty - 2, emailW, 10, `mailto:${safeEmail}`);

        ty -= 10;
        builder.currentPage.drawText(sanitizePdfText(ref.phone), {
          x: cx + 8,
          y: ty,
          size: 7.6,
          font: builder.sans,
          color: COLORS.inkMuted,
        });
      });
      builder.y = bottomY - 6;
    }
  }

  // ===== 14. LOWER-RIGHT OFFICIAL EC-COUNCIL C|EH LOGO (SECTION 6c) =====
  const stampHeight = 64;
  builder.ensureSpace(stampHeight + 12);
  builder.drawDivider(6, 8);

  const logoBoxW = 78;
  const logoBoxH = 54;
  const logoBoxX = MARGIN_X + CONTENT_WIDTH - logoBoxW;
  const logoBoxY = builder.y - logoBoxH;

  builder.currentPage.drawRectangle({
    x: logoBoxX,
    y: logoBoxY,
    width: logoBoxW,
    height: logoBoxH,
    color: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 0.6,
  });

  if (cehImage) {
    const pad = 6;
    const availW = logoBoxW - pad * 2;
    const availH = logoBoxH - pad * 2;
    const scale = Math.min(availW / cehImage.width, availH / cehImage.height);
    const drawW = cehImage.width * scale;
    const drawH = cehImage.height * scale;
    builder.currentPage.drawImage(cehImage, {
      x: logoBoxX + (logoBoxW - drawW) / 2,
      y: logoBoxY + (logoBoxH - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  } else {
    builder.currentPage.drawText('C|EH', {
      x: logoBoxX + 24,
      y: logoBoxY + 22,
      size: 14,
      font: builder.sansBold,
      color: COLORS.crimson,
    });
  }
  addUriAnnotation(
    pdfDoc,
    builder.currentPage,
    logoBoxX,
    logoBoxY,
    logoBoxW,
    logoBoxH,
    CEH_VERIFICATION_URL
  );

  const stampRightTextX = logoBoxX - 10;
  const line1 = 'Certified Ethical Hacker (C|EH) - ANSI / ISO/IEC 17024 Accredited';
  const line2 = `EC-Council Certification Number: ${CEH_CERT_NUMBER} · Issued: 10 Nov 2026`;
  const line3 = 'Verify Credential: aspen.eccouncil.org/VerifyBadge';

  const drawRightText = (text: string, yPos: number, font: PDFFont, size: number, color: RGB) => {
    const safe = sanitizePdfText(text);
    const w = font.widthOfTextAtSize(safe, size);
    builder.currentPage.drawText(safe, {
      x: stampRightTextX - w,
      y: yPos,
      size,
      font,
      color,
    });
    return { x: stampRightTextX - w, w };
  };

  drawRightText(line1, logoBoxY + 38, builder.sansBold, 8, COLORS.inkDark);
  drawRightText(line2, logoBoxY + 25, builder.sans, 7.6, COLORS.inkMuted);
  const verifyBox = drawRightText(line3, logoBoxY + 12, builder.sansBold, 7.6, COLORS.blue);
  addUriAnnotation(
    pdfDoc,
    builder.currentPage,
    verifyBox.x,
    logoBoxY + 10,
    verifyBox.w,
    11,
    CEH_VERIFICATION_URL
  );

  builder.y = logoBoxY - 8;

  // Apply repeating footer with page counts & live generation date
  builder.drawFooters(fullName, generatedAt);

  return pdfDoc.save();
}
