import { buildMonthGrid, formatDateParam } from '../../utils/calendar-date';
import { groupByLocalDate } from '../../utils/schedule-grouping';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function CalendarMonthView({
  referenceDate,
  schedules,
  loading,
  error,
  onScheduleClick,
}) {
  const weeks = buildMonthGrid(referenceDate);
  const schedulesByDate = groupByLocalDate(schedules, (s) => new Date(s.startAt));

  return (
    <div>
      {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중...</p>}
      {error && <div className="error-text">{error.message ?? '일정을 불러오지 못했습니다.'}</div>}

      <table>
        <thead>
          <tr>
            {WEEKDAY_LABELS.map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={formatDateParam(week[0].date)}>
              {week.map((cell) => {
                const key = formatDateParam(cell.date);
                const daySchedules = schedulesByDate.get(key) ?? [];
                return (
                  <td
                    key={key}
                    style={{
                      verticalAlign: 'top',
                      maxHeight: 120,
                      overflowY: 'auto',
                    }}
                  >
                    <div
                      style={{
                        color: cell.isCurrentMonth ? 'var(--text)' : 'var(--text-muted)',
                        fontSize: 13,
                        marginBottom: 4,
                      }}
                    >
                      {cell.date.getDate()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {daySchedules.map((schedule) => (
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
