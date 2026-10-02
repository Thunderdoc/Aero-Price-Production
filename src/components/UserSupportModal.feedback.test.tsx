import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import UserSupportModal from './UserSupportModal'
import { apiSubmitFeedback } from '../services/api'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test User', email: 'user@example.test', role: 'PUBLIC', plan: 'FREE' },
    token: 'valid-session-token', logout: vi.fn(),
  }),
}))
vi.mock('../services/api', () => ({
  apiSubmitFeedback: vi.fn().mockResolvedValue({ id: 'feedback-id-123456', status: 'NEW' }),
  apiMyFeedback: vi.fn().mockResolvedValue({ feedback: [], total: 0 }),
  apiFeedbackScreenshot: vi.fn(),
}))

afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear() })

test('the feedback entry opens the structured report form and submits to the admin queue', async () => {
  render(<UserSupportModal mode="feedback" onClose={vi.fn()} />)

  expect(screen.getByRole('dialog', { name: 'Feedback' })).toBeTruthy()
  expect(screen.getByRole('tab', { name: /my submissions/i })).toBeTruthy()
  expect(screen.getByLabelText('Feedback category')).toBeTruthy()
  expect(screen.getByLabelText('Attach screenshot')).toBeTruthy()

  fireEvent.change(screen.getByLabelText('Feedback category'), { target: { value: 'PRAISE' } })
  fireEvent.change(screen.getByLabelText(/title \/ summary/i), { target: { value: 'Great route insights' } })
  fireEvent.change(screen.getByLabelText(/detailed description/i), { target: { value: 'The route comparison is clear and useful.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit feedback' }))

  await waitFor(() => expect(apiSubmitFeedback).toHaveBeenCalledWith({
    title: 'Great route insights',
    message: 'The route comparison is clear and useful.',
    category: 'PRAISE',
    priority: 'MEDIUM',
    source_module: 'User Portal',
    screenshot: undefined,
  }, 'valid-session-token'))
  expect(await screen.findByText(/feedback saved\. reference/i)).toBeTruthy()
})
