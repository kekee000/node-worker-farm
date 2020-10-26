let workerFarm = require('../../');


(async () => {
    let workers = await workerFarm({
        maxConcurrentWorkers: 10,
        autoStart: false,
        onChild(subProcess) {
            workerCount++;
            // console.log(`worker start: ${workerCount}`);
            subProcess.on('message', m => {
                // console.log('parent receive message', m)
            });

            return subProcess;
        },
        asyncInit: true
    }, require.resolve('./child'));

    let workerCount = 0;
    let count = 0;

    for (let i = 0; i < 10; i++) {
        workers(i, (err, out) => {
            if (err) {
                // console.log(err);
                return;
            }
            count++;
            // console.log(`completed: ${count}`);
        })
    }
})();
