// console.log('init worker');

process.on('message', m => {
    // console.log('message', m);
});

let count = 0;

process.send({
    owner: 'farm-child'
});

module.exports = function (inp, callback) {
    count++;
    console.log(`child run: ${process.pid} ${count}`);

    // if (Math.random() > 0.5) {
    //     throw Error(`errored: ${process.pid}`);
    // }

    process.send('123123123');

    callback(null, inp + ' BAR (' + process.pid + ')');
}