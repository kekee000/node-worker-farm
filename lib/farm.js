'use strict'

const {
    fork,
    stopChildWithTimeout
} = require('./fork');
const {
    TimeoutError,
    ProcessTerminatedError,
    MaxConcurrentCallsError
} = require('./utils/errors');

const DEFAULT_OPTIONS = {
    workerOptions: {},
    maxCallsPerWorker: Infinity,
    maxConcurrentWorkers: (require('os').cpus() || { length: 1 }).length,
    maxConcurrentCallsPerWorker: 10,
    maxConcurrentCalls: Infinity,
    maxCallTime: Infinity, // exceed this and the whole worker is terminated
    maxRetries: Infinity,
    forcedKillTime: 100,
    autoStart: false,
    onChild: function () {},
    asyncInit: false,
    maxInitTime: Infinity
}

function Farm(options, path) {
    this.options = Object.assign({}, DEFAULT_OPTIONS, options)
    this.path = path
    this.activeCalls = 0
}


// make a handle to pass back in the form of an external API
Farm.prototype.mkhandle = function (method) {
    return function () {
        let args = Array.prototype.slice.call(arguments)
        if (this.activeCalls + this.callQueue.length >= this.options.maxConcurrentCalls) {
            let err = new MaxConcurrentCallsError('Too many concurrent calls (active: ' + this.activeCalls + ', queued: ' + this.callQueue.length + ')')
            if (typeof args[args.length - 1] == 'function')
                return process.nextTick(args[args.length - 1].bind(null, err))
            throw err;
        }
        this.addCall({
            method: method
            , callback: args.pop()
            , args: args
            , retries: 0
        })
    }.bind(this)
}


// a constructor of sorts
Farm.prototype.setup = async function (methods) {
    let iface
    if (!methods) { // single-function export
        iface = this.mkhandle()
    } else { // multiple functions on the export
        iface = {}
        methods.forEach(function (m) {
            iface[m] = this.mkhandle(m)
        }.bind(this))
    }

    this.searchStart = -1;
    this.childId = -1;
    this.children = {};
    this.activeChildren = 0;
    this.startingChildren = 0;
    this.callQueue = [];

    if (this.options.autoStart) {
        let childStarting = [];
        while (this.activeChildren + this.startingChildren
            < this.options.maxConcurrentWorkers) {
            childStarting.push(this.startChild());
        }

        try {
            await Promise.all(childStarting);
        }
        catch(e) {
            this.end();
            throw e;
        }
    }

    return iface;
}


// when a child exits, check if there are any outstanding jobs and requeue them
Farm.prototype.onExit = function (childId) {
    // delay this to give any sends a chance to finish
    setTimeout(async function () {
        let doQueue = false
        if (this.children[childId] && this.children[childId].activeCalls) {
            this.children[childId].calls.forEach(async function (call, i) {
                if (!call) return
                else if (call.retries >= this.options.maxRetries) {
                    await this.receive({
                        idx: i
                        , child: childId
                        , args: [new ProcessTerminatedError('cancel after ' + call.retries + ' retries!')]
                    })
                } else {
                    call.retries++
                    this.callQueue.unshift(call)
                    doQueue = true
                }
            }.bind(this))
        }
        this.stopChild(childId)
        doQueue && await this.processQueue()
    }.bind(this), 10)
}


// start a new worker
Farm.prototype.startChild = async function () {
    this.childId++;
    this.startingChildren++;
    const id = this.childId;

    let forked;
    try {
        forked = await fork(this.path, this.options.workerOptions, {
            asyncInit: this.options.asyncInit,
            forcedKillTime: this.options.forcedKillTime,
            maxInitTime: this.options.maxInitTime
        });
    }
    finally {
        this.startingChildren--;
    }

    let c = {
        send: forked.send,
        child: forked.child,
        calls: [],
        activeCalls: 0,
        exitCode: null
    }

    this.options.onChild(forked.child);
    forked.child.on('message', async function (data) {
        if (data.owner !== 'farm') {
            return;
        }

        await this.receive(data);
    }.bind(this))
    forked.child.once('exit', async function (code) {
        c.exitCode = code;
        this.onExit(id);
    }.bind(this));

    this.activeChildren++;
    this.children[id] = c;

    this.processQueue();
}

// stop a worker, identified by id
Farm.prototype.stopChild = function (childId) {
    let child = this.children[childId]
    if (child) {
        delete this.children[childId];
        this.activeChildren--;
        stopChildWithTimeout(child, this.options.forcedKillTime);
    }
}


// called from a child process, the data contains information needed to
// look up the child and the original call so we can invoke the callback
Farm.prototype.receive = async function (data) {
    let idx = data.idx
        , childId = data.child
        , args = data.args
        , child = this.children[childId]
        , call

    if (!child) {
        /* istanbul ignore next */
        return console.error(
            'Worker Farm: Received message for unknown child. '
            + 'This is likely as a result of premature child death, '
            + 'the operation will have been re-queued.'
        )
    }

    call = child.calls[idx]
    if (!call) {
        /* istanbul ignore next */
        return console.error(
            'Worker Farm: Received message for unknown index for existing child. '
            + 'This should not happen!'
        )
    }

    if (this.options.maxCallTime !== Infinity)
        clearTimeout(call.timer)

    if (args[0] && args[0].$error == '$error') {
        let e = args[0]
        switch (e.type) {
            /* istanbul ignore next */
            case 'TypeError': args[0] = new TypeError(e.message); break
            /* istanbul ignore next */
            case 'RangeError': args[0] = new RangeError(e.message); break
            /* istanbul ignore next */
            case 'EvalError': args[0] = new EvalError(e.message); break
            /* istanbul ignore next */
            case 'ReferenceError': args[0] = new ReferenceError(e.message); break
            /* istanbul ignore next */
            case 'SyntaxError': args[0] = new SyntaxError(e.message); break
            /* istanbul ignore next */
            case 'URIError': args[0] = new URIError(e.message); break
            default: args[0] = new Error(e.message)
        }
        args[0].type = e.type
        args[0].stack = e.stack

        // Copy any custom properties to pass it on.
        Object.keys(e).forEach(function (key) {
            args[0][key] = e[key];
        });
    }

    process.nextTick(function () {
        call.callback.apply(null, args);
    }); 
    
    delete child.calls[idx];
    child.activeCalls--;
    this.activeCalls--;

    if (child.calls.length >= this.options.maxCallsPerWorker
        && !Object.keys(child.calls).length) {
        // this child has finished its run, kill it
        this.stopChild(childId)
    }

    // allow any outstanding calls to be processed
    this.processQueue()
}


Farm.prototype.childTimeout = async function (childId) {
    let child = this.children[childId];
    let i;

    /* istanbul ignore next */
    if (!child) {
        return;
    }

    child.activeCalls = Infinity;
    for (i in child.calls) {
        this.receive({
            idx: i
            , child: childId
            , args: [new TimeoutError('worker call timed out!')]
        })
    }

    this.stopChild(childId);
    this.processQueue();
}


// send a call to a worker, identified by id
Farm.prototype.send = function (childId, call) {
    let child = this.children[childId]
        , idx = child.calls.length

    child.calls.push(call)
    child.activeCalls++
    this.activeCalls++

    if (child.exitCode !== null) {
        /* istanbul ignore next */
        return;
    }

    child.send({
        owner: 'farm'
        , idx: idx
        , child: childId
        , method: call.method
        , args: call.args
    })

    if (this.options.maxCallTime !== Infinity) {
        call.timer =
            setTimeout(this.childTimeout.bind(this, childId), this.options.maxCallTime)
    }
}


// a list of active worker ids, in order, but the starting offset is
// shifted each time this method is called, so we work our way through
// all workers when handing out jobs
Farm.prototype.childKeys = function () {
    let cka = Object.keys(this.children)
        , cks

    if (this.searchStart >= cka.length - 1)
        this.searchStart = 0
    else
        this.searchStart++

    cks = cka.splice(0, this.searchStart)

    return cka.concat(cks)
}


// Calls are added to a queue, this processes the queue and is called
// whenever there might be a chance to send more calls to the workers.
// The various options all impact on when we're able to send calls,
// they may need to be kept in a queue until a worker is ready.
Farm.prototype.processQueue = async function () {
    let cka, i = 0, childId

    if (!this.callQueue.length)
        return this.ending && this.end()

    if (this.activeChildren + this.startingChildren
        < this.options.maxConcurrentWorkers) {
        this.startChild().catch(e => {
            console.error(e.message);
        });
    }

    for (cka = this.childKeys(); i < cka.length; i++) {
        childId = +cka[i]
        if (this.children[childId].activeCalls < this.options.maxConcurrentCallsPerWorker
            && this.children[childId].calls.length < this.options.maxCallsPerWorker
            && this.children[childId].child.exitCode === null) {

            this.send(childId, this.callQueue.shift());

            if (!this.callQueue.length) {
                return this.ending && this.end()
            }
        }
    }

    if (this.ending) {
        this.end();
    }
}


// add a new call to the call queue, then trigger a process of the queue
Farm.prototype.addCall = async function (call) {
    if (this.ending) {
        return this.end(); // don't add anything new to the queue
    }
    this.callQueue.push(call)
    this.processQueue()
}


// kills child workers when they're all done
Farm.prototype.end = function (callback) {
    let complete = true
    if (this.ending === false) {
        return;
    }
    if (callback)
        this.ending = callback
    else if (this.ending == null)
        this.ending = true
    Object.keys(this.children).forEach(function (child) {
        if (!this.children[child])
            /* istanbul ignore next */
            return
        if (!this.children[child].activeCalls)
            this.stopChild(child)
        else
            complete = false
    }.bind(this))

    if (this.startingChildren > 0) {
        complete = false;
    }

    if (complete && typeof this.ending === 'function') {
        process.nextTick(function () {
            if (typeof this.ending === 'function') {
                this.ending();
            }
            this.ending = false
        }.bind(this))
    }
}

Farm.prototype.getQueue = function () {
    let queueInfo = { 'total': this.activeCalls + this.callQueue.length }
        , i
    for (i in this.children) {
        queueInfo[this.children[i].child.pid] = this.children[i].activeCalls
    }
    return queueInfo
}

module.exports = Farm
module.exports.TimeoutError = TimeoutError
