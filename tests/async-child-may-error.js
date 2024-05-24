const send = (msg) => process.sendToParent(msg);

setTimeout(() => {
    if (Math.random() < 0.5) {
        process.exit(-1);
    }
    else {
        send({
            owner: 'farm-child'
        });
    }
}, Math.random() * 1000);

module.exports = function (timeout, callback) {
    callback = callback.bind(null, null, process.pid, Math.random(), timeout);

    if (timeout) {
        return setTimeout(callback, timeout)
    }

    callback()
}