import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const OVERVIEW = [
  { title: 'Open tickets', value: '0', caption: 'Ticketing arrives in P3b' },
  { title: 'Unpaid invoices', value: '0', caption: 'Invoicing arrives in P4b' },
  { title: 'Recent leads', value: '—', caption: 'Lead inbox arrives in P3b' },
];

export default function AdminOverviewPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {OVERVIEW.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.caption}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
