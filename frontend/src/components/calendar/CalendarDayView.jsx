import { buildDayTimeSlots, formatDateParam, formatTimeLabel } from '../../utils/calendar-date';
import { groupByLocalDate } from '../../utils/schedule-grouping';

export default function CalendarDayView({
  referenceDate,
  schedules,
  loading,
  error,
  onScheduleClick,
}) {
  const timeSlots = buildDayTimeSlots(referenceDate);
  const schedulesByDate = groupByLocalDate(schedules, (s) => new Date(s.startAt));
  const daySchedules = schedulesByDate.get(formatDateParam(referenceDate)) ?? [];

  return (
    <div>
      {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중...</p>}
      {error && <div className="error-text">{error.message ?? '일정을 불러오지 못했습니다.'}</div>}

      <table>
        <tbody>
          {timeSlots.map((slot) => {
            const slotSchedules = daySchedules.filter(
              (schedule) => new Date(schedule.startAt).getHours() === slot.getHours(),
            );
            return (
              <tr key={slot.getHours()}>
                <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {formatTimeLabel(slot)}
                </td>
                <td style={{ verticalAlign: 'top' }}>
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
                        {`${formatTimeLabel(new Date(schedule.startAt))}~${formatTimeLabel(new Date(schedule.endAt))} ${schedule.title}`}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
