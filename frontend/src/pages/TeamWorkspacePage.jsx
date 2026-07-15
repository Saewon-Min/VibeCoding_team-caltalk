import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import BackButton from '../components/common/BackButton';
import CalendarMonthView from '../components/calendar/CalendarMonthView';
import CalendarWeekView from '../components/calendar/CalendarWeekView';
import CalendarDayView from '../components/calendar/CalendarDayView';
import ChatHistory from '../components/chat/ChatHistory';
import ChatInput from '../components/chat/ChatInput';
import { useTeamSchedules } from '../hooks/useTeamSchedules';
import { useChatHistory } from '../hooks/useChatHistory';
import { useTeam } from '../context/TeamContext';
import { getMyTeams } from '../api/team.api';
import {
  addMonths,
  addWeeks,
  addDays,
  formatMonthLabel,
  formatWeekRangeLabel,
  formatDayViewLabel,
} from '../utils/calendar-date';

const TAB_ITEMS = [
  { key: 'month', label: '월간' },
  { key: 'week', label: '주간' },
  { key: 'day', label: '일간' },
];

function shiftDate(view, date, delta) {
  if (view === 'month') return addMonths(date, delta);
  if (view === 'week') return addWeeks(date, delta);
  return addDays(date, delta);
}

export default function TeamWorkspacePage() {
  const { teamId } = useParams();
  const [view, setView] = useState('month');
  const [date, setDate] = useState(() => new Date());
  const { currentTeam, selectTeam } = useTeam();
  const { schedules, loading, error } = useTeamSchedules(teamId, view, date);
  const {
    messages: chatMessages,
    loading: chatLoading,
    error: chatError,
    appendMessage,
  } = useChatHistory(teamId, date);

  useEffect(() => {
    if (String(currentTeam?.id) === String(teamId)) {
      return;
    }
    let cancelled = false;
    getMyTeams()
      .then((teams) => {
        if (cancelled) return;
        const matched = teams.find((team) => String(team.id) === String(teamId));
        if (matched) selectTeam(matched);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [teamId, currentTeam, selectTeam]);

  const handlePrev = () => setDate((current) => shiftDate(view, current, -1));
  const handleNext = () => setDate((current) => shiftDate(view, current, 1));

  const label =
    view === 'month'
      ? formatMonthLabel(date)
      : view === 'week'
        ? formatWeekRangeLabel(date)
        : formatDayViewLabel(date);

  return (
    <div className="page page--wide">
      <BackButton />
      <h2>팀 워크스페이스</h2>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {TAB_ITEMS.map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => setView(item.key)}
              style={
                view === item.key
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' }
              }
            >
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={handlePrev} aria-label="이전">
            {'<'}
          </button>
          <span>{label}</span>
          <button type="button" onClick={handleNext} aria-label="다음">
            {'>'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {view === 'month' && (
            <CalendarMonthView
              referenceDate={date}
              schedules={schedules}
              loading={loading}
              error={error}
              onScheduleClick={() => {}}
              onDateClick={setDate}
            />
          )}
          {view === 'week' && (
            <CalendarWeekView
              referenceDate={date}
              schedules={schedules}
              loading={loading}
              error={error}
              onScheduleClick={() => {}}
              onDateClick={setDate}
            />
          )}
          {view === 'day' && (
            <CalendarDayView
              referenceDate={date}
              schedules={schedules}
              loading={loading}
              error={error}
              onScheduleClick={() => {}}
            />
          )}
        </div>
        <div
          style={{
            width: 280,
            minHeight: 400,
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <ChatHistory messages={chatMessages} loading={chatLoading} error={chatError} />
          <ChatInput teamId={teamId} appendMessage={appendMessage} date={date} />
        </div>
      </div>
    </div>
  );
}
