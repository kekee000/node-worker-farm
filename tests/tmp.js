'use strict'

const tape          = require('tape')
    , child_process = require('child_process')
    , workerFarm    = require('../')
    , childPath     = require.resolve('./child')
    , fs            = require('fs')
    , os            = require('os')

function uniq (ar) {
  let a = [], i, j
  o: for (i = 0; i < ar.length; ++i) {
    for (j = 0; j < a.length; ++j) if (a[j] == ar[i]) continue o
    a[a.length] = ar[i]
  }
  return a
}

tape('ensure --debug/--inspect not propagated to children', async function (t) {
  t.plan(3)

  let script   = __dirname + '/debug.js'
    , debugArg = process.version.replace(/^v(\d+)\..*$/, '$1') >= 8 ? '--inspect' : '--debug=8881'
    , child    = child_process.spawn(process.execPath, [ debugArg, script ])
    , stdout   = ''

  child.stdout.on('data', function (data) {
    stdout += data.toString()
  })

  child.on('close', function (code) {
    t.equal(code, 0, 'exited without error (' + code + ')')
    t.ok(stdout.indexOf('FINISHED') > -1, 'process finished')
    t.ok(stdout.indexOf('--debug') === -1, 'child does not receive debug flag')
  })
})
