import { describe, it, expect } from 'vitest';

// Test the bpsToMbps conversion logic (same formula as in speedtest.ts)
function bpsToMbps(bps: number): number {
  return (bps * 8) / 1_000_000;
}

describe('speedtest parsing', () => {
  it('converts bandwidth bytes/sec to Mbps', () => {
    // 125000 bytes/sec = 1 Mbps
    expect(bpsToMbps(125_000)).toBeCloseTo(1, 2);
    expect(bpsToMbps(1_000_000)).toBeCloseTo(8, 2);
  });
});
