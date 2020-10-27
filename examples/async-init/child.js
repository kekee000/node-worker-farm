let count = 0;

setTimeout(() => {
    process.send({
        owner: 'farm-child'
    });
}, Math.random() * 1000 * 10);

module.exports = function (inp, callback) {
    count++;
    console.log(`child run: ${process.pid} ${count}`);

    // if (Math.random() > 0.5) {
    //     throw Error(`errored: ${process.pid}`);
    // }

    setTimeout(() => {
        callback(null, inp + ' BAR (' + process.pid + ')');
    }, Math.random() * 1000 * 10);
}