'use strict'
const {isMainThread, threadId, parentPort} = require('worker_threads');
const isInWorkerThread = !isMainThread;

if (isInWorkerThread) {
  process.env.isInWorkerThread = isInWorkerThread;
  process.env.threadId = threadId;
}

process.sendToParent = function sendToParent(msg) {
  if (isInWorkerThread) {
    parentPort.postMessage(msg);
  }
  else {
    process.send(msg);
  }
}

// worker module
let $module;

function handle (data) {
  let idx      = data.idx
    , child    = data.child
    , method   = data.method
    , args     = data.args
    , callback = function () {
        let _args = Array.prototype.slice.call(arguments)
        if (_args[0] instanceof Error) {
          let e = _args[0]
          _args[0] = {
              '$error'  : '$error'
            , 'type'    : e.constructor.name
            , 'message' : e.message
            , 'stack'   : e.stack
          }
          Object.keys(e).forEach(function(key) {
            _args[0][key] = e[key]
          })
        }
        process.sendToParent({ owner: 'farm', idx: idx, child: child, args: _args })
      }
    , exec

  if (method == null && typeof $module == 'function')
    exec = $module
  else if (typeof $module[method] == 'function')
    exec = $module[method]

  if (!exec) {
    callback(new Error('NO SUCH METHOD: ' + method));
    return;
  }

  exec.apply(null, args.concat([ callback ]))
}

function onMessage(data) {
  if (data.owner !== 'farm') {
    return;
  }

  if (!$module) return $module = require(data.module)
  if (data.event == 'die') {
    process.serverStatus = false;
    process.emit('workerExit');
    setImmediate(() => {
      process.exit(0);
    });
    return;
  }

  handle(data)
}

if (isInWorkerThread) {
  parentPort.on('message', onMessage);
}
else {
  process.on('message', onMessage);
}
