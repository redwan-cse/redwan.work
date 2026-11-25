'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
} from 'lucide-react';
import { uploadResumePdfAction } from '@/lib/cms/actions';
import { formatBytes } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

export function ResumePdfManager({
  initialUrl,
  r2Configured,
}: {
  initialUrl: string;
  r2Configured: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentUrl, setCurrentUrl] = useState(initialUrl || '/resume.pdf');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    url: string;
    size: number;
    uploadedAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const isR2Hosted =
    currentUrl.startsWith('https://') || currentUrl.startsWith('http://');

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessInfo(null);

    if (!selectedFile) {
      setError('Please select a PDF file first.');
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Only .pdf files are allowed for the resume.');
      return;
    }

    if (selectedFile.size < 1 || selectedFile.size > MAX_RESUME_BYTES) {
      setError(
        `Resume PDF must be between 1 byte and ${formatBytes(MAX_RESUME_BYTES)}.`
      );
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('resume_pdf', selectedFile);

      const res = await uploadResumePdfAction(formData);
      if (!res.ok || !res.url) {
        setError(res.error ?? 'Failed to upload resume PDF to R2.');
        return;
      }

      setCurrentUrl(res.url);
      setSuccessInfo({
        url: res.url,
        size: res.size ?? selectedFile.size,
        uploadedAt: res.uploadedAt ?? new Date().toISOString(),
      });
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unexpected error during upload.'
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy URL automatically. Please copy it manually.');
    }
  }

  return (
    <Card className="border-primary/40 bg-card/95 shadow-xs">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" />
            Downloadable Resume PDF (Cloudflare R2 Public Bucket)
          </CardTitle>
          <Badge
            variant={isR2Hosted ? 'default' : 'secondary'}
            className="font-mono text-[11px]"
          >
            {isR2Hosted
              ? 'R2 Public Bucket Active'
              : r2Configured
                ? 'R2 Ready · Using Fallback Path'
                : 'R2 Not Configured'}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Your pre-formatted resume PDF is stored directly in the Cloudflare R2
          public bucket (assets/resume/Md_Redwan_Ahmed_Resume.pdf) and served
          via CDN without runtime PDF generation. Upload a new .pdf here any
          time to replace it immediately.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2.5 rounded-xl border border-border/80 bg-background/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Active Resume PDF URL (site_settings.resume_pdf_url)
            </p>
            <p className="truncate font-mono text-xs text-foreground">
              {currentUrl}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyUrl}
              className="h-8 gap-1.5 text-xs"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Copied!' : 'Copy URL'}
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              <a href="/resume.pdf" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Inline Preview (/resume.pdf)
              </a>
            </Button>
            <Button
              asChild
              variant="default"
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                download="Md_Redwan_Ahmed_Resume.pdf"
              >
                <Download className="h-3.5 w-3.5" />
                Download Active PDF
              </a>
            </Button>
          </div>
        </div>

        <form
          onSubmit={handleUpload}
          className="grid gap-3 rounded-xl border border-dashed border-primary/35 bg-primary/5 p-4 sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <div className="space-y-1.5">
            <Label htmlFor="resume-pdf-upload" className="text-sm font-medium">
              Replace Resume PDF in R2 Public Bucket (.pdf, max{' '}
              {formatBytes(MAX_RESUME_BYTES)})
            </Label>
            <Input
              ref={fileInputRef}
              id="resume-pdf-upload"
              name="resume_pdf"
              type="file"
              accept=".pdf,application/pdf"
              disabled={isUploading}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
                setError(null);
                setSuccessInfo(null);
              }}
              className="h-10 cursor-pointer bg-background"
            />
            {selectedFile && (
              <p className="font-mono text-[11px] text-muted-foreground">
                Selected: <span className="text-foreground">{selectedFile.name}</span> (
                {formatBytes(selectedFile.size)})
              </p>
            )}
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={isUploading || !selectedFile}
            className="h-9 gap-1.5 rounded-full px-4"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading to R2...
              </>
            ) : (
              <>
                <CloudUpload className="h-4 w-4" />
                Upload &amp; Replace PDF
              </>
            )}
          </Button>
        </form>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
          >
            {error}
          </p>
        )}

        {successInfo && !error && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-semibold">
                Resume PDF uploaded to R2 public bucket and activated!
              </p>
              <p className="font-mono text-[11px] opacity-90">
                Size: {formatBytes(successInfo.size)} · URL: {successInfo.url}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
