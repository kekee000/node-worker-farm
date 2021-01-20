let workerFarm = require('../..');


(async () => {
    let workerCount = 0;
    let workers = await workerFarm({
        maxConcurrentWorkers: 10,
        autoStart: true,
        onChild(subProcess) {
            workerCount++;
            return subProcess;
        },
        asyncInit: true
    }, require.resolve('./child'));

    let count = 0;

    setInterval(() => {
        workers(Math.random() * 10, (err, out) => {
            if (err) {
                return;
            }
            count++;
            console.log(`completed: ${count}`);
            if (count === 10) {
                // workerFarm.end(workers);
            }
        })
    }, 500);
})();
