// edit 모드 호출자는 참여자 정보가 포함된 완전한 schedule 객체를 initialSchedule로 전달해야 한다.
import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import FormField from '../common/FormField';
import { getMembers } from '../../api/team.api';
import { createSchedule, updateSchedule } from '../../api/schedule.api';
import { toDateTimeLocalValue, validateScheduleForm } from '../../utils/schedule-form';

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

export default function ScheduleFormModal({ open, onClose, teamId, mode, initialSchedule, onSaved }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAtInput, setStartAtInput] = useState('');
  const [endAtInput, setEndAtInput] = useState('');
  const [participantIds, setParticipantIds] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState(null);

  useEffect(() => {
    if (!open) return;

    if (mode === 'edit' && initialSchedule) {
      setTitle(initialSchedule.title ?? '');
      setDescription(initialSchedule.description ?? '');
      setStartAtInput(toDateTimeLocalValue(new Date(initialSchedule.startAt)));
      setEndAtInput(toDateTimeLocalValue(new Date(initialSchedule.endAt)));
      setParticipantIds(
        initialSchedule.participantUserIds ?? (initialSchedule.participants ?? []).map((p) => p.userId),
      );
    } else {
      setTitle('');
      setDescription('');
      setStartAtInput('');
      setEndAtInput('');
      setParticipantIds([]);
    }
    setErrors({});
    setSubmitError('');
  }, [open, mode, initialSchedule]);

  useEffect(() => {
    if (!open || !teamId) return undefined;
    let cancelled = false;
    setMembersLoading(true);
    setMembersError(null);
    getMembers(teamId)
      .then((data) => {
        if (!cancelled) setMembers(data);
      })
      .catch((err) => {
        if (!cancelled) setMembersError(err);
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, teamId]);

  function toggleParticipant(userId) {
    setParticipantIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validationErrors = validateScheduleForm({
      title,
      startAt: startAtInput,
      endAt: endAtInput,
    });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitError('');
    setSubmitting(true);

    const payload = {
      title: title.trim(),
      description: description.trim() === '' ? null : description.trim(),
      startAt: new Date(startAtInput).toISOString(),
      endAt: new Date(endAtInput).toISOString(),
      participantUserIds: participantIds,
    };

    try {
      if (mode === 'edit') {
        await updateSchedule(teamId, initialSchedule.id, payload);
      } else {
        await createSchedule(teamId, payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === 'edit' ? '일정 수정' : '일정 생성'}>
      <form onSubmit={handleSubmit}>
        <FormField
          id="schedule-title"
          label="제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {errors.title && <div className="error-text">{errors.title}</div>}

        <div className="field">
          <label htmlFor="schedule-description">설명</label>
          <textarea
            id="schedule-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={textareaStyle}
          />
        </div>

        <div className="field">
          <label htmlFor="schedule-start-at">시작 일시</label>
          <input
            id="schedule-start-at"
            type="datetime-local"
            value={startAtInput}
            onChange={(e) => setStartAtInput(e.target.value)}
          />
        </div>
        {errors.startAt && <div className="error-text">{errors.startAt}</div>}

        <div className="field">
          <label htmlFor="schedule-end-at">종료 일시</label>
          <input
            id="schedule-end-at"
            type="datetime-local"
            value={endAtInput}
            onChange={(e) => setEndAtInput(e.target.value)}
          />
        </div>
        {errors.endAt && <div className="error-text">{errors.endAt}</div>}

        <div className="field">
          <label>참여자</label>
          {membersLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중...</p>}
          {membersError && (
            <div className="error-text">{membersError.message ?? '팀원 목록을 불러오지 못했습니다.'}</div>
          )}
          <div
            style={{
              maxHeight: 200,
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: 8,
            }}
          >
            {members.map((m) => (
              <label key={m.userId} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={participantIds.includes(m.userId)}
                  onChange={() => toggleParticipant(m.userId)}
                />{' '}
                {m.name}
              </label>
            ))}
          </div>
        </div>

        {submitError && <div className="error-text">{submitError}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button type="submit" disabled={submitting}>
            저장
          </Button>
        </div>
      </form>
    </Modal>
  );
}
