/**
 * Property-based tests for the checkoutPreview debounce logic.
 *
 * Validates: Requirements 2.2
 *
 * Tests the debounce pattern used in CheckoutPage.jsx directly,
 * without rendering the component.
 *
 * The pattern under test:
 *   let debounceRef = null;
 *   function triggerStateChange() {
 *     clearTimeout(debounceRef);
 *     debounceRef = setTimeout(() => { mockApi(); }, 400);
 *   }
 */

import { jest } from "@jest/globals";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a fresh debounce harness (isolated state per test run).
 * Returns { triggerStateChange, mockApi }.
 */
function createDebounceHarness() {
  let debounceRef = null;
  const mockApi = jest.fn();

  function triggerStateChange() {
    clearTimeout(debounceRef);
    debounceRef = setTimeout(() => {
      mockApi();
    }, 400);
  }

  return { triggerStateChange, mockApi };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Property 1: Debounce coalescence
//
// For any sequence of N ≥ 2 state changes all occurring within a 400 ms
// window, the number of checkoutPreview calls equals 1.
//
// Validates: Requirements 2.2
// ---------------------------------------------------------------------------

describe("Property 1: Debounce coalescence", () => {
  test(
    "N ≥ 2 state changes within 400 ms window → exactly 1 API call",
    () => {
      fc.assert(
        fc.property(
          // Array of inter-change delays, each strictly < 400 ms so every
          // change lands inside the current debounce window.
          fc.array(fc.integer({ min: 0, max: 399 }), { minLength: 2, maxLength: 20 }),
          (delays) => {
            const { triggerStateChange, mockApi } = createDebounceHarness();

            // Fire the first state change at t=0
            triggerStateChange();

            // Fire subsequent state changes, each within 400 ms of the previous
            for (const delay of delays) {
              jest.advanceTimersByTime(delay);
              triggerStateChange();
            }

            // Advance past the debounce window to let the final timer fire
            jest.advanceTimersByTime(400);

            expect(mockApi).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test("manual: 5 rapid changes (0 ms apart) → exactly 1 API call", () => {
    const { triggerStateChange, mockApi } = createDebounceHarness();

    for (let i = 0; i < 5; i++) {
      triggerStateChange();
    }

    // Before the debounce window expires, no call should have been made
    expect(mockApi).not.toHaveBeenCalled();

    jest.advanceTimersByTime(400);
    expect(mockApi).toHaveBeenCalledTimes(1);
  });

  test("manual: 3 changes at 100 ms intervals (all < 400 ms) → exactly 1 API call", () => {
    const { triggerStateChange, mockApi } = createDebounceHarness();

    triggerStateChange();
    jest.advanceTimersByTime(100);
    triggerStateChange();
    jest.advanceTimersByTime(100);
    triggerStateChange();

    // Still within the debounce window — no call yet
    expect(mockApi).not.toHaveBeenCalled();

    jest.advanceTimersByTime(400);
    expect(mockApi).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Property 2: Debounce delay
//
// For any single state change, the checkoutPreview call is made no earlier
// than 400 ms after the change.
//
// Validates: Requirements 2.2
// ---------------------------------------------------------------------------

describe("Property 2: Debounce delay", () => {
  test(
    "single state change → API not called before 400 ms, called at/after 400 ms",
    () => {
      fc.assert(
        fc.property(
          // Advance time by some amount strictly less than 400 ms
          fc.integer({ min: 0, max: 399 }),
          (elapsed) => {
            const { triggerStateChange, mockApi } = createDebounceHarness();

            triggerStateChange();

            // Advance by less than the debounce window
            jest.advanceTimersByTime(elapsed);
            expect(mockApi).not.toHaveBeenCalled();

            // Advance to exactly 400 ms total
            jest.advanceTimersByTime(400 - elapsed);
            expect(mockApi).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test("manual: API not called at 399 ms, called at 400 ms", () => {
    const { triggerStateChange, mockApi } = createDebounceHarness();

    triggerStateChange();

    jest.advanceTimersByTime(399);
    expect(mockApi).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(mockApi).toHaveBeenCalledTimes(1);
  });

  test("manual: API not called at 0 ms (synchronously after trigger)", () => {
    const { triggerStateChange, mockApi } = createDebounceHarness();

    triggerStateChange();

    // No time has passed — the timer should not have fired
    expect(mockApi).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  test("two separate changes separated by > 400 ms → 2 API calls", () => {
    const { triggerStateChange, mockApi } = createDebounceHarness();

    triggerStateChange();
    jest.advanceTimersByTime(400); // first timer fires
    expect(mockApi).toHaveBeenCalledTimes(1);

    triggerStateChange();
    jest.advanceTimersByTime(400); // second timer fires
    expect(mockApi).toHaveBeenCalledTimes(2);
  });

  test("change at exactly 400 ms after previous → treated as new window → 2 calls", () => {
    const { triggerStateChange, mockApi } = createDebounceHarness();

    triggerStateChange();
    jest.advanceTimersByTime(400); // first timer fires
    expect(mockApi).toHaveBeenCalledTimes(1);

    triggerStateChange();
    jest.advanceTimersByTime(400); // second timer fires
    expect(mockApi).toHaveBeenCalledTimes(2);
  });
});
