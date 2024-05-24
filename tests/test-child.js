'use strict'

const tape = require('tape');
const child_process = require('child_process');
const workerFarm = require('../');
const childPath = require.resolve('./child');
const asyncChildPath = require.resolve('./async-child');
const asyncErrorChildPath = require.resolve('./async-child-error');
const asyncMayErrorChildPath = require.resolve('./async-child-may-error');
const fs = require('fs');
const os = require('os');

function uniq(ar) {
    let a = [], i, j
    o: for (i = 0; i < ar.length; ++i) {
        for (j = 0; j < a.length; ++j) if (a[j] == ar[i]) continue o
        a[a.length] = ar[i]
    }
    return a
}


// a child where module.exports = function ...
tape('simple, exports=function test', async function (t) {
    t.plan(4)

    let child = await workerFarm(childPath)
    child(0, function (err, pid, rnd) {
        t.ok(pid > process.pid, 'pid makes sense')
        t.ok(pid < process.pid + 750, 'pid makes sense')
        t.ok(rnd >= 0 && rnd < 1, 'rnd result makes sense')
    })

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
})


// a child where we have module.exports.fn = function ...
tape('simple, exports.fn test', async function (t) {
    t.plan(4)

    let child = await workerFarm(childPath, ['run0'])
    child.run0(function (err, pid, rnd) {
        t.ok(pid > process.pid, 'pid makes sense')
        t.ok(pid < process.pid + 750, 'pid makes sense')
        t.ok(rnd >= 0 && rnd < 1, 'rnd result makes sense')
    })

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
})

tape('async init', async function (t) {
    t.plan(4)

    let child = await workerFarm({
        asyncInit: true
    }, asyncChildPath);
    child(0, function (err, pid, rnd) {
        t.ok(pid > process.pid, 'pid makes sense')
        t.ok(pid < process.pid + 750, 'pid makes sense')
        t.ok(rnd >= 0 && rnd < 1, 'rnd result makes sense')
    })

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
});

tape('async init timeout', async function (t) {
    t.plan(4)

    let child;
    try {
        child = await workerFarm({
            asyncInit: true,
            maxInitTime: 1000,
            maxConcurrentWorkers: 1,
            autoStart: true
        }, childPath);
    }
    catch (e) {
        t.ok(e, 'got an error');
        t.equal(e.type, 'WorkerInitError', 'correct error type')
    }

    t.notOk(child, 'no api');

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
});


tape('on child', async function (t) {
    t.plan(2)

    let childPid = null;
    let child = await workerFarm({
        onChild: function (subprocess) {
            t.ok(!!subprocess.pid, 'subprocess pid');
            childPid = subprocess.pid
        },
        maxConcurrentWorkers: 1
    }, childPath);

    child(0, function (err, pid) {
    });

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
})


// use the returned pids to check that we're using a single child process
// when maxConcurrentWorkers = 1
tape('single worker', async function (t) {
    t.plan(2)

    let child = await workerFarm({ maxConcurrentWorkers: 1 }, childPath)
        , pids = []
        , i = 10

    while (i--) {
        child(0, function (err, pid) {
            pids.push(pid)
            if (pids.length == 10) {
                t.equal(1, uniq(pids).length, 'only a single process (by pid)')
            } else if (pids.length > 10)
                t.fail('too many callbacks!')
        })
    }

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
})


// use the returned pids to check that we're using two child processes
// when maxConcurrentWorkers = 2
tape('two workers', async function (t) {
    t.plan(2)

    let child = await workerFarm({ maxConcurrentWorkers: 2 }, childPath)
        , pids = []
        , i = 10

    while (i--) {
        child(0, function (err, pid) {
            pids.push(pid)
            if (pids.length == 10) {
                t.equal(2, uniq(pids).length, 'only two child processes (by pid)')
            } else if (pids.length > 10)
                t.fail('too many callbacks!')
        })
    }

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
})


// use the returned pids to check that we're using a child process per
// call when maxConcurrentWorkers = 10
tape('many workers', async function (t) {
    t.plan(2)

    let child = await workerFarm({
        maxConcurrentWorkers: 10,
        // maxConcurrentCallsPerWorker: 1
        autoStart: true
    }, childPath)
        , pids = []
        , i = 10

    while (i--) {
        child(1, function (err, pid) {
            pids.push(pid)
            if (pids.length == 10) {
                t.equal(10, uniq(pids).length, 'pids are all the same (by pid)')
            } else if (pids.length > 10)
                t.fail('too many callbacks!')
        })
    }

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
})


tape('auto start workers', async function (t) {
    let child = await workerFarm({ maxConcurrentWorkers: 3, autoStart: true }, childPath, ['uptime'])
        , pids = []
        , count = 5
        , i = count
        , delay = 250

    t.plan(count + 1)

    setTimeout(function () {
        while (i--)
            child.uptime(function (err, uptime) {
                t.ok(uptime > 10, 'child has been up before the request (' + uptime + 'ms)')
            })

        workerFarm.end(child, function () {
            t.ok(true, 'workerFarm ended')
        })
    }, delay)
})


// use the returned pids to check that we're using a child process per
// call when we set maxCallsPerWorker = 1 even when we have maxConcurrentWorkers = 1
tape('single call per worker', async function (t) {
    t.plan(2)

    let child = await workerFarm({
        maxConcurrentWorkers: 1
        , maxConcurrentCallsPerWorker: Infinity
        , maxCallsPerWorker: 1
        , autoStart: true
    }, childPath)
        , pids = []
        , count = 25
        , i = count

    while (i--) {
        child(0, function (err, pid) {
            pids.push(pid)
            if (pids.length == count) {
                t.equal(count, uniq(pids).length, 'one process for each call (by pid)')
                workerFarm.end(child, function () {
                    t.ok(true, 'workerFarm ended')
                })
            } else if (pids.length > count)
                t.fail('too many callbacks!')
        })
    }
})


// use the returned pids to check that we're using a child process per
// two-calls when we set maxCallsPerWorker = 2 even when we have maxConcurrentWorkers = 1
tape('two calls per worker', async function (t) {
    t.plan(2)

    let child = await workerFarm({
        maxConcurrentWorkers: 1
        , maxConcurrentCallsPerWorker: Infinity
        , maxCallsPerWorker: 2
        , autoStart: true
    }, childPath)
        , pids = []
        , count = 20
        , i = count

    while (i--) {
        child(0, function (err, pid) {
            pids.push(pid)
            if (pids.length == count) {
                t.equal(count / 2, uniq(pids).length, 'one process for each call (by pid)')
                workerFarm.end(child, function () {
                    t.ok(true, 'workerFarm ended')
                })
            } else if (pids.length > count)
                t.fail('too many callbacks!')
        })
    }
})


// use timing to confirm that one worker will process calls sequentially
tape('many concurrent calls', async function (t) {
    t.plan(2)

    let child = await workerFarm({
        maxConcurrentWorkers: 1
        , maxConcurrentCallsPerWorker: Infinity
        , maxCallsPerWorker: Infinity
        , autoStart: true
    }, childPath)
        , defer = 200
        , count = 200
        , i = count
        , cbc = 0

    setTimeout(function () {
        let start = Date.now()

        while (i--) {
            child(defer, function () {
                if (++cbc == count) {
                    let time = Date.now() - start
                    // upper-limit not tied to `count` at all
                    t.ok(time > defer && time < (defer * 2.5), 'processed tasks concurrently (' + time + 'ms)')
                    workerFarm.end(child, function () {
                        t.ok(true, 'workerFarm ended')
                    })
                } else if (cbc > count)
                    t.fail('too many callbacks!')
            })
        }
    }, 250)
})


// use timing to confirm that one child processes calls sequentially with
// maxConcurrentCallsPerWorker = 1
tape('single concurrent call', async function (t) {
    t.plan(2)

    let child = await workerFarm({
        maxConcurrentWorkers: 1
        , maxConcurrentCallsPerWorker: 1
        , maxCallsPerWorker: Infinity
        , autoStart: true
    }, childPath)
        , defer = 20
        , count = 100
        , i = count
        , cbc = 0

    setTimeout(function () {
        let start = Date.now()

        while (i--) {
            child(defer, function () {
                if (++cbc == count) {
                    let time = Date.now() - start
                    // upper-limit tied closely to `count`, 1.3 is generous but accounts for all the timers
                    // coming back at the same time and the IPC overhead
                    t.ok(time > (defer * count) && time < (defer * count * 1.3), 'processed tasks sequentially (' + time + ')')
                    workerFarm.end(child, function () {
                        t.ok(true, 'workerFarm ended')
                    })
                } else if (cbc > count)
                    t.fail('too many callbacks!')
            })
        }
    }, 250)
})


// use timing to confirm that one child processes *only* 5 calls concurrently
tape('multiple concurrent calls', async function (t) {
    t.plan(2)

    let callsPerWorker = 5
        , child = await workerFarm({
            maxConcurrentWorkers: 1
            , maxConcurrentCallsPerWorker: callsPerWorker
            , maxCallsPerWorker: Infinity
            , autoStart: true
        }, childPath)
        , defer = 100
        , count = 100
        , i = count
        , cbc = 0

    setTimeout(function () {
        let start = Date.now()

        while (i--) {
            child(defer, function () {
                if (++cbc == count) {
                    let time = Date.now() - start
                    let min = defer * 1.5
                    // (defer * (count / callsPerWorker + 2)) - if precise it'd be count/callsPerWorker
                    // but accounting for IPC and other overhead, we need to give it a bit of extra time,
                    // hence the +2
                    let max = defer * (count / callsPerWorker + 2)
                    t.ok(time > min && time < max, 'processed tasks concurrently (' + time + ' > ' + min + ' && ' + time + ' < ' + max + ')')
                    workerFarm.end(child, function () {
                        t.ok(true, 'workerFarm ended')
                    })
                } else if (cbc > count)
                    t.fail('too many callbacks!')
            })
        }
    }, 250)
})


// call a method that will die with a probability of 0.5 but expect that
// we'll get results for each of our calls anyway
tape('durability', async function (t) {
    t.plan(3)

    let child = await workerFarm({ maxConcurrentWorkers: 2 }, childPath, ['killable'])
        , ids = []
        , pids = []
        , count = 20
        , i = count

    while (i--) {
        child.killable(i, function (err, id, pid) {
            ids.push(id)
            pids.push(pid)
            if (ids.length == count) {
                t.ok(uniq(pids).length > 2, 'processed by many (' + uniq(pids).length + ') workers, but got there in the end!')
                t.ok(uniq(ids).length == count, 'received a single result for each unique call')
                workerFarm.end(child, function () {
                    t.ok(true, 'workerFarm ended')
                })
            } else if (ids.length > count)
                t.fail('too many callbacks!')
        })
    }
})


// a callback provided to .end() can and will be called (uses "simple, exports=function test" to create a child)
tape('simple, end callback', async function (t) {
    t.plan(4)

    let child = await workerFarm(childPath)
    child(0, function (err, pid, rnd) {
        t.ok(pid > process.pid, 'pid makes sense ' + pid + ' vs ' + process.pid)
        t.ok(pid < process.pid + 750, 'pid makes sense ' + pid + ' vs ' + process.pid)
        t.ok(rnd >= 0 && rnd < 1, 'rnd result makes sense')
    })

    workerFarm.end(child, function () {
        t.pass('an .end() callback was successfully called')
    })
})


tape('call timeout test', async function (t) {
    t.plan(3 + 3 + 4 + 3 + 3 + 1)

    let child = await workerFarm({
        maxCallTime: 250,
        maxConcurrentWorkers: 1,
        // autoStart: true
    }, childPath);

    // should come back ok
    child(50, function (err, pid, rnd) {
        t.ok(pid > process.pid, 'pid makes sense ' + pid + ' vs ' + process.pid)
        t.ok(pid < process.pid + 750, 'pid makes sense ' + pid + ' vs ' + process.pid)
        t.ok(rnd > 0 && rnd < 1, 'rnd result makes sense ' + rnd)
    })

    // should come back ok
    child(50, function (err, pid, rnd) {
        t.ok(pid > process.pid, 'pid makes sense ' + pid + ' vs ' + process.pid)
        t.ok(pid < process.pid + 750, 'pid makes sense ' + pid + ' vs ' + process.pid)
        t.ok(rnd > 0 && rnd < 1, 'rnd result makes sense ' + rnd)
    })

    // should die
    child(1000, function (err, pid, rnd) {
        t.ok(err, 'got an error')
        t.equal(err.type, 'TimeoutError', 'correct error type')
        t.ok(pid === undefined, 'no pid')
        t.ok(rnd === undefined, 'no rnd')
    })

    // should be ok, new worker
    setTimeout(function () {
        child(50, function (err, pid, rnd) {
            t.ok(pid > process.pid, 'pid makes sense ' + pid + ' vs ' + process.pid)
            t.ok(pid < process.pid + 750, 'pid makes sense ' + pid + ' vs ' + process.pid)
            t.ok(rnd > 0 && rnd < 1, 'rnd result makes sense ' + rnd)
        })

        // should be ok, custom maxCallTime
        child(1000, {
            callback(err, pid, rnd) {
                t.ok(pid > process.pid, 'pid makes sense ' + pid + ' vs ' + process.pid)
                t.ok(pid < process.pid + 750, 'pid makes sense ' + pid + ' vs ' + process.pid)
                t.ok(rnd > 0 && rnd < 1, 'rnd result makes sense ' + rnd)
            },
            maxCallTime: 2000
        });

        workerFarm.end(child, function () {
            t.ok(true, 'workerFarm ended')
        })
    }, 500);


})


tape('test error passing', async function (t) {
    t.plan(10)

    let child = await workerFarm(childPath, ['err'])
    child.err('Error', 'this is an Error', function (err) {
        t.ok(err instanceof Error, 'is an Error object')
        t.equal('Error', err.type, 'correct type')
        t.equal('this is an Error', err.message, 'correct message')
    })
    child.err('TypeError', 'this is a TypeError', function (err) {
        t.ok(err instanceof Error, 'is a TypeError object')
        t.equal('TypeError', err.type, 'correct type')
        t.equal('this is a TypeError', err.message, 'correct message')
    })
    child.err('Error', 'this is an Error with custom props', { foo: 'bar', 'baz': 1 }, function (err) {
        t.ok(err instanceof Error, 'is an Error object')
        t.equal(err.foo, 'bar', 'passes data')
        t.equal(err.baz, 1, 'passes data')
    })

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
})


tape('test maxConcurrentCalls', async function (t) {
    t.plan(11)

    let child = await workerFarm({ maxConcurrentCalls: 5 }, childPath)

    child(50, function (err) { t.notOk(err, 'no error') })
    child(50, function (err) { t.notOk(err, 'no error') })
    child(50, function (err) { t.notOk(err, 'no error') })
    child(50, function (err) { t.notOk(err, 'no error') })
    child(50, function (err) { t.notOk(err, 'no error') })
    child(50, function (err) {
        t.ok(err)
        t.equal(err.type, 'MaxConcurrentCallsError', 'correct error type')
    });
    child(50, function (err) {
        t.ok(err)
        t.equal(err.type, 'MaxConcurrentCallsError', 'correct error type')
    });

    try {
        child(50);
    }
    catch (e) {
        t.ok(e);
    }

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
})


tape('test maxConcurrentCalls + queue', async function (t) {
    t.plan(13)

    let child = await workerFarm({ maxConcurrentCalls: 4, maxConcurrentWorkers: 2, maxConcurrentCallsPerWorker: 1 }, childPath)

    child(20, function (err) { console.log('ended short1'); t.notOk(err, 'no error, short call 1') })
    child(20, function (err) { console.log('ended short2'); t.notOk(err, 'no error, short call 2') })
    child(300, function (err) { t.notOk(err, 'no error, long call 1') })
    child(300, function (err) { t.notOk(err, 'no error, long call 2') })
    child(20, function (err) {
        t.ok(err, 'short call 3 should error')
        t.equal(err.type, 'MaxConcurrentCallsError', 'correct error type')
    })
    child(20, function (err) {
        t.ok(err, 'short call 4 should error')
        t.equal(err.type, 'MaxConcurrentCallsError', 'correct error type')
    })

    // cross fingers and hope the two short jobs have ended
    setTimeout(function () {
        child(20, function (err) { t.notOk(err, 'no error, delayed short call 1') })
        child(20, function (err) { t.notOk(err, 'no error, delayed short call 2') })
        child(20, function (err) {
            t.ok(err, 'delayed short call 3 should error')
            t.equal(err.type, 'MaxConcurrentCallsError', 'correct error type')
        })

        workerFarm.end(child, function () {
            t.ok(true, 'workerFarm ended')
        })
    }, 250)
})


// this test should not keep the process running! if the test process
// doesn't die then the problem is here
tape('test timeout kill', async function (t) {
    t.plan(3)

    let child = await workerFarm({ maxCallTime: 250, maxConcurrentWorkers: 1 }, childPath, ['block'])
    child.block(function (err) {
        t.ok(err, 'got an error')
        t.equal(err.type, 'TimeoutError', 'correct error type')
    })

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
})


tape('test max retries after process terminate', async function (t) {
    t.plan(7)

    // temporary file is used to store the number of retries among terminating workers
    let filepath1 = '.retries1'
    let child1 = await workerFarm({ maxConcurrentWorkers: 1, maxRetries: 5 }, childPath, ['stubborn'])
    child1.stubborn(filepath1, function (err, result) {
        t.notOk(err, 'no error')
        t.equal(result, 12, 'correct result')
    })

    workerFarm.end(child1, function () {
        fs.unlinkSync(filepath1)
        t.ok(true, 'workerFarm ended')
    })

    let filepath2 = '.retries2'
    let child2 = await workerFarm({ maxConcurrentWorkers: 1, maxRetries: 3 }, childPath, ['stubborn'])
    child2.stubborn(filepath2, function (err, result) {
        t.ok(err, 'got an error')
        t.equal(err.type, 'ProcessTerminatedError', 'correct error type')
        t.equal(err.message, 'cancel after 3 retries!', 'correct message and number of retries')
    })

    workerFarm.end(child2, function () {
        fs.unlinkSync(filepath2)
        t.ok(true, 'workerFarm ended')
    })
})


tape('custom arguments can be passed to "fork"', async function (t) {
    t.plan(3)

    // allocate a real, valid path, in any OS
    let cwd = fs.realpathSync(os.tmpdir())
        , workerOptions = {
            cwd: cwd
            , execArgv: ['--expose-gc']
        }
        , child = await workerFarm({ maxConcurrentWorkers: 1, maxRetries: 5, workerOptions: workerOptions }, childPath, ['args'])

    child.args(function (err, result) {
        t.equal(result.execArgv[0], '--expose-gc', 'flags passed (overridden default)')
        t.equal(result.cwd, cwd, 'correct cwd folder')
    })

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
})


tape('ensure --debug/--inspect not propagated to children', async function (t) {
    t.plan(3)

    let script = __dirname + '/debug.js'
        , debugArg = process.version.replace(/^v(\d+)\..*$/, '$1') >= 8 ? '--inspect' : '--debug=8881'
        , child = child_process.spawn(process.execPath, [debugArg, script])
        , stdout = ''

    child.stdout.on('data', function (data) {
        stdout += data.toString()
    })

    child.on('close', function (code) {
        t.equal(code, 0, 'exited without error (' + code + ')')
        t.ok(stdout.indexOf('FINISHED') > -1, 'process finished')
        t.ok(stdout.indexOf('--debug') === -1, 'child does not receive debug flag')
    })
})

tape('NO SUCH METHOD', async function (t) {
    t.plan(2);
    let child = await workerFarm({
        maxConcurrentWorkers: 1,
        onChild(child) {
            child.send({});
        }
    }, childPath, ['methodNotExist']);
    child.methodNotExist(0, function (err, pid, rnd) {
        t.ok(err, 'got an error');
    });

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended');
    })
})

tape('queue', async function (t) {
    t.plan(4);
    let child = await workerFarm({
        maxConcurrentWorkers: 10,
        autoStart: true
    }, childPath);
    const queue = workerFarm.queue(child);
    t.ok(queue.total === 0, 'no calls');
    t.ok(Object.keys(queue).length === 11, '10 workers and total');

    t.ok(JSON.stringify(workerFarm.queue()) === '{}');

    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    })
});

tape('async init error', async function (t) {
    t.plan(1);

    try {
        await workerFarm({
            maxConcurrentWorkers: 10,
            autoStart: true,
            asyncInit: true
        }, asyncErrorChildPath);
    }
    catch (e) {
        t.ok(e.message === 'Error Occur While Worker Init', 'Error Occur While Worker Init');
    }
});

tape('add new while ending', async function (t) {
    t.plan(1);
    let child = await workerFarm({
        maxConcurrentWorkers: 10,
        autoStart: true
    }, childPath);
    workerFarm.end(child, function () {
        t.ok(true, 'workerFarm ended')
    });

    child(0, () => {
        t.ok(true);
    });

    process.nextTick(() => {
        workerFarm.end(child, function () {
            t.ok(true, 'workerFarm ended')
        });
    });
});

tape('starting child error', async function (t) {
    t.plan(10);
    let child = await workerFarm({
        maxConcurrentWorkers: 10,
        asyncInit: true
    }, asyncMayErrorChildPath);

    let i = 10;
    while (i--) {
        child(0, function () {
            t.ok(true);
        });
    }
    workerFarm.end(child, function () {
    });
});