/**
 * SQL Rest Adapter for Titanium Alloy
 * @author Mads Møller
 * @version 0.1.29
 * Copyright Napp ApS
 * www.napp.dk
 */

var _ = require('alloy/underscore')._, util = require('alloy/sync/util');

//until this issue is fixed: https://jira.appcelerator.org/browse/TIMOB-11752
var Alloy = require("alloy"), Backbone = Alloy.Backbone, moment = require('alloy/moment');

// The database name used when none is specified in the
// model configuration.
var ALLOY_DB_DEFAULT = '_alloy_';
var ALLOY_ID_DEFAULT = 'alloy_id';

var cache = {
	config : {},
	Model : {},
	URL : null
};

// The sql-specific migration object, which is the main parameter
// to the up() and down() migration functions.
//
// db            The database handle for migration processing. Do not open
//               or close this as it is a running transaction that ensures
//               data integrity during the migration process.
// dbname        The name of the SQLite database for this model.
// table         The name of the SQLite table for this model.
// idAttribute   The unique ID column for this model, which is
//               mapped back to Backbone.js for its update and
//               delete operations.
function Migrator(config, transactionDb) {
	this.db = transactionDb;
	this.dbname = config.adapter.db_name;
	this.table = config.adapter.collection_name;
	this.idAttribute = config.adapter.idAttribute;
	this.column = function(name) {
		var parts = name.split(/\s+/), type = parts[0];
		switch (type.toLowerCase()) {
			case "string":
			case "varchar":
			case "date":
			case "datetime":
				Ti.API.warn("\"" + type + "\" is not a valid sqlite field, using TEXT instead");
			case "text":
				type = "TEXT";
				break;
			case "int":
			case "tinyint":
			case "smallint":
			case "bigint":
			case "boolean":
				Ti.API.warn("\"" + type + "\" is not a valid sqlite field, using INTEGER instead");
			case "integer":
				type = "INTEGER";
				break;
			case "double":
			case "float":
			case "decimal":
			case "number":
				Ti.API.warn("\"" + name + "\" is not a valid sqlite field, using REAL instead");
			case "real":
				type = "REAL";
				break;
			case "blob":
				type = "BLOB";
				break;
			case "null":
				type = "NULL";
				break;
			default:
				type = "TEXT";
		}
		parts[0] = type;
		return parts.join(" ");
	};
	this.createTable = function(config) {
		var columns = [], found = !1;
		for (var k in config.columns) {
			k === this.idAttribute && ( found = !0);
			columns.push(k + " " + this.column(config.columns[k]));
		}
		!found && this.idAttribute === ALLOY_ID_DEFAULT && columns.push(ALLOY_ID_DEFAULT + " TEXT");
		var sql = "CREATE TABLE IF NOT EXISTS " + this.table + " ( " + columns.join(",") + ")";
		this.db.execute(sql);
	};
	this.dropTable = function(config) {
		this.db.execute("DROP TABLE IF EXISTS " + this.table);
	};
	this.insertRow = function(columnValues) {
		var columns = [], values = [], qs = [], found = !1;
		for (var key in columnValues) {
			key === this.idAttribute && ( found = !0);
			columns.push(key);
			values.push(columnValues[key]);
			qs.push("?");
		}
		if (!found && this.idAttribute === ALLOY_ID_DEFAULT) {
			columns.push(this.idAttribute);
			values.push(util.guid());
			qs.push("?");
		}
		this.db.execute("INSERT INTO " + this.table + " (" + columns.join(",") + ") VALUES (" + qs.join(",") + ");", values);
	};
	this.deleteRow = function(columns) {
		var sql = "DELETE FROM " + this.table, keys = _.keys(columns), len = keys.length, conditions = [], values = [];
		len && (sql += " WHERE ");
		for (var i = 0; i < len; i++) {
			conditions.push(keys[i] + " = ?");
			values.push(columns[keys[i]]);
		}
		sql += conditions.join(" AND ");
		this.db.execute(sql, values);
	};
}

function apiCall(_options, _callback) {
	//adding localOnly
	if (Ti.Network.online && !_options.localOnly) {
		//we are online - talk with Rest API

		var xhr = Ti.Network.createHTTPClient({
			timeout : _options.timeout || 7000
		});

		//Prepare the request
		xhr.open(_options.type, _options.url);

		xhr.onload = function() {
			_callback({
				'success' : true,
				'responseText' : xhr.responseText || null,
				'responseData' : xhr.responseData || null
			});
		};

		//Handle error
		xhr.onerror = function() {
			_callback({
				'success' : false,
				'responseText' : xhr.responseText
			});
			Ti.API.error('[SQL REST API] apiCall ERROR: ' + xhr.responseText);
			Ti.API.error('[SQL REST API] apiCall ERROR CODE: ' + xhr.status);
		}
		for (var header in _options.headers) {
			xhr.setRequestHeader(header, _options.headers[header]);
		}

		if (_options.beforeSend) {
			_options.beforeSend(xhr);
		}
		xhr.send(_options.data || null);
	} else {
		//we are offline
		_callback({
			'success' : false,
			'responseText' : null,
			'offline' : true
		});
	}
}

function Sync(method, model, opts) {
	var table = model.config.adapter.collection_name, columns = model.config.columns, dbName = model.config.adapter.db_name || ALLOY_DB_DEFAULT, resp = null, db;
	model.idAttribute = model.config.adapter.idAttribute;
	//fix for collection
	var DEBUG = model.config.debug;
	var lastModifiedColumn = model.config.adapter.lastModifiedColumn;
	var parentNode = model.config.parentNode;
	var useStrictValidation = model.config.useStrictValidation;
	var initFetchWithLocalData = model.config.initFetchWithLocalData;
	var isCollection = ( model instanceof Backbone.Collection) ? true : false;

	var singleModelRequest = null;
	if (lastModifiedColumn) {
		if (opts.sql && opts.sql.where) {
			singleModelRequest = opts.sql.where[model.idAttribute];
		}
		if (!singleModelRequest && opts.data && opts.data[model.idAttribute]) {
			singleModelRequest = opts.data[model.idAttribute];
		}
	}

	//REST API
	var methodMap = {
		'create' : 'POST',
		'read' : 'GET',
		'update' : 'PUT',
		'delete' : 'DELETE'
	};

	var type = methodMap[method];
	var params = _.extend({}, opts);
	params.type = type;

	//set default headers
	params.headers = params.headers || {};

	// Send our own custom headers
	if (model.config.hasOwnProperty("headers")) {
		for (header in model.config.headers) {
			params.headers[header] = model.config.headers[header];
		}
	}

	if (lastModifiedColumn && _.isUndefined(params.disableLastModified)) {
		//send last modified model datestamp to the remote server
		var lastModifiedValue = "";
		try {
			lastModifiedValue = sqlLastModifiedItem();
		} catch(e) {
			if (DEBUG) {
				Ti.API.debug("[SQL REST API] LASTMOD SQL FAILED: ");
			}
		}
		params.headers['Last-Modified'] = lastModifiedValue;
	}

	// We need to ensure that we have a base url.
	if (!params.url) {
		params.url = (model.config.URL || model.url());
		if (!params.url) {
			Ti.API.error("[SQL REST API] ERROR: NO BASE URL");
			return;
		}
	}

	// For older servers, emulate JSON by encoding the request into an HTML-form.
	if (Alloy.Backbone.emulateJSON) {
		params.contentType = 'application/x-www-form-urlencoded';
		params.processData = true;
		params.data = params.data ? {
			model : params.data
		} : {};
	}

	// For older servers, emulate HTTP by mimicking the HTTP method with `_method`
	// And an `X-HTTP-Method-Override` header.
	if (Alloy.Backbone.emulateHTTP) {
		if (type === 'PUT' || type === 'DELETE') {
			if (Alloy.Backbone.emulateJSON)
				params.data._method = type;
			params.type = 'POST';
			params.beforeSend = function(xhr) {
				params.headers['X-HTTP-Method-Override'] = type
			};
		}
	}

	//json data transfers
	params.headers['Content-Type'] = 'application/json';

	if (DEBUG) {
		Ti.API.debug("[SQL REST API] REST METHOD: " + method);
	}

	switch (method) {
		case 'create':
			// convert to string for API call
			params.data = JSON.stringify(model.toJSON());
			if (DEBUG) {
				Ti.API.info("[SQL REST API] options: ");
				Ti.API.info(params);
			}
			apiCall(params, function(_response) {
				if (_response.success) {
					var data = parseJSON(_response, parentNode);
					//Rest API should return a new model id.
					resp = saveData(data);
					_.isFunction(params.success) && params.success(resp);
				} else {
					//offline or error
					resp = saveData();
					if (_.isUndefined(_response.offline)) {
						// error
						_.isFunction(params.error) && params.error(resp);
					} else {
						//offline - still a data success
						_.isFunction(params.success) && params.success(resp);
					}
				}
			});
			break;
		case 'read':
			if (model.id) {
				// find model by id
				params.url = params.url + '/' + model.id;
			}

			if (params.search) {
				// search mode
				params.returnExactServerResponse = true;
				params.url = params.url + "/search/" + Ti.Network.encodeURIComponent(params.search);
			}

			if (params.urlparams) {
				// build url with parameters
				params.url = encodeData(params.urlparams, params.url);
			}

			if (DEBUG) {
				Ti.API.info("[SQL REST API] options: ");
				Ti.API.info(params);
			}

			if (!params.localOnly && (params.initFetchWithLocalData || initFetchWithLocalData) ) {
				// read local data before receiving server data
				resp = readSQL();
				_.isFunction(params.success) && params.success(resp);
				model.trigger("fetch", {
					serverData : false
				});
				return;
			}

			apiCall(params, function(_response) {
				if (_response.success) {
					var data = parseJSON(_response, parentNode);
					if (_.isUndefined(params.localOnly)) {
						//we dont want to manipulate the data on localOnly requests
						saveData(data);
					}
					resp = readSQL(data);
					_.isFunction(params.success) && params.success(resp);
					model.trigger("fetch");
				} else {
					//error or offline - read local data
					resp = readSQL();
					if (_.isUndefined(_response.offline)) {
						//error
						_.isFunction(params.error) && params.error(resp);
					} else {
						//offline - still a data success
						_.isFunction(params.success) && params.success(resp);
						model.trigger("fetch");
					}
				}
			});

			break;

		case 'update':
			if (!model.id) {
				params.error(null, "MISSING MODEL ID");
				Ti.API.error("[SQL REST API] ERROR: MISSING MODEL ID");
				return;
			}

			// setup the url & data
			if (_.indexOf(params.url, "?") == -1) {
				params.url = params.url + '/' + model.id;
			} else {
				var str = params.url.split("?");
				params.url = str[0] + '/' + model.id + "?" + str[1];
			}

			if (params.urlparams) {
				params.url = encodeData(params.urlparams, params.url);
			}

			params.data = JSON.stringify(model.toJSON());
			if (DEBUG) {
				Ti.API.info("[SQL REST API] options: ");
				Ti.API.info(params);
			}
			apiCall(params, function(_response) {
				if (_response.success) {
					var data = parseJSON(_response, parentNode);
					resp = saveData(data);
					_.isFunction(params.success) && params.success(resp);
				} else {
					//error or offline - save & use local data
					resp = saveData();
					if (_.isUndefined(_response.offline)) {
						//error
						_.isFunction(params.error) && params.error(resp);
					} else {
						//offline - still a data success
						_.isFunction(params.success) && params.success(resp);
					}
				}
			});
			break;
		case 'delete':
			if (!model.id) {
				params.error(null, "MISSING MODEL ID");
				Ti.API.error("[SQL REST API] ERROR: MISSING MODEL ID");
				return;
			}
			params.url = params.url + '/' + model.id;

			if (DEBUG) {
				Ti.API.info("[SQL REST API] options: ");
				Ti.API.info(params);
			}
			apiCall(params, function(_response) {
				if (_response.success) {
					var data = parseJSON(_response, parentNode);
					resp = deleteSQL();
					_.isFunction(params.success) && params.success(resp);
				} else {
					resp = deleteSQL();
					if (_.isUndefined(_response.offline)) {
						//error
						_.isFunction(params.error) && params.error(resp);
					} else {
						//offline - still a data success
						_.isFunction(params.success) && params.success(resp);
					}
				}
			});
			break;
	}

	/////////////////////////////////////////////
	//SQL INTERFACE
	/////////////////////////////////////////////
	function saveData(data) {
		if (!data && !isCollection) {
			data = model.toJSON();
		}
		if (!data) {
			// its empty
			return;
		}
		if (!_.isArray(data)) {// its a model
			if (!_.isUndefined(data["is_deleted"])) {
				//delete item
				deleteSQL(data[model.idAttribute]);
			} else if (sqlFindItem(data[model.idAttribute]).length == 1) {
				//item exists - update it
				return updateSQL(data);
			} else {
				//write data to local sql
				return createSQL(data);
			}
		} else {//its an array of models
			var currentModels = sqlCurrentModels();
			for (var i in data) {
				if (!_.isUndefined(data[i]["is_deleted"])) {
					//delete item
					deleteSQL(data[i][model.idAttribute]);
				} else if (_.indexOf(currentModels, data[i][model.idAttribute]) != -1) {
					//item exists - update it
					updateSQL(data[i]);
				} else {
					//write data to local sql
					createSQL(data[i]);
				}
			}
		}
	}

	function createSQL(data) {
		var attrObj = {};

		if (DEBUG) {
			Ti.API.debug("[SQL REST API] createSQL data:");
			Ti.API.debug(data);
		}

		if (data) {
			attrObj = data;
		} else {
			if (!isCollection) {
				attrObj = model.toJSON();
			} else {
				Ti.API.error("[SQL REST API] Its a collection - error !");
			}
		}

		if (!attrObj[model.idAttribute]) {
			if (model.idAttribute === ALLOY_ID_DEFAULT) {
				// alloy-created GUID field
				attrObj.id = util.guid();
				attrObj[model.idAttribute] = attrObj.id;
			} else {
				// idAttribute not assigned by alloy. Leave it empty and
				// allow sqlite to process as null, which is the
				// expected value for an AUTOINCREMENT field.
				attrObj[model.idAttribute] = null;
			}
		}

		//validate the item
		if (useStrictValidation) {
			for (var c in columns) {
				if (c == model.idAttribute) {
					continue;
				}
				if (!_.contains(_.keys(attrObj), c)) {
					Ti.API.error("[SQL REST API] ITEM NOT VALID - REASON: " + c + " is not present");
					return;
				}
			}
		}

		// Create arrays for insert query
		var names = [], values = [], q = [];
		for (var k in columns) {
			names.push(k);
			if (_.isObject(attrObj[k])) {
				values.push(JSON.stringify(attrObj[k]));
			} else {
				values.push(attrObj[k]);
			}
			q.push('?');
		}
		if (lastModifiedColumn && _.isUndefined(params.disableLastModified)) {
			values[_.indexOf(names, lastModifiedColumn)] = moment().format('YYYY-MM-DD HH:mm:ss');
		}

		// Assemble create query
		var sqlInsert = "INSERT INTO " + table + " (" + names.join(",") + ") VALUES (" + q.join(",") + ");";

		// execute the query and return the response
		db = Ti.Database.open(dbName);
		db.execute('BEGIN;');
		db.execute(sqlInsert, values);

		// get the last inserted id
		if (model.id === null) {
			var sqlId = "SELECT last_insert_rowid();";
			var rs = db.execute(sqlId);
			if (rs.isValidRow()) {
				model.id = rs.field(0);
				attrObj[model.idAttribute] = model.id;
			} else {
				Ti.API.warn('Unable to get ID from database for model: ' + model.toJSON());
			}
		}

		db.execute('COMMIT;');
		db.close();

		return attrObj;
	}

	function readSQL(data) {
		if (DEBUG) {
			Ti.API.debug("[SQL REST API] readSQL");
		}
		var sql = opts.query || 'SELECT * FROM ' + table;

		// we want the exact server response returned by the adapter
		if (params.returnExactServerResponse && data) {
			opts.sql = opts.sql || {};
			opts.sql.where = opts.sql.where || {};

			if (_.isEmpty(data)) {
				// No result
				opts.sql.where.id = "1=2";
			} else {
				// Find all idAttribute in the server response
				var ids = [];
				_.each(data, function(element) {
					ids.push(element[model.idAttribute]);
				});
				// this will select IDs in the sql query
				opts.sql.where.id = ids;
			}
		}

		// execute the select query
		db = Ti.Database.open(dbName);

		if (opts.query) {
			var rs = db.execute(opts.query.sql, opts.query.params);
		} else {
			if (opts.data) {//extend sql where with data
				opts.sql = opts.sql || {};
				opts.sql.where = opts.sql.where || {};
				_.extend(opts.sql.where, opts.data);
			}
			var sql = _buildQuery(table, opts.sql || opts);
			if (DEBUG) {
				Ti.API.debug("[SQL REST API] SQL QUERY: " + sql);
			}
			var rs = db.execute(sql);
		}
		var len = 0;
		var values = [];

		// iterate through all queried rows
		while (rs.isValidRow()) {
			var o = {};
			var fc = 0;

			fc = _.isFunction(rs.fieldCount) ? rs.fieldCount() : rs.fieldCount;

			// create list of rows returned from query
			_.times(fc, function(c) {
				var fn = rs.fieldName(c);
				o[fn] = rs.fieldByName(fn);
			});
			values.push(o);
			if (isCollection) {
				//push the models
				var m = new model.config.Model(o);
				model.models.push(m);
			}
			len++;
			rs.next();
		}

		// close off db after read query
		rs.close();
		db.close();

		// shape response based on whether it's a model or collection
		model.length = len;

		if (DEBUG) {
			Ti.API.debug("readSQL length: " + len);
		}
		return len === 1 ? resp = values[0] : resp = values;
	}

	function updateSQL(data) {
		var attrObj = {};
		if (DEBUG) {
			Ti.API.debug("updateSQL data:");
			Ti.API.debug(data);
		}
		if (data) {
			attrObj = data;
		} else {
			if (!isCollection) {
				attrObj = model.toJSON();
			} else {
				Ti.API.error("Its a collection - error!");
			}
		}

		// Create arrays for insert query
		var names = [], values = [], q = [];
		for (var k in columns) {
			if (!_.isUndefined(attrObj[k])) {//only update those who are in the data
				names.push(k + '=?');
				if (_.isObject(attrObj[k])) {
					values.push(JSON.stringify(attrObj[k]));
				} else {
					values.push(attrObj[k]);
				}
				q.push('?');
			}
		}

		// compose the update query
		var sql = 'UPDATE ' + table + ' SET ' + names.join(',') + ' WHERE ' + model.idAttribute + '=?';
		values.push(attrObj[model.idAttribute]);
		if (DEBUG) {
			Ti.API.debug("updateSQL sql: " + sql);
			Ti.API.debug(values);
		}
		// execute the update
		db = Ti.Database.open(dbName);
		db.execute(sql, values);

		if (lastModifiedColumn && _.isUndefined(params.disableLastModified)) {
			var updateSQL = "UPDATE " + table + " SET " + lastModifiedColumn + " = DATETIME('NOW') WHERE " + model.idAttribute + "=?";
			db.execute(updateSQL, attrObj[model.idAttribute]);
		}

		db.close();

		return attrObj;
	}

	function deleteSQL(id) {
		var sql = 'DELETE FROM ' + table + ' WHERE ' + model.idAttribute + '=?';
		// execute the delete
		db = Ti.Database.open(dbName);
		db.execute(sql, id || model.id);
		db.close();

		model.id = null;
		return model.toJSON();
	}

	function sqlCurrentModels() {
		var sql = 'SELECT ' + model.idAttribute + ' FROM ' + table;
		db = Ti.Database.open(dbName);
		var rs = db.execute(sql);
		var output = [];
		while (rs.isValidRow()) {
			output.push(rs.fieldByName(model.idAttribute));
			rs.next();
		}
		rs.close();
		db.close();
		return output;
	}

	function sqlFindItem(_id) {
		var sql = 'SELECT ' + model.idAttribute + ' FROM ' + table + ' WHERE ' + model.idAttribute + '=?';
		db = Ti.Database.open(dbName);
		var rs = db.execute(sql, _id);
		var output = [];
		while (rs.isValidRow()) {
			output.push(rs.fieldByName(model.idAttribute));
			rs.next();
		}
		rs.close();
		db.close();
		return output;
	}

	function sqlLastModifiedItem() {
		if (singleModelRequest || !isCollection) {
			//model
			var sql = 'SELECT ' + lastModifiedColumn + ' FROM ' + table + ' WHERE ' + lastModifiedColumn + ' IS NOT NULL AND ' + model.idAttribute + '=' + singleModelRequest + ' ORDER BY ' + lastModifiedColumn + ' LIMIT 0,1';
		} else {
			//collection
			var sql = 'SELECT ' + lastModifiedColumn + ' FROM ' + table + ' WHERE ' + lastModifiedColumn + ' IS NOT NULL ORDER BY ' + lastModifiedColumn + ' LIMIT 0,1';
		}

		db = Ti.Database.open(dbName);
		rs = db.execute(sql);
		var output = null;
		if (rs.isValidRow()) {
			output = rs.field(0);
		}
		rs.close();
		db.close();
		return output;
	}

	function parseJSON(_response, parentNode) {
		var data = JSON.parse(_response.responseText);
		if (!_.isUndefined(parentNode)) {
			data = _.isFunction(parentNode) ? parentNode(data) : traverseProperties(data, parentNode);
		}
		if (DEBUG) {
			Ti.API.info("[SQL REST API] server response: ");
			Ti.API.debug(data)
		}
		return data;
	}

}

/////////////////////////////////////////////
// SQL HELPERS
/////////////////////////////////////////////

var encodeData = function(obj, url) {
	var str = [];
	for (var p in obj) {
		str.push(Ti.Network.encodeURIComponent(p) + "=" + Ti.Network.encodeURIComponent(obj[p]));
	}

	if (_.indexOf(url, "?") == -1) {
		return url + "?" + str.join("&");
	} else {
		return url + "&" + str.join("&");
	}
}
function _valueType(value) {
	if ( typeof value == 'string') {
		return "'" + value + "'";
	}
	if ( typeof value == 'boolean') {
		return value ? 1 : 0;
	}
	return value;
}

function _buildQuery(table, opts) {
	var sql = 'SELECT *';
	if (opts.select) {
		sql = 'SELECT ';
		if (_.isArray(opts.select)) {
			sql += opts.select.join(", ");
		} else {
			sql += opts.select;
		}
	}

	sql += ' FROM ' + table;

	if (opts.where) {
		var where;
		if ( _.isArray(opts.where) ) {
			where = opts.where.join(' AND ');
		} else if ( typeof opts.where === 'object' ) {
			where = [];
			where = whereBuilder(where, opts.where);
			where = where.join(' AND ');
		} else {
			where = opts.where;
		}

		sql += ' WHERE ' + where;
	} else {
		sql += ' WHERE 1=1'
	}
	if (opts.orderBy) {
		var order;
		if (_.isArray(opts.orderBy)) {
			order = opts.orderBy.join(', ');
		} else {
			order = opts.orderBy;
		}

		sql += ' ORDER BY ' + order;
	}
	if (opts.limit) {
		sql += ' LIMIT ' + opts.limit;
		if (opts.offset) {
			sql += ' OFFSET ' + opts.offset;
		}
	}
	if (opts.union) {
		sql += ' UNION ' + _buildQuery(opts.union);
	}
	if (opts.unionAll) {
		sql += ' UNION ALL ' + _buildQuery(opts.unionAll);
	}
	if (opts.intersect) {
		sql += ' INTERSECT ' + _buildQuery(opts.intersect);
	}
	if (opts.except) {
		sql += ' EXCEPT ' + _buildQuery(opts.EXCEPT);
	}
	if (opts.like) {
		var like;
		if ( typeof opts.like === 'object') {
			like = [];
			_.each(opts.like, function(value, f) {
				like.push(f + ' LIKE "%' + value + '%"');
			});
			like = like.join(' AND ');
			sql += ' AND ' + like;
		}
	}
	if (opts.likeor) {
		var likeor;
		if ( typeof opts.likeor === 'object') {
			likeor = [];
			_.each(opts.likeor, function(value, f) {
				likeor.push(f + ' LIKE "%' + value + '%"');
			});
			likeor = likeor.join(' OR ');
			sql += ' AND ' + likeor;
		}
	}

	return sql;
}

function whereBuilder(where, data) {
	_.each(data, function(v, f) {
		if (_.isArray(v)) {//select multiple items
			var innerWhere = [];
			_.each(v, function(value) {
				innerWhere.push(f + " = " + _valueType(value));
			});
			where.push(innerWhere.join(' OR '));
		} else if (_.isObject(v)) {
			where = whereBuilder(where, v);
		} else {
			where.push(f + " = " + _valueType(v));
		}
	});
	return where;
}

function traverseProperties(object, string) {
	var explodedString = string.split('.');
	for ( i = 0, l = explodedString.length; i < l; i++) {
		object = object[explodedString[i]];
	}
	return object;
}

/////////////////////////////////////////////
// MIGRATION
/////////////////////////////////////////////

// Gets the current saved migration
function GetMigrationFor(dbname, table) {
	var mid = null;
	var db = Ti.Database.open(dbname);
	db.execute('CREATE TABLE IF NOT EXISTS migrations (latest TEXT, model TEXT);');
	var rs = db.execute('SELECT latest FROM migrations where model = ?;', table);
	if (rs.isValidRow()) {
		var mid = rs.field(0) + '';
	}
	rs.close();
	db.close();
	return mid;
}

function Migrate(Model) {
	// get list of migrations for this model
	var migrations = Model.migrations || [];

	// get a reference to the last migration
	var lastMigration = {};
	migrations.length && migrations[migrations.length-1](lastMigration);

	// Get config reference
	var config = Model.prototype.config;

	// Get the db name for this model and set up the sql migration obejct
	config.adapter.db_name || (config.adapter.db_name = ALLOY_DB_DEFAULT);
	var migrator = new Migrator(config);

	// Get the migration number from the config, or use the number of
	// the last migration if it's not present. If we still don't have a
	// migration number after that, that means there are none. There's
	// no migrations to perform.
	var targetNumber = typeof config.adapter.migration === 'undefined' || config.adapter.migration === null ? lastMigration.id : config.adapter.migration;
	if ( typeof targetNumber === 'undefined' || targetNumber === null) {
		var tmpDb = Ti.Database.open(config.adapter.db_name);
		migrator.db = tmpDb;
		migrator.createTable(config);
		tmpDb.close();
		return;
	}
	targetNumber = targetNumber + '';
	// ensure that it's a string

	// Create the migration tracking table if it doesn't already exist.
	// Get the current saved migration number.
	var currentNumber = GetMigrationFor(config.adapter.db_name, config.adapter.collection_name);

	// If the current and requested migrations match, the data structures
	// match and there is no need to run the migrations.
	var direction;
	if (currentNumber === targetNumber) {
		return;
	} else if (currentNumber && currentNumber > targetNumber) {
		direction = 0;
		// rollback
		migrations.reverse();
	} else {
		// upgrade
		direction = 1;
	}

	// open db for our migration transaction
	db = Ti.Database.open(config.adapter.db_name);
	migrator.db = db;
	db.execute('BEGIN;');

	// iterate through all migrations based on the current and requested state,
	// applying all appropriate migrations, in order, to the database.
	if (migrations.length) {
		for (var i = 0; i < migrations.length; i++) {
			// create the migration context
			var migration = migrations[i];
			var context = {};
			migration(context);
			// if upgrading, skip migrations higher than the target
			// if rolling back, skip migrations lower than the target
			if (direction) {
				if (context.id > targetNumber) {
					break;
				}
				if (context.id <= currentNumber) {
					continue;
				}
			} else {
				if (context.id <= targetNumber) {
					break;
				}
				if (context.id > currentNumber) {
					continue;
				}
			}

			// execute the appropriate migration function
			var funcName = direction ? 'up' : 'down';
			if (_.isFunction(context[funcName])) {
				context[funcName](migrator);
			}
		}
	} else {
		migrator.createTable(config);
	}

	// update the saved migration in the db
	db.execute('DELETE FROM migrations where model = ?', config.adapter.collection_name);
	db.execute('INSERT INTO migrations VALUES (?,?)', targetNumber, config.adapter.collection_name);

	// end the migration transaction
	db.execute('COMMIT;');
	db.close();
	migrator.db = null;
}

function installDatabase(config) {
	// get the database name from the db file path
	var dbFile = config.adapter.db_file;
	var table = config.adapter.collection_name;
	var rx = /^([\/]{0,1})([^\/]+)\.[^\/]+$/;
	var match = dbFile.match(rx);
	if (match === null) {
		throw 'Invalid sql database filename "' + dbFile + '"';
	}
	//var isAbsolute = match[1] ? true : false;
	var dbName = config.adapter.db_name = match[2];

	// install and open the preloaded db
	Ti.API.debug('Installing sql database "' + dbFile + '" with name "' + dbName + '"');
	var db = Ti.Database.install(dbFile, dbName);

	// compose config.columns from table definition in database
	var rs = db.execute('pragma table_info("' + table + '");');
	var columns = {};
	while (rs.isValidRow()) {
		var cName = rs.fieldByName('name');
		var cType = rs.fieldByName('type');
		columns[cName] = cType;

		// see if it already has the ALLOY_ID_DEFAULT
		if (cName === ALLOY_ID_DEFAULT && !config.adapter.idAttribute) {
			config.adapter.idAttribute = ALLOY_ID_DEFAULT;
		}

		rs.next();
	}
	config.columns = columns;
	rs.close();

	// make sure we have a unique id field
	if (config.adapter.idAttribute) {
		if (!_.contains(_.keys(config.columns), config.adapter.idAttribute)) {
			throw 'config.adapter.idAttribute "' + config.adapter.idAttribute + '" not found in list of columns for table "' + table + '"\n' + 'columns: [' + _.keys(config.columns).join(',') + ']';
		}
	} else {
		Ti.API.info('No config.adapter.idAttribute specified for table "' + table + '"');
		Ti.API.info('Adding "' + ALLOY_ID_DEFAULT + '" to uniquely identify rows');
		db.execute('ALTER TABLE ' + table + ' ADD ' + ALLOY_ID_DEFAULT + ' TEXT;');
		config.columns[ALLOY_ID_DEFAULT] = 'TEXT';
		config.adapter.idAttribute = ALLOY_ID_DEFAULT;
	}

	// close the db handle
	db.close();
}

module.exports.beforeModelCreate = function(config, name) {
	// use cached config if it exists
	if (cache.config[name]) {
		return cache.config[name];
	}

	// check platform compatibility
	if (Ti.Platform.osname === 'mobileweb' || typeof Ti.Database === 'undefined') {
		throw 'No support for Titanium.Database in MobileWeb environment.';
	}

	// install database file, if specified
	config.adapter.db_file && installDatabase(config);
	if (!config.adapter.idAttribute) {
		Ti.API.info('No config.adapter.idAttribute specified for table "' + config.adapter.collection_name + '"');
		Ti.API.info('Adding "' + ALLOY_ID_DEFAULT + '" to uniquely identify rows');
		config.columns[ALLOY_ID_DEFAULT] = 'TEXT';
		config.adapter.idAttribute = ALLOY_ID_DEFAULT;
	}

	// add this config to the cache
	cache.config[name] = config;

	return config;
};

module.exports.afterModelCreate = function(Model, name) {
	// use cached Model class if it exists
	if (cache.Model[name]) {
		return cache.Model[name];
	}

	// create and migrate the Model class
	Model || ( Model = {});
	Model.prototype.config.Model = Model;
	// needed for fetch operations to initialize the collection from persistent store
	Model.prototype.idAttribute = Model.prototype.config.adapter.idAttribute;
	Migrate(Model);
	cache.Model[name] = Model;
	// Add the Model class to the cache

	return Model;
};

module.exports.sync = Sync;
