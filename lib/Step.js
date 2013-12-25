/*!
 * node-stepify - Step.js
 * Copyright(c) 2013 dmyang <yangdemo@gmail.com>
 * MIT Licensed
 */

'use strict';

var util = require('./util');

// Define the `Step` Class.
// A step is just do only an asynchronous task.
// useage:
// new Step(task, 'foo', function function() {}[, args])
// new Step(task, 'foo', [, args])
// new Step(task, function() {}[, args])
var Step = module.exports = function(task, stepName, stepHandle, knownArgs) {
    // Declare which task this step belongs to.
    this._task = task;

    // Every step has an uinque stepName which can not be rewrite.
    this._stepName = stepName;

    // Step handle define what should done after this step.
    this._stepHandle = stepHandle;

    // The known arguments bafore this step declared.
    this._knownArgs = knownArgs;

    return this;
};

var _proto = Step.prototype;

// To finish current step manually.
// The first parame `err` is required and is the same as asynchronous callback in Node.JS
// the second param `callback` is optional and default is `this.next`,
// The rest parame(s) are(is) optional, and they(it) will be passed to the next step.
// useage:
// step.done(err[, function() {this.jump(2);} args])
_proto.done = function(err) {
    var args = util.slice(arguments, 0);
    var callback;

    err = args.shift();

    if(undefined === err) err = null;

    callback = typeof args[0] === 'function' ? args.shift() : this.next;

    if(err || this._index === this._task._steps.length - 1) {
        this.end(err);
    } else {
        if(this._debug) console.log('Step `%s` has done and start to run next step.', this._stepName);

        callback.apply(this, args);
    }
};

// Output this task's finally result, which will access to the global finish handle.
// store this step's result is optional,
// just call `next` or `done` can access current result to next step,
// if this result is not expected for finally result.
// maybe `promises` or `result` better?
_proto.fulfill = function(result) {
    return this._task._result(result);
};

// Set(or get) temporary variables which visible in this task's runtime.
_proto.vars = function(name, value) {
    var len = arguments.length;

    if(len === 1) {return this._task._variables[name];}
    if(len === 2) {return this._task._variables[name] = value;}
    return null;
};

// To break off current task manually and run next task automatically.
// If the has no next task it will run the `finish` handle if accessed.
// maybe `interrupt` better?
_proto.end = function(err) {
    if(this._debug) console.log('Task `%s` has end in the step `%s`.', this._task._taskName, this._stepName);

    this._task.emit('done', err || null);
};

// The default callback handle is this.next,
// use .jump() one can execute any other step manually.
// jump accepts at last one param, the first one `step` is
// required to declare which step will be jump to.
// useage:
// jump(3) || jump(-2) || jump('foo')
_proto.jump = function(step) {
    if(undefined === step) throw new Error('You must access the step you wish to jump to.');

    var root = this;
    var task = this._task;
    var currIndex = task._currIndex;
    var targetStep = function() {
        var type = typeof step;

        if('string' === type) return task._getStep(step);

        // step index started from 0
        if('number' === type) return task._getStep(step < 0 ? currIndex + step : step);

        return null;
    }();
    var targetIndex;

    if(!targetStep) throw new Error('The target step will jump to is not exists.');

    targetIndex = targetStep._index;

    if(targetIndex === currIndex) return;

    if(this._debug) {
        console.log('Jump step to %s.', targetStep._stepName);
    }

    // this._task._currIndex = targetIndex;
    task._run.apply(task, [targetIndex].concat(util.slice(arguments, 1)));
};

// Finish current step and access the result to next step,
// the next step will be execute automatically,
// if the has no next step, then the current task will be identified finished.
_proto.next = function() {
    var task = this._task;
    var args = util.slice(arguments, 0);

    if(task._currIndex + 1 < task._steps.length) {
        this.jump.apply(this, [task._currIndex + 1].concat(args));
    } else {
        this.end(null);
    }
};

// Simple parallel support.
// usage:
// this.parallel(['a.js', 'b.js'], fs.readFile[, this.done]);
// this.parallel([readFile1, readFile1][, this.done]);
_proto.parallel = function(arr, iterator, callback) {
    var root = this;
    var completed = 0;
    var isFunction = util.isFunction;
    var isUndefined = util.isUndefined;
    var each = util._.each;
    var result = [];
    var args = util.slice(arguments, 1);
    var once = util.once(function(err, r) {
        if(err) {
            callback(err);
        } else {
            !isUndefined(r) && result.push(r);
            if(++completed >= arr.length) {
                callback.apply(this, [null, result]);
            }
        }
    }, this);

    if(isFunction[arr[0]]) {
        // each element should be a function in this case
        callback = isFunction(args[0]) ? args[0] : this.done;

        each(arr, function(fn, i) {
            if(!isFunction(fn)) throw new Error('Every element should be a function \
                if the first one was function.');
            fn(once);
        });
    } else {
        iterator = args[0];
        callback = isFunction(args[1]) ? args[1] : this.done;

        each(arr, function(arg, i) {
            iterator(arg, once);
        });
    }
};