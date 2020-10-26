'use strict'

const childProcess = require('child_process');
const {
    WorkerInitError
} = require('./utils/errors');

const childModule = require.resolve('./child/index');

function waitForInit(child, maxInitTime) {
    return new Promise((resolve, reject) => {
        let timer;

        child.on('message', function listener(message) {
            if (message.owner === 'farm-child') {
                child.off('message', listener);

                if (timer !== undefined) {
                    clearTimeout(timer);
                }

                resolve();
            }
        });
        if (maxInitTime !== Infinity) {
            timer = setTimeout(() => {
                reject('Init Timeout');
            }, maxInitTime);
        }
    });
}

function stopChildWithTimeout(child, maxTime) {
    if (!child) {
        return;
    }

    child.send({ owner: 'farm', event: 'die' })
    setTimeout(function () {
        if (child.exitCode === null)
            child.child.kill('SIGKILL')
    }, maxTime).unref()
}

async function fork(forkModule, workerOptions, opt) {
    // suppress --debug / --inspect flags while preserving others (like --harmony)
    let filteredArgs = process.execArgv.filter(function (v) {
        return !(/^--(debug|inspect)/).test(v)
    });

    let options = Object.assign(
        {
            execArgv: filteredArgs,
            env: process.env,
            cwd: process.cwd()
        },
        workerOptions
    );

    const child = childProcess.fork(childModule, process.argv, options);

    child.on('error', function () {
        // this *should* be picked up by onExit and the operation requeued
    });

    child.send({ owner: 'farm', module: forkModule });

    if (opt.asyncInit) {
        try {
            await waitForInit(child, opt.maxInitTime);
        }
        catch (e) {
            stopChildWithTimeout(child, opt.forcedKillTime);
            throw WorkerInitError(e.message);
        }
    }

    // return a send() function for this child
    return {
        send: child.send.bind(child),
        child: child
    }
}


module.exports = {
    fork,
    stopChildWithTimeout
};
