const errno = require('errno');

const TimeoutError = errno.create('TimeoutError');
const ProcessTerminatedError = errno.create('ProcessTerminatedError');
const MaxConcurrentCallsError = errno.create('MaxConcurrentCallsError');
const WorkerInitError = errno.create('WorkerInitError');

module.exports = {
    TimeoutError,
    ProcessTerminatedError,
    MaxConcurrentCallsError,
    WorkerInitError
};