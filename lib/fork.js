'use strict'

const childProcess = require('child_process')
  , childModule = require.resolve('./child/index')


// TODO: timeout
function waitForInit(child) {
  return new Promise((resolve, reject) => {
    child.on('message', listener);

    function listener(message) {
      if (message.owner === 'farm-child') {
        child.off('message', listener);
        resolve();
      }
    }
  });
}

async function fork(forkModule, workerOptions) {
  // suppress --debug / --inspect flags while preserving others (like --harmony)
  let filteredArgs = process.execArgv.filter(function (v) {
    return !(/^--(debug|inspect)/).test(v)
  })
    , options = Object.assign({
      execArgv: filteredArgs
      , env: process.env
      , cwd: process.cwd()
    }, workerOptions)
    , child = childProcess.fork(childModule, process.argv, options)

  child.on('error', function () {
    // this *should* be picked up by onExit and the operation requeued
  })

  child.send({ owner: 'farm', module: forkModule })

  await waitForInit(child);

  // return a send() function for this child
  return {
    send: child.send.bind(child)
    , child: child
  }
}


module.exports = fork
