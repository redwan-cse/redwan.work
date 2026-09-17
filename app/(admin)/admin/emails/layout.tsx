import Link from 'next/link';
export default function EmailLayout({children}:{children:React.ReactNode}) {return <div className="space-y-5"><nav aria-label="Email views" className="flex gap-4 text-sm"><Link className="underline" href="/admin/emails">Attempt history</Link><Link className="underline" href="/admin/emails/outbox">Durable queue</Link></nav>{children}</div>;}
