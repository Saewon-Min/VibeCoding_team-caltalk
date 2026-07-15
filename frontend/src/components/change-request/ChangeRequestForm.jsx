import { useEffect, useState } from 'react';
import Button from '../common/Button';
import FormField from '../common/FormField';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { getSchedules, getScheduleDetail } from '../../api/schedule.api';
import { createChangeRequest } from '../../api/change-request.api';
import { formatDateParam } from '../../utils/calendar-date';
import { validateChangeRequestForm } from '../../utils/change-request-form';

const textareaStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 15,
  fontFamily: 'inherit',
  resize: 'vertical',
};

export default function ChangeRequestForm({
  teamId,
  date,
  appendMessage,
  onCancel,
  targetScheduleId,
}) {
  const { currentRole } = useTeam();
  const { user } = useAuth();

  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState(null);

  const [scheduleId, setScheduleId] = useState('');
  const [proposedTitle, setProposedTitle] = useState('');
  const [proposedStartAtInput, setProposedStartAtInput] = useState('');
  const [proposedEndAtInput, setProposedEndAtInput] = useState('');
  const [reason, setReason] = useState('');

  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const dateParam = date ? formatDateParam(date) : null;

  useEffect(() => {
    if (!teamId || !dateParam || currentRole === 'leader') return undefined;
    let cancelled = false;
    setCandidatesLoading(true);
    setCandidatesError(null);
    getSchedules(teamId, 'day', dateParam)
      .then((schedules) => Promise.all(schedules.map((s) => getScheduleDetail(teamId, s.id))))
      .then((details) => {
        if (cancelled) return;
        setCandidates(
          details.filter((d) => (d.participants ?? []).some((p) => p.userId === user.id)),
        );
      })
      .catch((err) => {
        if (!cancelled) setCandidatesError(err);
      })
      .finally(() => {
        if (!cancelled) setCandidatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, dateParam, currentRole, user.id]);

  useEffect(() => {
    if (targetScheduleId != null) {
      setScheduleId(String(targetScheduleId));
    }
  }, [targetScheduleId]);

  if (currentRole === 'leader') {
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validationErrors = validateChangeRequestForm({ scheduleId, reason });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitError('');
    setSubmitting(true);

    const payload = {
      reason: reason.trim(),
      proposedTitle: proposedTitle.trim() === '' ? undefined : proposedTitle.trim(),
      proposedStartAt: proposedStartAtInput
        ? new Date(proposedStartAtInput).toISOString()
        : undefined,
      proposedEndAt: proposedEndAtInput ? new Date(proposedEndAtInput).toISOString() : undefined,
    };

    try {
      const changeRequest = await createChangeRequest(teamId, scheduleId, payload);
      appendMessage({
        id: changeRequest.messageId,
        messageType: 'change_request',
        authorId: changeRequest.requesterId,
        content: payload.reason,
        createdAt: changeRequest.createdAt,
      });
      onCancel();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="change-request-schedule">대상 일정</label>
        {candidatesLoading && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중...</p>
        )}
        {candidatesError && (
          <div className="error-text">
            {candidatesError.message ?? '일정 목록을 불러오지 못했습니다.'}
          </div>
        )}
        <select
          id="change-request-schedule"
          value={scheduleId}
          onChange={(e) => setScheduleId(e.target.value)}
        >
          <option value="">선택</option>
          {candidates.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      {errors.scheduleId && <div className="error-text">{errors.scheduleId}</div>}

      <FormField
        id="change-request-title"
        label="제안 제목 (선택)"
        value={proposedTitle}
        onChange={(e) => setProposedTitle(e.target.value)}
      />

      <div className="field">
        <label htmlFor="change-request-start-at">제안 시작 일시 (선택)</label>
        <input
          id="change-request-start-at"
          type="datetime-local"
          value={proposedStartAtInput}
          onChange={(e) => setProposedStartAtInput(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="change-request-end-at">제안 종료 일시 (선택)</label>
        <input
          id="change-request-end-at"
          type="datetime-local"
          value={proposedEndAtInput}
          onChange={(e) => setProposedEndAtInput(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="change-request-reason">요청 사유</label>
        <textarea
          id="change-request-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          style={textareaStyle}
        />
      </div>
      {errors.reason && <div className="error-text">{errors.reason}</div>}

      {submitError && <div className="error-text">{submitError}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          취소
        </Button>
        <Button type="submit" disabled={submitting}>
          요청 전송
        </Button>
      </div>
    </form>
  );
}
