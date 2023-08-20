import is from "is_js";

import guid from "./guid.js";

export class PreloadQueue {
    // Init preload queue
    constructor(type = "desktop", startCb, endCb) {
        this.isRunning = false;

        this.type = type;

        // count storage
        this._count = 0;
        this._downloaded = 0;
        this._length = 0;

        // max load in one time param
        this.maxCount = 1;

        // queue storage
        this.queue = {};

        this.started = false;

        // download time storage
        this.downloadTime = {};
        this.downloadWindow = [];

        // save start and end callbacks
        this.endCb = endCb;
        this.startCb = startCb;

        return this;
    }

    /**
     * Return current processing count
     * @return {Number} Current processing count
     */
    get count() {
        return this._count;
    }

    /**
     * Return downloaded count
     * @return {Number} Downloaded count
     */
    get downloaded() {
        return this._downloaded;
    }

    /**
     * Return queue length
     * @return {Number} Queue length
     */
    get length() {
        return this._length;
    }

    /**
     * Return ETA value in ms
     * @return {Number} ETA value
     */
    get eta() {
        const averageTime =
            this.downloadWindow.reduce((a, b) => a + b, 0) /
            this.downloadWindow.length;

        return (this.length - this.downloaded) * averageTime;
    }

    /**
     * Get first priority task
     * @return {Function}  Task
     */
    getTask() {
        let task;

        const priorities = Object.keys(this.queue).sort();

        priorities.forEach((priority) => {
            if (this.queue[priority].length && !task) {
                task = {
                    priority,
                    cb: this.queue[priority][0],
                    id: guid(),
                };

                return false;
            }
        });

        return task;
    }

    /**
     * Add task to queue
     * @param {Number}   priority Task priority
     * @param {Function} func     Task function
     */
    add(priority, func) {
        if (!(priority in this.queue)) {
            this.queue[priority] = [];
        }

        this.queue[priority].push(func);

        // increment length
        this._length++;

        return this;
    }

    /**
     * Run one task
     * @param  {Function} callback Callback
     * @return {Object}            Priority queue
     */
    runOne(callback) {
        const task = this.getTask();

        if (this.count >= this.maxCount) {
            setTimeout(() => {
                this.runOne();
            }, 10);

            return this;
        }

        if (!task) {
            this.isRunning = false;

            if (is.function(this.endCb) && this._downloaded == this._length) {
                this.endCb(this);
            }

            return this;
        }

        this._count++;

        // init time in download storage
        this.downloadTime[task.id] = {
            start: Date.now(),
            end: null,
        };

        Object.defineProperty(this.downloadTime[task.id], "value", {
            get() {
                return this.end - this.start;
            },
        });

        task.cb((cb) => {
            if (!this.started) {
                this.started = true;

                // call start cb if defined
                if (this.startCb) {
                    this.startCb(this);
                }
            }

            this._count--;

            // increment downloaded
            this._downloaded++;

            if (this.queue[task.priority].length) {
                this.queue[task.priority].shift();
            }

            this.downloadTime[task.id].end = Date.now();

            // update download window
            if (this.downloadWindow.length >= 10) {
                this.downloadWindow.shift();
            }

            this.downloadWindow.push(this.downloadTime[task.id].value);

            if (cb) {
                cb();
            }

            if (callback) {
                callback();
            }

            if (this.isRunning) {
                this.runOne();
            }
        });

        if (this.isRunning && this.count < this.maxCount) {
            this.runOne();
        }

        return this;
    }

    /**
     * Run tasks
     * @return {Object} Priority queuq
     */
    run() {
        this.isRunning = true;
        this.runOne();

        return this;
    }

    /**
     * Pause tasks
     * @return {Object} Priority queue
     */
    pause() {
        this.isRunning = false;

        return this;
    }
}

export default PreloadQueue;
