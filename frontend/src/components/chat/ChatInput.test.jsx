import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatInput from './ChatInput';
import { useTeam } from '../../context/TeamContext';
import { postMessage } from '../../api/message.api';
import ChangeRequestForm from '../change-request/ChangeRequestForm';

// TeamContext 모킹 — currentRole을 테스트별로 자유롭게 전환하기 위함
vi.mock('../../context/TeamContext', () => ({
  useTeam: vi.fn(),
}));

// message API 모킹 — 실제 네트워크 요청 방지
vi.mock('../../api/message.api', () => ({
  postMessage: vi.fn(),
}));

// ChangeRequestForm 모킹 — ChatInput 단위 테스트를 ChangeRequestForm의 내부 구현(스케줄 조회,
// 인증 컨텍스트 등)으로부터 격리하고, ChatInput이 전달하는 props와 onCancel 연동만 검증한다.
vi.mock('../change-request/ChangeRequestForm', () => ({
  default: vi.fn((props) => (
    <div data-testid="change-request-form">
      <button type="button" onClick={props.onCancel}>
        취소(mock)
      </button>
    </div>
  )),
}));

describe('ChatInput', () => {
  const testDate = new Date('2026-07-15');
  let appendMessage;

  beforeEach(() => {
    vi.clearAllMocks();
    appendMessage = vi.fn();
  });

  function setup(role = 'member') {
    useTeam.mockReturnValue({ currentRole: role });
    return render(<ChatInput teamId="team-1" appendMessage={appendMessage} date={testDate} />);
  }

  it('member 역할일 때 "일반"/"일정 변경요청" 토글 버튼이 렌더링된다', () => {
    setup('member');

    expect(screen.getByRole('button', { name: '일반' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '일정 변경요청' })).toBeInTheDocument();
  });

  it('leader 역할일 때 토글 버튼이 렌더링되지 않고 기존 텍스트 입력 UI만 보인다', () => {
    setup('leader');

    expect(screen.queryByRole('button', { name: '일반' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '일정 변경요청' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('메시지를 입력하세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전송' })).toBeInTheDocument();
  });

  it('초기 상태(mode=general)에서는 텍스트 입력과 전송 버튼이 보이고 ChangeRequestForm은 보이지 않는다', () => {
    setup('member');

    expect(screen.getByPlaceholderText('메시지를 입력하세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전송' })).toBeInTheDocument();
    expect(screen.queryByTestId('change-request-form')).not.toBeInTheDocument();
  });

  it('"일정 변경요청" 토글 클릭 시 텍스트 입력 UI가 사라지고 ChangeRequestForm이 렌더링된다', () => {
    setup('member');

    fireEvent.click(screen.getByRole('button', { name: '일정 변경요청' }));

    expect(screen.queryByPlaceholderText('메시지를 입력하세요')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전송' })).not.toBeInTheDocument();
    expect(screen.getByTestId('change-request-form')).toBeInTheDocument();
  });

  it('ChangeRequestForm에 teamId, date, appendMessage prop이 올바르게 전달된다', () => {
    setup('member');

    fireEvent.click(screen.getByRole('button', { name: '일정 변경요청' }));

    expect(ChangeRequestForm).toHaveBeenCalled();
    const props = ChangeRequestForm.mock.calls.at(-1)[0];
    expect(props.teamId).toBe('team-1');
    expect(props.date).toBe(testDate);
    expect(props.appendMessage).toBe(appendMessage);
    expect(typeof props.onCancel).toBe('function');
  });

  it('ChangeRequestForm의 onCancel이 호출되면 mode가 general로 돌아가 텍스트 입력 UI가 다시 보인다', () => {
    setup('member');

    fireEvent.click(screen.getByRole('button', { name: '일정 변경요청' }));
    expect(screen.getByTestId('change-request-form')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '취소(mock)' }));

    expect(screen.queryByTestId('change-request-form')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('메시지를 입력하세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전송' })).toBeInTheDocument();
  });

  it('"일반" 토글을 다시 클릭하면 change_request 모드에서 general 모드로 전환된다', () => {
    setup('member');

    fireEvent.click(screen.getByRole('button', { name: '일정 변경요청' }));
    expect(screen.getByTestId('change-request-form')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '일반' }));

    expect(screen.queryByTestId('change-request-form')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('메시지를 입력하세요')).toBeInTheDocument();
  });

  it('일반 모드에서 텍스트 입력 후 전송 버튼 클릭 시 postMessage와 appendMessage가 정상 동작한다(기존 동작 회귀 방지)', async () => {
    postMessage.mockResolvedValue({ id: 1, content: '안녕하세요' });
    setup('member');

    const input = screen.getByPlaceholderText('메시지를 입력하세요');
    fireEvent.change(input, { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));

    await waitFor(() => expect(appendMessage).toHaveBeenCalledWith({ id: 1, content: '안녕하세요' }));
    expect(postMessage).toHaveBeenCalledWith('team-1', '안녕하세요');
  });

  it('내용이 공백뿐이면 전송 버튼을 눌러도 postMessage가 호출되지 않는다', () => {
    setup('member');

    const input = screen.getByPlaceholderText('메시지를 입력하세요');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));

    expect(postMessage).not.toHaveBeenCalled();
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it('postMessage가 실패하면 에러 메시지를 표시한다', async () => {
    postMessage.mockRejectedValue(new Error('메시지 전송에 실패했습니다.'));
    setup('member');

    const input = screen.getByPlaceholderText('메시지를 입력하세요');
    fireEvent.change(input, { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));

    expect(await screen.findByText('메시지 전송에 실패했습니다.')).toBeInTheDocument();
  });
});
