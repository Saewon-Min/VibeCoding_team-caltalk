import { createContext, useContext, useMemo, useState } from 'react';

const TeamContext = createContext(null);

export function TeamProvider({ children }) {
  const [currentTeam, setCurrentTeam] = useState(null);

  function selectTeam(team) {
    // team은 TeamWithRole 형태({ id, name, role, ... }) — 팀 전환 시 역할도 함께 갱신된다(BR-08).
    setCurrentTeam(team);
  }

  const value = useMemo(
    () => ({
      currentTeam,
      currentRole: currentTeam?.role ?? null,
      selectTeam,
    }),
    [currentTeam],
  );

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    throw new Error('useTeam은 TeamProvider 내부에서만 사용할 수 있습니다');
  }
  return ctx;
}
