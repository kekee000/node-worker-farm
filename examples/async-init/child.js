let count = 0;

// if (Math.random() > 0.5) {
//     process.exit(0);
// }

console.log('new');

setTimeout(() => {
    process.send({
        owner: 'farm-child'
    });
}, Math.random() * 1000 * 3);

module.exports = function (inp, callback) {
    count++;
    console.log(`child run: ${process.pid} ${count}`);

    if (Math.random() > 0.9) {
        throw Error(`errored: ${process.pid}`);
    }

    setTimeout(() => {
        callback(null, inp + ' BAR (' + process.pid + ')');
    }, Math.random() * 1000 * 10);
}