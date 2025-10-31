import { Timer } from "../../../../src/shared/utils/timer";

describe("Timer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize timer with start time", () => {
      const timer = new Timer();
      expect(timer).toBeInstanceOf(Timer);
    });

    it("should have elapsed time of 0 immediately after creation", () => {
      const timer = new Timer();
      expect(timer.elapsed).toBeGreaterThanOrEqual(0);
      expect(timer.elapsed).toBeLessThan(10); // Less than 10ms
    });
  });

  describe("elapsed", () => {
    it("should return elapsed time in milliseconds", async () => {
      const timer = new Timer();
      await new Promise((resolve) => setTimeout(resolve, 50));
      
      const elapsed = timer.elapsed;
      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(elapsed).toBeLessThan(100); // Some tolerance
    });

    it("should increase over time", async () => {
      const timer = new Timer();
      const firstElapsed = timer.elapsed;
      
      await new Promise((resolve) => setTimeout(resolve, 20));
      const secondElapsed = timer.elapsed;
      
      expect(secondElapsed).toBeGreaterThan(firstElapsed);
    });

    it("should return consistent values when called multiple times quickly", () => {
      const timer = new Timer();
      const elapsed1 = timer.elapsed;
      const elapsed2 = timer.elapsed;
      const elapsed3 = timer.elapsed;
      
      // Values should be very close (within 5ms)
      expect(Math.abs(elapsed2 - elapsed1)).toBeLessThan(5);
      expect(Math.abs(elapsed3 - elapsed2)).toBeLessThan(5);
    });
  });

  describe("multiple instances", () => {
    it("should track separate timers independently", async () => {
      const timer1 = new Timer();
      
      await new Promise((resolve) => setTimeout(resolve, 30));
      const timer2 = new Timer();
      
      await new Promise((resolve) => setTimeout(resolve, 20));
      
      const elapsed1 = timer1.elapsed;
      const elapsed2 = timer2.elapsed;
      
      expect(elapsed1).toBeGreaterThan(elapsed2);
      expect(elapsed1).toBeGreaterThanOrEqual(50);
      expect(elapsed2).toBeGreaterThanOrEqual(20);
    });
  });

  describe("edge cases", () => {
    it("should handle creating new timer for each operation", async () => {
      const timer1 = new Timer();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const elapsed1 = timer1.elapsed;
      
      const timer2 = new Timer();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const elapsed2 = timer2.elapsed;
      
      expect(elapsed1).toBeGreaterThanOrEqual(30);
      expect(elapsed2).toBeGreaterThanOrEqual(20);
      expect(elapsed2).toBeLessThan(elapsed1);
    });

    it("should work correctly after long delays", async () => {
      const timer = new Timer();
      
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      const elapsed = timer.elapsed;
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(150);
    });
  });
});

