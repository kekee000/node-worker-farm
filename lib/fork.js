'use strict'

const childProcess = require('child_process');
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
    if (!child || child.exitCode !== null) {
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

    // 这里监听一下 error 事件，是为了拦截子进程异常退出
    // 否则 kill 子进程 pid 会造成主进程也退出
    child.on('error', function() {
        // this *should* be picked up by onExit and the operation requeued
    });
    
    child.send({ owner: 'farm', module: forkModule });

    if (opt.asyncInit) {
        try {
            await waitForInit(child, opt.maxInitTime);
        }
        catch (e) {
            stopChildWithTimeout(child, opt.forcedKillTime);
            throw e;
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
