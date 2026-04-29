export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface ProviderCircuitState {
  state: CircuitState;
  failureCount: number;
  openedAt: number | null;
}

export class LLMCircuitBreaker {
  private providers = new Map<string, ProviderCircuitState>();
  private readonly failureThreshold = 5;
  private readonly resetWindowMs = 60000;

  isOpen(provider: string): boolean {
    let circuit = this.providers.get(provider);
    if (!circuit) {
      circuit = { state: "CLOSED", failureCount: 0, openedAt: null };
      this.providers.set(provider, circuit);
      return false;
    }

    if (circuit.state === "CLOSED") return false;

    if (circuit.state === "OPEN") {
      const now = Date.now();
      if (circuit.openedAt && now - circuit.openedAt >= this.resetWindowMs) {
        circuit.state = "HALF_OPEN";
        return false;
      }
      return true;
    }

    return false;
  }

  recordSuccess(provider: string): void {
    let circuit = this.providers.get(provider);
    if (!circuit) {
      circuit = { state: "CLOSED", failureCount: 0, openedAt: null };
      this.providers.set(provider, circuit);
    }

    if (circuit.state === "HALF_OPEN") {
      circuit.state = "CLOSED";
      circuit.failureCount = 0;
      circuit.openedAt = null;
    } else if (circuit.state === "CLOSED") {
      circuit.failureCount = 0;
    }
  }

  recordFailure(provider: string): void {
    let circuit = this.providers.get(provider);
    if (!circuit) {
      circuit = { state: "CLOSED", failureCount: 0, openedAt: null };
      this.providers.set(provider, circuit);
    }

    circuit.failureCount++;

    if (circuit.state === "CLOSED" && circuit.failureCount >= this.failureThreshold) {
      circuit.state = "OPEN";
      circuit.openedAt = Date.now();
    } else if (circuit.state === "HALF_OPEN") {
      circuit.state = "OPEN";
      circuit.openedAt = Date.now();
    }
  }

  getState(provider: string): CircuitState {
    const circuit = this.providers.get(provider);
    if (!circuit) return "CLOSED";
    if (circuit.state === "OPEN" && circuit.openedAt) {
      const now = Date.now();
      if (now - circuit.openedAt >= this.resetWindowMs) {
        return "HALF_OPEN";
      }
    }
    return circuit.state;
  }
}

export const defaultCircuitBreaker = new LLMCircuitBreaker();
