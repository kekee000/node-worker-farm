let workerFarm = require('../../');


(async () => {
    let workers = await workerFarm({
        maxConcurrentWorkers: 10,
        autoStart: true,
        onChild(subProcess) {
            workerCount++;
            // console.log(`worker start: ${workerCount}`);
            subProcess.on('message', m => {
                // console.log('parent receive message', m)
            });

            return subProcess;
        }
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
