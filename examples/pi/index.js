'use strict'

const CHILDREN         = 500
    , POINTS_PER_CHILD = 1000000
    , FARM_OPTIONS     = {
          maxConcurrentWorkers        : require('os').cpus().length
        , maxCallsPerWorker           : Infinity
        , maxConcurrentCallsPerWorker : 1
      }

let workerFarm = require('../../');
let calcDirect = require('./calc');
let ret
let start

(async () => {
  let calcWorker = await workerFarm(FARM_OPTIONS, require.resolve('./calc'));

  function tally(finish, err, avg) {
    ret.push(avg)
    if (ret.length == CHILDREN) {
      let pi  = ret.reduce(function (a, b) { return a + b }) / ret.length
        , end = +new Date()
      console.log('π ≈', pi, '\t(' + Math.abs(pi - Math.PI), 'away from actual!)')
      console.log('took', end - start, 'milliseconds')
      if (finish)
        finish()
    }
  }

  function calc(method, callback) {
    ret   = []
    start = +new Date()
    for (let i = 0; i < CHILDREN; i++)
      method(POINTS_PER_CHILD, tally.bind(null, callback))
  }

  console.log('Doing it the slow (single-process) way...')
  calc(calcDirect, function () {
    console.log('Doing it the fast (multi-process) way...')
    calc(calcWorker, process.exit)
  })
})();

