// 이 컴포넌트를 여는 호출자는 목록 조회(BE-14) 응답의 schedule 객체를 그대로
// schedule prop으로 전달해야 한다(canEdit 포함). 참여자 정보는 이 컴포넌트가
// 내부적으로 상세조회 API(SC-04)로 보강한다.
import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import ScheduleFormModal from './ScheduleFormModal';
import { getScheduleDetail, deleteSchedule } from '../../api/schedule.api';
import { formatTimeLabel } from '../../utils/calendar-date';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateDayLabel(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}(${WEEKDAY_LABELS[date.getDay()]})`;
}

export default function ScheduleDetailModal({ open, onClose, teamId, schedule, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!open) return;
    setEditMode(false);
    setConfirmOpen(false);
    setDeleteError('');
  }, [open, schedule?.id]);

  useEffect(() => {
    if (!open || !schedule?.id) return undefined;
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    getScheduleDetail(teamId, schedule.id)
      .then((data) => {
        if (!cancelled) setDetail({ ...data, canEdit: schedule.canEdit });
      })
      .catch((err) => {
        if (!cancelled) setDetailError(err);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, teamId, schedule?.id, schedule?.canEdit]);

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteSchedule(teamId, schedule.id);
      setConfirmOpen(false);
      onChanged?.();
      onClose();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {editMode ? (
        <ScheduleFormModal
          open={open}
          onClose={() => {
            setEditMode(false);
            onClose();
          }}
          teamId={teamId}
          mode="edit"
          initialSchedule={detail}
          onSaved={() => {
            setEditMode(false);
            onChanged?.();
            onClose();
          }}
        />
      ) : (
        <Modal open={open} onClose={onClose} title={schedule?.title}>
          {detailLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중...</p>}
          {detailError && (
            <div className="error-text">{detailError.message ?? '일정을 불러오지 못했습니다.'}</div>
          )}
          {detail && (
            <div>
              <p>
                {formatDateDayLabel(new Date(detail.startAt))} {formatTimeLabel(new Date(detail.startAt))} ~{' '}
                {formatTimeLabel(new Date(detail.endAt))}
              </p>
              <p>{detail.description || '없음'}</p>
              <p>{(detail.participants ?? []).map((p) => p.name).join(', ') || '없음'}</p>
            </div>
          )}

          {/* 팀장에게만 수정/삭제 버튼을 보여주는 UX 보조 장치일 뿐이다. 실제 신뢰 기준은
              서버가 수정/삭제 API에서 재검증하는 팀장 권한(BR-02/BR-03)이며, 팀원이 API를
              직접 호출하면 403 "팀 일정 삭제 권한이 없습니다"로 거부된다(SC-05 E1). */}
          {detail && schedule.canEdit && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setEditMode(true)}>
                수정
              </Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                삭제
              </Button>
            </div>
          )}
        </Modal>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="일정 삭제">
        <p>&quot;{schedule?.title}&quot; 일정을 삭제하시겠습니까?</p>
        {deleteError && <div className="error-text">{deleteError}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={deleting}>
            취소
          </Button>
          <Button variant="danger" onClick={handleConfirmDelete} disabled={deleting}>
            삭제
          </Button>
        </div>
      </Modal>
    </>
  );
}
