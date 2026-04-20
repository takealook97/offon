import { CalendarTabs } from './CalendarTabs';

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">캘린더</h1>
        <p className="text-sm text-muted-foreground">내 근태·연차 또는 팀 연차를 확인합니다</p>
      </header>
      <CalendarTabs />
    </div>
  );
}
