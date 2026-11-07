import { MarketingFrame } from '@/components/marketing-frame';

export default function ResumeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingFrame>{children}</MarketingFrame>;
}
