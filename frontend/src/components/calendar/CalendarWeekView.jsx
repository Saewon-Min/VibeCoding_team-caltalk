import {
  buildWeekDays,
  buildDayTimeSlots,
  formatDateParam,
  formatTimeLabel,
} from '../../utils/calendar-date';
import { groupByLocalDate } from '../../utils/schedule-grouping';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDayLabel(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}(${WEEKDAY_LABELS[date.getDay()]})`;
}

export default function CalendarWeekView({
  referenceDate,
  schedules,
  loading,
  error,
  onScheduleClick,
  onDateClick,
}) {
  const days = buildWeekDays(referenceDate);
  const timeSlots = buildDayTimeSlots(referenceDate);
  const schedulesByDate = groupByLocalDate(schedules, (s) => new Date(s.startAt));

  return (
    <div>
      {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중...</p>}
      {error && <div className="error-text">{error.message ?? '일정을 불러오지 못했습니다.'}</div>}

      <table>
        <thead>
          <tr>
            <th></th>
            {days.map((day) => (
              <th key={formatDateParam(day)}>
                <button
                  type="button"
                  onClick={() => onDateClick(day)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {formatDayLabel(day)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((slot) => (
            <tr key={slot.getHours()}>
              <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                {formatTimeLabel(slot)}
              </td>
              {days.map((day) => {
                const dayKey = formatDateParam(day);
                const daySchedules = schedulesByDate.get(dayKey) ?? [];
                const slotSchedules = daySchedules.filter(
                  (schedule) => new Date(schedule.startAt).getHours() === slot.getHours(),
                );
                return (
                  <td key={dayKey} style={{ verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {slotSchedules.map((schedule) => (
                        <button
                          key={schedule.id}
                          type="button"
                          onClick={() => onScheduleClick(schedule)}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid var(--border)',
                            background: 'var(--bg)',
                            color: 'var(--text)',
                            fontSize: 12,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          {schedule.title}
                        </button>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
