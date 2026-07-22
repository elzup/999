import { describe, expect, it, vi } from 'vitest'
import { completeFfRun } from '../components/FFTab'
import type { FfRun, TestId } from '../components/FFTab'

describe('FF quiz completion', () => {
  it.each<[FfRun, TestId]>([
    [{ kind: 'ff', dir: 'hex2read', questions: [], id: 1 }, 'hex2read'],
    [{ kind: 'ff', dir: 'read2hex', questions: [], id: 2 }, 'read2hex'],
    [{ kind: 'ff', dir: 'bin2hex', questions: [], id: 3 }, 'bin2hex'],
    [{ kind: 'ff', dir: 'hex2bin', questions: [], id: 4 }, 'hex2bin'],
    [{ kind: 'kp', nibble: 'b2h', pad: 'hex', questions: [], id: 5 }, 'b2h'],
    [{ kind: 'kp', nibble: 'h2b', pad: 'bin', questions: [], id: 6 }, 'h2b'],
  ])(
    'REQ-FF-006: persists a completed %s run to its own history',
    (run, expectedId) => {
      const summary = { score: 1, total: 1, time: 2, reviews: [] }
      const recordIds: TestId[] = [
        'hex2read',
        'read2hex',
        'bin2hex',
        'hex2bin',
        'b2h',
        'h2b',
      ]
      const records = Object.fromEntries(
        recordIds.map((id) => [id, { addRecord: vi.fn() }])
      ) as Record<TestId, { addRecord: ReturnType<typeof vi.fn> }>

      completeFfRun(run, summary, records)

      expect(records[expectedId].addRecord).toHaveBeenCalledOnce()
      expect(records[expectedId].addRecord).toHaveBeenCalledWith(summary)
      for (const id of recordIds.filter((id) => id !== expectedId)) {
        expect(records[id].addRecord).not.toHaveBeenCalled()
      }
    }
  )
})
