import { useEffect, useState } from 'react';
import { getSchedules } from '../api/schedule.api';
import { formatDateParam } from '../utils/calendar-date';

export function useTeamSchedules(teamId, view, date) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refetchKey, setRefetchKey] = useState(0);
  const dateParam = date ? formatDateParam(date) : null;

  useEffect(() => {
    if (!teamId) {
      setSchedules([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSchedules(teamId, view, dateParam)
      .then((data) => {
        if (!cancelled) setSchedules(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, view, dateParam, refetchKey]);

  function refetch() {
    setRefetchKey((k) => k + 1);
  }

  return { schedules, loading, error, refetch };
}
