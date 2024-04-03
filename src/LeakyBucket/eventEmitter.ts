export class EventEmitter {
  eventHandlers: any; // TODO: Fix typing

  constructor() {
    this.eventHandlers = new Map<string, Map<Function, boolean>>();
  }

  /**
   * Emit an event
   */
  public emit(event: string, ...args: any[]) {
    let results = [];

    if (this.hasListener(event)) {
      const handlerMap = this.getEventHandlers(event);

      if (handlerMap) {
        for (const [handler, once] of handlerMap.entries()) {
          results.push(handler(...args));

          if (once) {
            handlerMap.delete(handler);
          }
        }
      }
    }

    return results;
  }

  /**
   * Return event handlers
   */
  public getEventHandlers(event: string) {
    if (event) {
      return this.eventHandlers.get(event);
    }

    return this.eventHandlers;
  }

  /**
   * Determines if listeners are registered for a given event
   */
  public hasListener(event: string) {
    return this.eventHandlers.has(event) && this.eventHandlers.get(event)?.size;
  }

  /**
   * Register a once event handler
   */
  public once(event: string, handler: Function) {
    return this.on(event, handler, true);
  }

  /**
   * Register an event handler
   */
  public on(event: string, handler: Function, once: boolean = false) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Map());
    }

    const handlerMap = this.eventHandlers.get(event);

    if (handlerMap?.has(handler)) {
      throw new Error(
        `Cannot register the same event handler for ${event} twice!`
      );
    }

    this.eventHandlers.get(event)?.set(handler, once);

    return this;
  }

  /**
   * Deregister an event handler
   */
  public off(event: string, handler: Function): boolean {
    if (!this.eventHandlers.has(event)) return false;

    if (!handler) {
      this.eventHandlers.delete(event);
      return true;
    }

    if (handler) {
      if (this.eventHandlers.get(event)?.has(handler)) {
        this.eventHandlers.get(event)?.delete(handler);

        return true;
      }
    }

    return false;
  }
}
