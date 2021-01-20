'use strict'

setTimeout(() => {
    process.send({
        owner: 'farm-child-aaa'
    });
    process.send({
        owner: 'farm-child'
    });
}, Math.random() * 1000);

module.exports = function (timeout, callback) {
    callback = callback.bind(null, null, process.pid, Math.random(), timeout);

    if (timeout) {
        return setTimeout(callback, timeout)
    }

    callback()
}
