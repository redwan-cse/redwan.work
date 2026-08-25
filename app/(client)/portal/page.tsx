import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const DASHBOARD = [
  { title: 'Active projects', value: '0', caption: 'Projects arrive in P4a' },
  { title: 'Open tickets', value: '0', caption: 'Tickets arrive in P3c' },
  { title: 'Outstanding invoice', value: '—', caption: 'Invoicing arrives in P4b' },
];

export default function PortalDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {DASHBOARD.map((item) => (
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
