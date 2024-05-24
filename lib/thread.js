'use strict'

const {Worker} = require('worker_threads');
const {
    WorkerInitError
} = require('./utils/errors');

const childModule = require.resolve('./child/index');

function waitForInit(child, maxInitTime) {
    return new Promise((resolve, reject) => {
        let timer;

        // 正常
        child.on('message', successListener);

        // 初始化未完成就退出
        child.on('exit', failListener);

        // 超时
        if (maxInitTime !== Infinity) {
            timer = setTimeout(() => {
                clear();
                reject(new WorkerInitError('Worker Init Timeout'));
            }, maxInitTime);
        }


        function clear() {
            child.off('message', successListener);
            child.off('exit', failListener);

            if (timer !== undefined) {
                clearTimeout(timer);
            }
        }

        function successListener(message) {
            if (message.owner === 'farm-child') {
                clear();
                resolve();
            }
        }

        function failListener() {
            clear();
            reject(new WorkerInitError('Error Occur While Worker Init'));
        }
    });
}

function stopChildWithTimeout(child, maxTime) {
    if (!child || child.exitCode != null) {
        return;
    }

    child.send({ owner: 'farm', event: 'die' });
    setTimeout(function () {
        child.worker.terminate();
    }, maxTime).unref()
}

async function fork(forkModule, workerOptions, opt) {
    let filteredArgs = process.execArgv.filter(function (v) {
        return !(/^--(debug|inspect|--expose-gc)/).test(v)
    });

    let options = Object.assign(
        {
            argv: process.argv,
            execArgv: filteredArgs,
            env: process.env,
            cwd: process.cwd(),
            name: 'farm-worker'
        },
        workerOptions
    );

    const child = new Worker(childModule, options);
    child.postMessage({ owner: 'farm', module: forkModule });

    const childWorker = {
        send: child.postMessage.bind(child),
        worker: child
    };
    if (opt.asyncInit) {
        try {
            await waitForInit(child, opt.maxInitTime);
        }
        catch (e) {
            stopChildWithTimeout(childWorker, opt.forcedKillTime);
            throw e;
        }
    }

    return childWorker;
}


module.exports = {
    fork,
    stopChildWithTimeout
};
