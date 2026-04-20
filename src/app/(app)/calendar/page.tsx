import { CalendarTabs } from './CalendarTabs';

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">Your attendance and leave, or the team's</p>
      </header>
      <CalendarTabs />
    </div>
  );
}
