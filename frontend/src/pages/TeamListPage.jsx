import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyTeams } from '../api/team.api';
import TeamCreateForm from '../components/team/TeamCreateForm';
import BackButton from '../components/common/BackButton';
import { useTeam } from '../context/TeamContext';

export default function TeamListPage() {
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState('');
  const { selectTeam } = useTeam();

  async function loadTeams() {
    try {
      const result = await getMyTeams();
      setTeams(result);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadTeams();
  }, []);

  function handleCreated(team) {
    // BR-15/SC-02: 팀 생성 즉시 본인이 팀장으로 목록에 반영
    setTeams((prev) => [...prev, team]);
  }

  return (
    <div className="page">
      <BackButton />
      <h2>내 팀 목록</h2>
      {error && <div className="error-text">{error}</div>}

      <TeamCreateForm onCreated={handleCreated} />

      <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left' }}>
        {teams.map((team) => (
          <li key={team.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <Link to={`/teams/${team.id}`} onClick={() => selectTeam(team)}>
              {team.name}
            </Link>{' '}
            — {team.role === 'leader' ? '팀장' : '팀원'}{' '}
            <Link to={`/teams/${team.id}/members`} onClick={() => selectTeam(team)}>
              팀원 관리
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
