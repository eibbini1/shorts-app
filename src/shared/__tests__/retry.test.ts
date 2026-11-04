import {describe,it,expect,vi} from 'vitest';
import {withRetry,isRetryableProviderError} from '../retry.js';
import {ProviderError} from '../errors.js';
describe('provider retries',()=>{
  it('does not retry authorization or validation errors',async()=>{
    const fn=vi.fn(async()=>{throw new ProviderError('provider','Unauthorized',undefined,401);});
    await expect(withRetry(fn,{delayMs:0,shouldRetry:isRetryableProviderError})).rejects.toThrow('Unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('honors the retry options used by the image provider',async()=>{
    const fn=vi.fn().mockRejectedValueOnce(new ProviderError('temporary',true)).mockResolvedValueOnce('ok');
    await expect(withRetry(fn,{maxAttempts:2,delayMs:0,isRetryable:isRetryableProviderError})).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('rejects an invalid attempt budget before starting work',async()=>{
    const fn=vi.fn();await expect(withRetry(fn,{attempts:0})).rejects.toThrow('Invalid retry options');expect(fn).not.toHaveBeenCalled();
  });
});
