/* eslint-disable no-param-reassign */
// eslint-disable-next-line no-unused-vars
var LoggerFactory = require('slf').LoggerFactory;
var uuid = require('node-uuid').v4;
var Logger = require('slf').Logger;
var LOG = Logger.getLogger('lx:viewdb-persistence-store-remote');
var _ = require('lodash');

var Cursor = require('viewdb').Cursor;
var util = require('util');

var RemoteCursor = function (collection, query, options, getDocuments) {
  Cursor.call(this, collection, query, options, getDocuments);
  this.handles = [];
};

util.inherits(RemoteCursor, Cursor);

RemoteCursor.prototype._buildParams = function (defaults, method) {
  var q = this._query.query || this._query;
  var skip;
  var limit;
  var sort;
  var project;

  if (this._query.query) {
    skip = this._query.skip;
    limit = this._query.limit;
    sort = this._query.sort;
    project = this._query.project;
  }

  var params = _.defaults({
    id: uuid(),
    observe: q,
    collection: this._collection._name,
    skip: skip,
    limit: limit,
    sort: sort
  }, defaults);

  if (method) {
    params.method = method;
  }
  if (project) {
    params.project = project;
  }
  return params;
};

RemoteCursor.prototype.count = function (applySkipLimit, options, callback) {
  if (_.isFunction(applySkipLimit)) {
    callback = applySkipLimit;
    applySkipLimit = true;
  }
  if (_.isFunction(options)) {
    callback = options;
    options = {};
  }

  var skip = _.get(this, '_query.skip', _.get(options, 'skip', 0));
  var limit = _.get(this, '_query.limit', _.get(options, 'limit', 0));

  var params = {
    id: uuid(),
    count: this._query.query || this._query,
    collection: this._collection._name
  };

  if (applySkipLimit) {
    params.skip = skip;
    params.limit = limit;
  }

  this._collection._client.request(params, function (err, result) {
    callback(err, result);
  });
};

RemoteCursor.prototype.sort = function (params) {
  this._query.sort = params;
  this._refresh();
  return this;
};

RemoteCursor.prototype.project = function (params) {
  this._query.project = params;
  return this;
};

RemoteCursor.prototype.observe = function (options) {
  var self = this;
  var remoteHandle = null;
  var events = {
    i: !_.isNil(options.init),
    a: !_.isNil(options.added),
    r: !_.isNil(options.removed),
    c: !_.isNil(options.changed),
    m: !_.isNil(options.moved)
  };

  var params = this._buildParams({
    events: events
  });

  var startObserver = function () {
    var handle = self._collection._client.subscribe(params, function (err, result) {
      if (err) {
        handle.stop();
        startObserver();
        return;
      }
      if (remoteHandle || result.handle) {
        remoteHandle = result.handle || remoteHandle;

        if (self.handles.indexOf(params.id) > -1) {
          self._collection._client.request({ 'observe.stop': { h: params.id } });
          handle.stop();
          _.remove(self.handles, params.id);
        } else {
          _.forEach(result.changes, function (c) {
            if (c.i) { // init
              options.init(c.i.r);
            } else if (c.a) { // added
              options.added(c.a.e, c.a.i);
            } else if (c.r) { // removed
              options.removed(c.r.e, c.r.i);
            } else if (c.c) { // changed
              options.changed(c.c.o, c.c.n, c.c.i);
            } else if (c.m) { // moved
              options.moved(c.m.e, c.m.o, c.m.n);
            }
          });
        }
      }
    });

    return {
      stop: function () {
        if (!remoteHandle) {
          LOG.warn('WARN unsubscribing before receiving subscription handle from server');
          self.handles.push(params.id);
        } else {
          self._collection._client.request({ 'observe.stop': { h: params.id } });
          handle.stop();
        }
      }
    };
  };
  return startObserver();
};

module.exports = RemoteCursor;
