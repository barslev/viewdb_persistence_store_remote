var _ = require('lodash');

var Client = function(socket) {
	console.log("NEW CLIENT CREATED");
	this._socket = socket;
	this._requests = {};
	this._requestId = 10;
	var self = this;
	this._socket.on('/vdb/response', function(event) {
		console.log("FROM SERVER");
		console.log(event);
		if(event.e) {
			throw new Error(event.e);
		}
		var callback = self._requests[event.i];
		if(_.isUndefined(callback)) {
			throw new Error("Response for unregistered request", event);
		}
		callback.cb(null, event.p);

	});
}

Client.prototype.request = function(payload, callback, persistent) {
	var req = {
		i: this._requestId++,
		p: payload,
	};
	this._requests[req.i] = {cb:callback, k:persistent};
	this._socket.emit('/vdb/request', req);
	return req.i;
}
Client.prototype.subscribe = function(payload, callback) {
	var self = this;
	var i = this.request(payload, callback, true);
	return {
		stop: function() {
			delete self._requests[i];
		}
	}
}

module.exports = Client;