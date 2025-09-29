import { EventEmitter } from './eventEmitter';

export class LeakyBucket extends EventEmitter {
  // TODO: Fix any typing
  capacity: number = 0;
  timeout: number = 0;
  interval: number = 0;
  debug: boolean;
  idleTimeout: number | null;
  refillRate: number = 0;

  queue: any[];
  totalCost: number;
  currentCapacity: number;
  lastRefill: number | null;
  emptyPromiseResolver: any;
  emptyPromise: any;
  timer: any;
  refillTimer: any;
  idleTimer: any;
  maxCapacity: number = 0;

  /**
   * Sets up the leaky bucket. The bucket is designed so that it can
   * burst by the capacity it is given. after that items can be queued
   * until a timeout of n seconds is reached.
   *
   * Example: throttle 10 actions per minute that have each a cost of 1, reject
   * everything that is overflowing. there will no more than 10 items queued
   * at any time
   *   capacity: 10
   *   interval: 60
   *   timeout: 60
   *
   * Example: throttle 100 actions per minute that have a cost of 1, reject
   * items that have to wait more that 2 minutes. there will be no more that
   * 200 items queued at any time. of those 200 items 100 will be bursted within
   * a minute, the rest will be executed evenly spread over a minute.
   *   capacity: 100
   *   interval: 60
   *   timeout: 120
   *
   */
  constructor({
    capacity = 60,
    timeout,
    interval = 60000,
    debug = false,
    idleTimeout = null,
    initialCapacity = null,
  }: {
    capacity?: number;
    timeout?: number;
    interval?: number;
    debug?: boolean;
    idleTimeout?: number | null;
    initialCapacity?: number | null;
  } = {}) {
    super();

    // If true, logs are printed
    this.debug = !!debug;

    // Set the timeout to the interval if not set, so that the bucket overflows as soon
    // the capacity is reached
    if (timeout && isNaN(timeout)) {
      timeout = interval;
    }

    // Queue containing all items to execute
    this.queue = [];

    // The value of all items currently enqueued
    this.totalCost = 0;

    // The capacity, which can be used at this moment
    // to execute items
    this.currentCapacity = capacity;

    // Time when the last refill occurred
    this.lastRefill = null;

    // Correct for the initial capacity
    if (initialCapacity !== null) {
      this.pay(capacity - initialCapacity);
    }

    // If the bucket is full and the idle timeout is reached,
    // it will emit the idleTimeout event
    this.idleTimeout = idleTimeout;

    this.setCapacity(capacity);
    this.setTimeout(timeout);
    this.setInterval(interval);

    this.refill();
  }

  /**
   * The throttle method is used to throttle things. it is async and will resolve either
   * immediately, if there is space in the bucket, that can be bursted, or it will wait
   * until there is enough capacity left to execute the item with the given cost. if the
   * bucket is overflowing, and the item cannot be executed within the timeout of the bucket,
   * the call will be rejected with an error.
   */
  public async throttle(
    cost: number = 1,
    append: boolean = true,
    isPause: boolean = false,
  ) {
    const maxCurrentCapacity = this.getCurrentMaxCapacity();

    // If items are added at the beginning, the excess items will be removed
    // later on
    if (append && this.totalCost + cost > maxCurrentCapacity) {
      if (this.debug) {
        console.log(
          `Rejecting item because the bucket is over capacity! Current max capacity: ${maxCurrentCapacity}, Total cost of all queued items: ${this.totalCost}, item cost: ${cost}`,
        );
      }

      throw new Error(
        `Cannot throttle item, bucket is overflowing: the \
        maximum capacity is ${maxCurrentCapacity}, the current total capacity is ${this.totalCost}!`,
      );
    }

    return new Promise((resolve, reject) => {
      const item = {
        resolve,
        reject,
        cost,
        isPause,
      };

      this.totalCost += cost;

      if (append) {
        this.queue.push(item);

        if (this.debug) {
          console.log(`Appended an item with the cost of ${cost} to the queue`);
        }
      } else {
        this.queue.unshift(item);

        if (this.debug) {
          console.log(
            `Added an item to the start of the queue with the cost of ${cost} to the queue`,
          );
        }

        this.cleanQueue();
      }

      this.startTimer();
    });
  }

  /**
   * Returns the capacity
   */
  public getCapacity() {
    return this.capacity;
  }

  /**
   * Returns the current capacity
   */
  public getCurrentCapacity() {
    return this.currentCapacity;
  }

  /**
   * Either executes directly when enough capacity is present or delays the
   * execution until enough capacity is available.
   */
  private startTimer() {
    if (!this.timer) {
      if (this.queue.length > 0) {
        const item = this.getFirstItem();

        if (this.debug) {
          console.log(`Processing an item with the cost of ${item.cost}`);
        }

        this.stopIdleTimer();
        this.refill();

        if (this.currentCapacity >= item.cost) {
          item.resolve();

          if (this.debug) {
            console.log(`Resolved an item with the cost ${item.cost}`);
          }

          // Remove the item from the queue
          this.shiftQueue();

          // Pay it's cost
          this.pay(item.cost);

          // Go to the next item
          this.startTimer();
        } else {
          const requiredDelta = item.cost + this.currentCapacity * -1;
          const timeToDelta = (requiredDelta / this.refillRate) * 1000;

          if (this.debug) {
            console.log(
              `Waiting ${timeToDelta} for topping up ${requiredDelta} capacity until the next item can be processed ...`,
            );
          }

          // Wait until the next item can be handled
          this.timer = setTimeout(() => {
            this.timer = 0;
            this.startTimer();
          },                      timeToDelta);
        }
      } else {
        // Refill the bucket, will start the idle timeout eventually
        this.refill();
      }
    }
  }

  /**
   * Removes the first item in the queue, resolves the promise that indicated
   * that the bucket is empty and no more items are waiting
   */
  private shiftQueue() {
    this.queue.shift();

    if (this.queue.length === 0) {
      if (this.emptyPromiseResolver) {
        this.emptyPromiseResolver();
      }

      this.emit('idle', this);
    }
  }

  /**
   * Is resolved as soon as the bucket is empty. is basically an event
   * that is emitted
   */
  private async isEmpty() {
    if (!this.emptyPromiseResolver) {
      this.emptyPromise = new Promise<void>((resolve) => {
        this.emptyPromiseResolver = () => {
          this.emptyPromiseResolver = null;
          this.emptyPromise = null;
          resolve();
        };
      });
    }

    return this.emptyPromise;
  }

  /**
   * Ends the bucket. The bucket may be recycled after this call
   */
  public end() {
    if (this.debug) {
      console.log('Ending bucket!');
    }

    this.stopTimer();
    this.stopIdleTimer();
    this.stopRefillTimer();
    this.clear();
  }

  /**
   * Removes all items from the queue, does not stop the timer though
   */
  private clear() {
    if (this.debug) {
      console.log('Resetting queue');
    }

    this.queue = [];
  }

  /**
   * Can be used to pay costs for items where the cost is clear after execution
   * this will decrease the current capacity available on the bucket.
   */
  public pay(cost: number) {
    if (this.debug) {
      console.log(`Paying ${cost}`);
    }

    // Reduce the current capacity, so that bursts
    // as calculated correctly
    this.currentCapacity -= cost;

    if (this.debug) {
      console.log(`The current capacity is now ${this.currentCapacity}`);
    }

    // Keep track of the total cost for the bucket
    // so that we know when we're overflowing
    this.totalCost -= cost;

    // Store the date the leaky bucket was starting to leak
    // so that it can be refilled correctly
    if (this.lastRefill === null) {
      this.lastRefill = Date.now();
    }
  }

  /**
   * Stops the running times
   */
  private stopTimer() {
    if (this.timer) {
      if (this.debug) {
        console.log('Stopping timer');
      }

      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Refills the bucket with capacity which has become available since the
   * last refill. starts to refill after a call has started using capacity
   */
  private refill() {
    // Don't do refills, if we're already full
    if (this.currentCapacity < this.capacity) {
      // Refill the currently avilable capacity
      const lastRefill = this.lastRefill || 0;

      const refillAmount = ((Date.now() - lastRefill) / 1000) * this.refillRate;
      this.currentCapacity += refillAmount;

      if (this.debug) {
        console.log(
          `Refilled the bucket with ${refillAmount}, last refill was ${
            this.lastRefill
          }, current Date is ${Date.now()}, diff is ${
            Date.now() - lastRefill
          } msec`,
        );
      }

      if (this.debug) {
        console.log(`The current capacity is now ${this.currentCapacity}`);
      }

      // Make sure, that no more capacity is added than is the maximum
      if (this.currentCapacity >= this.capacity) {
        this.currentCapacity = this.capacity;

        if (this.debug) {
          console.log(`The current capacity is now ${this.currentCapacity}`);
        }

        this.lastRefill = null;

        if (this.debug) {
          console.log('Buckets capacity is fully recharged');
        }
      } else {
        // Date of last refill, used for the next refill
        this.lastRefill = Date.now();
      }

      // Start the refill timer
      this.startRefillTimer();
    } else {
      this.startIdleTimer();
    }
  }

  /**
   * This timer is scheduled to refill the bucket on the moment
   * it should reach ful capacity. used for the idle event
   */
  private startRefillTimer() {
    if (!this.idleTimeout || this.refillTimer) {
      return;
    }

    const requiredDelta = this.capacity - this.currentCapacity;
    const timeToDelta = (requiredDelta / this.refillRate) * 1000;

    this.refillTimer = setTimeout(() => {
      this.refillTimer = null;
      this.refill();
    },                            timeToDelta + 10);
  }

  /**
   * Stops the refill timer.
   */
  private stopRefillTimer() {
    if (this.refillTimer) {
      clearTimeout(this.refillTimer);
      this.refillTimer = null;
    }
  }

  /**
   * Stops the idle timer.
   */
  private stopIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * The idle timer is started as soon the bucket is idle and
   * at full capacity
   */
  private startIdleTimer() {
    if (!this.idleTimeout) {
      return;
    }

    this.stopIdleTimer();

    if (
      this.currentCapacity >= this.capacity &&
      this.queue.length === 0 &&
      !this.timer
    ) {
      this.idleTimer = setTimeout(() => {
        this.emit('idleTimeout', this);
      },                          this.idleTimeout);
    }
  }

  /**
   * Gets the currently available max capacity, respecting
   * the capacity that is already used in the moment
   */
  private getCurrentMaxCapacity() {
    this.refill();
    return this.maxCapacity - (this.capacity - this.currentCapacity);
  }

  /**
   * Removes all items that cannot be executed in time due to items
   * that were added in front of them in the queue (mostly pause items)
   */
  private cleanQueue() {
    const maxCapacity = this.getCurrentMaxCapacity();
    let currentCapacity = 0;

    // Find the first item, that goes over the theoretical maximal
    // capacity that is available
    const index = this.queue.findIndex((item) => {
      currentCapacity += item.cost;
      return currentCapacity > maxCapacity;
    });

    // Reject all items that cannot be enqueued
    if (index >= 0) {
      this.queue.splice(index).forEach((item) => {
        if (!item.isPause) {
          if (this.debug) {
            console.log(
              `Rejecting item with a cost of ${item.cost} because an item was added in front of it!`,
            );
          }

          item.reject(
            new Error(
              'Cannot throttle item because an item was added in front of it which caused the queue to overflow!',
            ),
          );

          this.totalCost -= item.cost;
        }
      });
    }
  }

  /**
   * Returns the first item from the queue
   */
  private getFirstItem() {
    if (this.queue.length > 0) {
      return this.queue[0];
    }
    return null;

  }

  /**
   * Pause the bucket for the given cost. means that an item is added in the
   * front of the queue with the cost passed to this method
   */
  public pauseByCost(cost: number | undefined) {
    this.stopTimer();

    if (this.debug) {
      console.log(`Pausing bucket for ${cost} cost`);
    }

    this.throttle(cost, false, true);
  }

  /**
   * Pause the bucket for n seconds. means that an item with the cost for one
   * second is added at the beginning of the queue
   */
  public pause(seconds: number = 1) {
    this.drain();
    this.stopTimer();

    const cost = this.refillRate * seconds;

    if (this.debug) {
      console.log(`Pausing bucket for ${seconds} seonds`);
    }

    this.pauseByCost(cost);
  }

  /**
   * Drains the bucket, so that nothing can be executed at the moment
   */
  private drain() {
    if (this.debug) {
      console.log(
        `Draining the bucket, removing ${this.currentCapacity} from it, so that the current capacity is 0`,
      );
    }

    this.currentCapacity = 0;

    if (this.debug) {
      console.log(`The current capacity is now ${this.currentCapacity}`);
    }

    this.lastRefill = Date.now();
  }

  /**
   * Set the timeout value for the bucket. this is the amount of time no item
   * may longer wait for.
   */
  public setTimeout(timeout: number | undefined) {
    if (this.debug) {
      console.log(`the buckets timeout is now ${timeout}`);
    }

    this.timeout = timeout || 0;
    this.updateVariables();

    return this;
  }

  /**
   * Set the interval within which the capacity can be used
   */
  public setInterval(interval: number) {
    if (this.debug) {
      console.log(`the buckets interval is now ${interval}`);
    }

    this.interval = interval;
    this.updateVariables();

    return this;
  }

  /**
   * Set the capacity of the bucket. this si the capacity that can be used per interval
   */
  public setCapacity(capacity: number) {
    if (this.debug) {
      console.log(`the buckets capacity is now ${capacity}`);
    }

    this.capacity = capacity;
    this.updateVariables();

    return this;
  }

  /**
   * Calculates the values of some frequently used variables on the bucket
   */
  private updateVariables() {
    // Take one as default for each variable since this method may be called
    // before every variable was set
    this.maxCapacity =
      ((this.timeout || 1) / (this.interval || 1)) * (this.capacity || 1);

    // The rate, at which the leaky bucket is filled per second
    this.refillRate = (this.capacity || 1) / (this.interval || 1);

    if (this.debug) {
      console.log(`the buckets max capacity is now ${this.maxCapacity}`);
    }

    if (this.debug) {
      console.log(`the buckets refill rate is now ${this.refillRate}`);
    }
  }
}
