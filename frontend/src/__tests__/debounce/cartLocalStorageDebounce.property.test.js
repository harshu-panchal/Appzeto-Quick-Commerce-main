/**
 * Property-based tests for the cart localStorage debounce logic.
 *
 * Validates: Requirements 3.2, 3.3
 *
 * Tests the debounce pattern used in CartContext.jsx directly,
 * without rendering the component.
 *
 * The pattern under test (from CartContext.jsx):
 *   let lsDebounceRef = null;
 *   const mockSetItem = jest.fn();
 *
 *   function triggerCartChange(cart) {
 *     clearTimeout(lsDebounceRef);
 *     lsDebounceRef = setTimeout(() => {
 *       mockSetItem("cart", JSON.stringify(cart));
 *     }, 300);
 *   }
 *
 *   function simulateUnmount(cart) {
 *     clearTimeout(lsDebounceRef);
 *     mockSetItem("cart", JSON.stringify(cart));
 *   }
 */

import { jest } from "@jest/globals";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a fresh debounce harness (isolated state per test run).
 * Returns { triggerCartChange, simulateUnmount, mockSetItem }.
 */
function createCartDebounceHarness() {
  let lsDebounceRef = null;
  const mockSetItem = jest.fn();

  function triggerCartChange(cart) {
    clearTimeout(lsDebounceRef);
    lsDebounceRef = setTimeout(() => {
      mockSetItem("cart", JSON.stringify(cart));
    }, 300);
  }

  function simulateUnmount(cart) {
    clearTimeout(lsDebounceRef);
    mockSetItem("cart", JSON.stringify(cart));
  }

  return { triggerCartChange, simulateUnmount, mockSetItem };
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
// Property 3: Write coalescence
//
// For any sequence of N ≥ 2 cart changes all occurring within a 300 ms
// window, localStorage.setItem is called exactly once.
//
// Validates: Requirements 3.2
// ---------------------------------------------------------------------------

describe("Property 3: Write coalescence", () => {
  test(
    "N ≥ 2 cart changes within 300 ms window → exactly 1 localStorage.setItem call",
    () => {
      fc.assert(
        fc.property(
          // Array of inter-change delays, each strictly < 300 ms so every
          // change lands inside the current debounce window.
          fc.array(fc.integer({ min: 0, max: 299 }), { minLength: 2, maxLength: 20 }),
          (delays) => {
            const { triggerCartChange, mockSetItem } = createCartDebounceHarness();
            const cart = [{ id: "p1", quantity: 1 }];

            // Fire the first cart change at t=0
            triggerCartChange(cart);

            // Fire subsequent cart changes, each within 300 ms of the previous
            for (const delay of delays) {
              jest.advanceTimersByTime(delay);
              triggerCartChange(cart);
            }

            // Advance past the debounce window to let the final timer fire
            jest.advanceTimersByTime(300);

            expect(mockSetItem).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test("manual: 5 rapid changes (0 ms apart) → exactly 1 localStorage.setItem call", () => {
    const { triggerCartChange, mockSetItem } = createCartDebounceHarness();
    const cart = [{ id: "p1", quantity: 2 }];

    for (let i = 0; i < 5; i++) {
      triggerCartChange(cart);
    }

    // Before the debounce window expires, no write should have been made
    expect(mockSetItem).not.toHaveBeenCalled();

    jest.advanceTimersByTime(300);
    expect(mockSetItem).toHaveBeenCalledTimes(1);
  });

  test("manual: 3 changes at 100 ms intervals (all < 300 ms) → exactly 1 localStorage.setItem call", () => {
    const { triggerCartChange, mockSetItem } = createCartDebounceHarness();
    const cart = [{ id: "p1", quantity: 1 }, { id: "p2", quantity: 3 }];

    triggerCartChange(cart);
    jest.advanceTimersByTime(100);
    triggerCartChange(cart);
    jest.advanceTimersByTime(100);
    triggerCartChange(cart);

    // Still within the debounce window — no write yet
    expect(mockSetItem).not.toHaveBeenCalled();

    jest.advanceTimersByTime(300);
    expect(mockSetItem).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Property 4: No data loss on unmount
//
// After unmount with a pending write, the value stored in localStorage
// equals the last cart state before unmount.
//
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------

describe("Property 4: No data loss on unmount", () => {
  test(
    "pending write flushed on unmount → stored value equals last cart state",
    () => {
      fc.assert(
        fc.property(
          // Generate a sequence of cart states (arrays of items with id and quantity)
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 10 }),
              quantity: fc.integer({ min: 1, max: 99 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          // Advance time by some amount strictly less than 300 ms (timer still pending)
          fc.integer({ min: 0, max: 299 }),
          (cartItems, elapsed) => {
            const { triggerCartChange, simulateUnmount, mockSetItem } =
              createCartDebounceHarness();

            // Trigger a cart change (starts the debounce timer)
            triggerCartChange(cartItems);

            // Advance time but NOT past the 300 ms debounce window
            jest.advanceTimersByTime(elapsed);

            // Timer has not fired yet — no write should have occurred
            expect(mockSetItem).not.toHaveBeenCalled();

            // Simulate component unmount — should flush immediately
            simulateUnmount(cartItems);

            // The stored value must equal the last cart state
            expect(mockSetItem).toHaveBeenCalledTimes(1);
            expect(mockSetItem).toHaveBeenCalledWith(
              "cart",
              JSON.stringify(cartItems)
            );
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test("manual: unmount with pending write → last cart state is persisted", () => {
    const { triggerCartChange, simulateUnmount, mockSetItem } =
      createCartDebounceHarness();

    const initialCart = [{ id: "p1", quantity: 1 }];
    const updatedCart = [{ id: "p1", quantity: 1 }, { id: "p2", quantity: 2 }];

    // Trigger two changes — only the last one matters
    triggerCartChange(initialCart);
    jest.advanceTimersByTime(100);
    triggerCartChange(updatedCart);

    // Advance to 250 ms — still within the 300 ms window
    jest.advanceTimersByTime(150);
    expect(mockSetItem).not.toHaveBeenCalled();

    // Unmount — should flush with the last cart state
    simulateUnmount(updatedCart);

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    expect(mockSetItem).toHaveBeenCalledWith("cart", JSON.stringify(updatedCart));
  });

  test("manual: unmount immediately after change → correct value stored", () => {
    const { triggerCartChange, simulateUnmount, mockSetItem } =
      createCartDebounceHarness();

    const cart = [{ id: "p1", quantity: 5 }];

    triggerCartChange(cart);

    // Unmount immediately (0 ms elapsed)
    simulateUnmount(cart);

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    expect(mockSetItem).toHaveBeenCalledWith("cart", JSON.stringify(cart));
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  test("two separate changes separated by > 300 ms → 2 localStorage.setItem calls", () => {
    const { triggerCartChange, mockSetItem } = createCartDebounceHarness();
    const cart = [{ id: "p1", quantity: 1 }];

    triggerCartChange(cart);
    jest.advanceTimersByTime(300); // first timer fires
    expect(mockSetItem).toHaveBeenCalledTimes(1);

    triggerCartChange(cart);
    jest.advanceTimersByTime(300); // second timer fires
    expect(mockSetItem).toHaveBeenCalledTimes(2);
  });

  test("empty cart on unmount → stores empty array", () => {
    const { triggerCartChange, simulateUnmount, mockSetItem } =
      createCartDebounceHarness();

    const emptyCart = [];

    triggerCartChange(emptyCart);
    simulateUnmount(emptyCart);

    expect(mockSetItem).toHaveBeenCalledWith("cart", JSON.stringify(emptyCart));
  });
});
