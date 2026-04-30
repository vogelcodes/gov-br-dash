import { withRetry } from "../../../src/utils/retry.js";

describe("withRetry", () => {
  it("returns result immediately on success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await withRetry(fn, { maxRetries: 3, delayMs: 100, sleep });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on failure and returns result on second attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await withRetry(fn, { maxRetries: 3, delayMs: 100, sleep });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it("throws last error after exhausting all retries", async () => {
    const lastError = new Error("still failing");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("attempt 1"))
      .mockRejectedValueOnce(new Error("attempt 2"))
      .mockRejectedValueOnce(lastError);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      withRetry(fn, { maxRetries: 2, delayMs: 100, sleep }),
    ).rejects.toThrow("still failing");

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("applies exponential backoff between retries", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("1"))
      .mockRejectedValueOnce(new Error("2"))
      .mockRejectedValueOnce(new Error("3"))
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await withRetry(fn, { maxRetries: 3, delayMs: 200, sleep });

    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 200);
    expect(sleep).toHaveBeenNthCalledWith(2, 400);
    expect(sleep).toHaveBeenNthCalledWith(3, 800);
  });

  it("does not retry when maxRetries is 0", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      withRetry(fn, { maxRetries: 0, delayMs: 100, sleep }),
    ).rejects.toThrow("fail");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
