import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getMembers, updateMemberRole, removeMember } from '../api/team.api';
import { useAuth } from '../context/AuthContext';
import Button from '../components/common/Button';
import BackButton from '../components/common/BackButton';
import MemberSearchAddForm from '../components/team/MemberSearchAddForm';

export default function TeamMembersPage() {
  const { teamId } = useParams();
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');

  async function loadMembers() {
    try {
      const result = await getMembers(teamId);
      setMembers(result);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const myMembership = members.find((m) => String(m.userId) === String(user.id));
  const isLeader = myMembership?.role === 'leader';

  async function handleRoleChange(targetUserId, role) {
    setError('');
    try {
      await updateMemberRole(teamId, targetUserId, role);
      await loadMembers();
    } catch (err) {
      // SC-11: 팀장 1명뿐인 상태에서 서버 오류 메시지 그대로 노출, 상태 불변
      setError(err.message);
    }
  }

  async function handleRemove(targetUserId) {
    setError('');
    try {
      await removeMember(teamId, targetUserId);
      await loadMembers();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page page--wide">
      <BackButton />
      <h2>팀원 관리</h2>
      {error && <div className="error-text">{error}</div>}

      {isLeader && <MemberSearchAddForm teamId={teamId} onAdded={loadMembers} />}

      <table>
        <thead>
          <tr>
            <th>이름</th>
            <th>이메일</th>
            <th>역할</th>
            {isLeader && <th>관리</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.userId}>
              <td>{member.name}</td>
              <td>{member.email}</td>
              <td>{member.role === 'leader' ? '팀장' : '팀원'}</td>
              {isLeader && (
                <td style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      handleRoleChange(member.userId, member.role === 'leader' ? 'member' : 'leader')
                    }
                  >
                    {member.role === 'leader' ? '팀원으로 변경' : '팀장으로 변경'}
                  </Button>
                  <Button variant="danger" onClick={() => handleRemove(member.userId)}>
                    제외
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
