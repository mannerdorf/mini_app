import { describe, it, expect, vi } from 'vitest';
import { sendOutbox, type Pending } from './outbox';
const item = (id: string, job: string): Pending => ({ id, title: id, body: { id: job, requestId: id, photos: ['saved-photo'], version: 2 } });
describe('offline commands', () => {
  it('keeps conflicting photos and dependencies, sends independent jobs', async () => {
    const items = [item('1','a'), item('2','a'), item('3','b')];
    const call = vi.fn().mockRejectedValueOnce(Object.assign(new Error('Версия изменилась'), { status: 409 })).mockResolvedValue({});
    const save = vi.fn().mockResolvedValue(undefined);
    const pending = await sendOutbox(items, call, save);
    expect(call.mock.calls.map(c => c[0].requestId)).toEqual(['1','3']);
    expect(pending.map(p => p.id)).toEqual(['1','2']);
    expect(pending[0].body).toEqual(items[0].body);
    expect(pending[0].error).toBe('Версия изменилась');
  });
  it('stops on ambiguous network failure without changing IDs or dropping data', async () => {
    const save = vi.fn();
    const call = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(sendOutbox([item('1','a'),item('2','b')],call,save)).rejects.toThrow('offline');
    expect(save).not.toHaveBeenCalled(); expect(call).toHaveBeenCalledTimes(1);
  });
  it('stops if accepted command cannot be persisted, safe to replay original ID', async () => {
    const call = vi.fn().mockResolvedValue({});
    await expect(sendOutbox([item('1','a'),item('2','b')],call,vi.fn().mockRejectedValue(new Error('disk')))).rejects.toThrow('disk');
    expect(call).toHaveBeenCalledTimes(1);
  });
});
