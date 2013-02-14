/**
 * SQL Rest Adapter for Titanium Alloy
 * @author Mads Møller
 * @version 0.1.12
 * Copyright Napp ApS
 * www.napp.dk
 */

var _ = require('alloy/underscore')._, util = require('alloy/sync/util');

//until this issue is fixed: https://jira.appcelerator.org/browse/TIMOB-11752
var Alloy = require("alloy"), Backbone = Alloy.Backbone;

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

	//TODO: normalize columns at compile time - https://jira.appcelerator.org/browse/ALOY-222
	this.column = function(name) {
		// split into parts to keep additional column characteristics like
		// autoincrement, primary key, etc...
		var parts = name.split(/\s+/);
		var type = parts[0]
		switch(type.toLowerCase()) {
			case 'string':
			case 'varchar':
			case 'date':
			case 'datetime':
				Ti.API.warn('"' + type + '" is not a valid sqlite field, using TEXT instead');
			case 'text':
				type = 'TEXT';
				break;
			case 'int':
			case 'tinyint':
			case 'smallint':
			case 'bigint':
			case 'boolean':
				Ti.API.warn('"' + type + '" is not a valid sqlite field, using INTEGER instead');
			case 'integer':
				type = 'INTEGER';
				break;
			case 'double':
			case 'float':
			case 'decimal':
			case 'number':
				Ti.API.warn('"' + name + '" is not a valid sqlite field, using REAL instead');
			case 'real':
				type = 'REAL';
				break;
			case 'blob':
				type = 'BLOB';
				break;
			case 'null':
				type = 'NULL';
				break;
			default:
				type = 'TEXT';
				break;
		}
		parts[0] = type;
		return parts.join(' ');
	};

	this.createTable = function(config) {
		// compose the create query
		var columns = [];
		var found = false;
		for (var k in config.columns) {
			k === this.idAttribute && ( found = true);
			columns.push(k + " " + this.column(config.columns[k]));
		}

		// add the id field if it wasn't specified
		if (!found && this.idAttribute === ALLOY_ID_DEFAULT) {
			columns.push(ALLOY_ID_DEFAULT + ' TEXT');
		}
		var sql = 'CREATE TABLE IF NOT EXISTS ' + this.table + ' ( ' + columns.join(',') + ')';

		// execute the create
		this.db.execute(sql);
	};

	this.dropTable = function(config) {
		this.db.execute('DROP TABLE IF EXISTS ' + this.table);
	};

	this.insertRow = function(columnValues) {
		var columns = [];
		var values = [];
		var qs = [];

		// get arrays of column names, values, and value placeholders
		var found = false;
		for (var key in columnValues) {
			key === this.idAttribute && ( found = true);
			columns.push(key);
			values.push(columnValues[key]);
			qs.push('?');
		}

		// add the id field if it wasn't specified
		if (!found && this.idAttribute === ALLOY_ID_DEFAULT) {
			columns.push(this.idAttribute);
			values.push(util.guid());
			qs.push('?');
		}

		// construct and execute the query
		this.db.execute('INSERT INTO ' + this.table + ' (' + columns.join(',') + ') VALUES (' + qs.join(',') + ');', values);
	};

	this.deleteRow = function(columns) {
		var sql = 'DELETE FROM ' + this.table;
		var keys = _.keys(columns);
		var len = keys.length;
		var conditions = [];
		var values = [];

		// construct the where clause, if necessary
		len && (sql += ' WHERE ');
		for (var i = 0; i < len; i++) {
			conditions.push(keys[i] + ' = ?');
			values.push(columns[keys[i]]);
		}
		sql += conditions.join(' AND ');

		// execute the delete
		this.db.execute(sql, values);
	};
}

function apiCall(_options, _callback) {
	//adding localOnly
	if (Ti.Network.online && _.isUndefined(_options.localOnly)) {
		//we are online - talk with Rest API

		var xhr = Ti.Network.createHTTPClient({
			timeout : _options.timeout || 5000
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
			'responseText' : ""
		});
		Ti.API.debug('[SQL REST API] apiCall: Offline / Local Mode');
	}
}

function Sync(model, method, opts) {
	var table = model.config.adapter.collection_name, columns = model.config.columns, dbName = model.config.adapter.db_name || ALLOY_DB_DEFAULT, resp = null, db;
	model.idAttribute = model.config.adapter.idAttribute; //fix for collection
	var DEBUG = model.config.debug;
	
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
	
	if(DEBUG){ 
		Ti.API.debug("[SQL REST API] REST METHOD: " + method); 
	}

	switch (method) {
		case 'create':
			// convert to string for API call		
			params.data = JSON.stringify(model.toJSON());
			if(DEBUG){
				Ti.API.info("[SQL REST API] options: ");
				Ti.API.info(params);
			}
			apiCall(params, function(_response) {
				if (_response.success) {
					var data = JSON.parse(_response.responseText);
					//Rest API should return a new model id.
					resp = createSQL(data);
					_.isFunction(params.success) && params.success(resp);
				} else {
					//offline or error
					resp = createSQL();
					_.isFunction(params.error) && params.error(resp);
				}
			});
			break;
		case 'read':
			if (model.id) {
				params.url = params.url + '/' + model.id;
			}
			
			if(params.urlparams){
				params.url += "?"+encodeData(params.urlparams);
			}
			
			if(DEBUG){
				Ti.API.info("[SQL REST API] options: ");
				Ti.API.info(params);
			}
			apiCall(params, function(_response) {
				if (_response.success) {
					var data = JSON.parse(_response.responseText);
					var currentModels = sqlCurrentModels();
					for (var i in data) {
						if(data[i]["is_deleted"]){ //delete item
							deleteSQL(data[i][model.idAttribute]);
						} else if (_.indexOf(currentModels, Number(data[i][model.idAttribute])) != -1) {
							updateSQL(data[i]); //item exists - update it
						} else {
							createSQL(data[i]); //write remote data to local sql
						}
					}
					resp = readSQL();
					_.isFunction(params.success) && params.success(resp);
					model.trigger("fetch");
				} else {
					//error or offline - read local data
					resp = readSQL();
					_.isFunction(params.error) && params.error(resp);
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
			params.url = params.url + '/' + model.id;
			params.data = JSON.stringify(model.toJSON());
			if(DEBUG){
				Ti.API.info("[SQL REST API] options: ");
				Ti.API.info(params);
			}
			apiCall(params, function(_response) {
				if (_response.success) {
					var data = JSON.parse(_response.responseText);
					var currentModels = sqlCurrentModels();
					if (_.indexOf(currentModels, Number(data[model.idAttribute])) != -1) {
						resp = updateSQL(data); //item exists - update it
					} else {
						resp = createSQL(data); //write remote data to local sql
					}
					_.isFunction(params.success) && params.success(resp);
				} else {
					//error or offline - use local data
					var currentModels = sqlCurrentModels();
					if (_.indexOf(currentModels, Number(model.id)) != -1) {
						resp = updateSQL(); //item exists - update it
					} else {
						resp = createSQL(); //write remote data to local sql
					}
					_.isFunction(params.error) && params.error(resp);
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
			
			if(DEBUG){
				Ti.API.info("[SQL REST API] options: ");
				Ti.API.info(params);
			}
			apiCall(params, function(_response) {
				if (_response.success) {
					var data = JSON.parse(_response.responseText);
					resp = deleteSQL();
					_.isFunction(params.success) && params.success(resp);
				} else {
					resp = deleteSQL();
					_.isFunction(params.error) && params.error(resp);
				}
			});
			break;
	}

	/////////////////////////////////////////////
	//SQL INTERFACE
	/////////////////////////////////////////////
	function createSQL(data) {
		var attrObj = {};
		
		if(DEBUG){
			Ti.API.debug("[SQL REST API] createSQL data:");
			Ti.API.debug(data);
		}
		
		if(data){
			attrObj = data;
		} else {
			if(_.isUndefined(model.models)){
				attrObj = model.toJSON();
			} else {
				Ti.API.error("[SQL REST API] Its a collection - error !");
			}
		}
		
		if (!attrObj[model.idAttribute]) {
			if (model.idAttribute === ALLOY_ID_DEFAULT) {
				// alloy-created GUID field
				attrObj.id = util.guid();
				attrObj[model.idAttribute] = model.id;
			} else {
				// idAttribute not assigned by alloy. Leave it empty and
				// allow sqlite to process as null, which is the
				// expected value for an AUTOINCREMENT field.
				attrObj[model.idAttribute] = null;
			}
		}
		
		// Create arrays for insert query
		var names = [], values = [], q = [];
		for (var k in columns) {
			names.push(k);
			if( _.isObject(attrObj[k]) ) {
				values.push(JSON.stringify(attrObj[k]));
			} else {
				values.push(attrObj[k]);	
			}
			q.push('?');
		}
		
		/*
		CREATE TRIGGER add_date 
	    AFTER INSERT ON Entries 
	    BEGIN 
	      UPDATE Entries SET updated = datetime('now') WHERE entryID = new. entryID; 
	    END; 
		*/

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

	function readSQL() {
		if(DEBUG){
			Ti.API.debug("[SQL REST API] readSQL");
		}
		var sql = opts.query || 'SELECT * FROM ' + table;
		
		// execute the select query
		db = Ti.Database.open(dbName);
		
		
		if (opts.query) {
			var rs = db.execute(opts.query.sql, opts.query.params);
		} else {
			var sql = _buildQuery(table, opts.data || opts);
			if(DEBUG){
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

			// TODO: https://jira.appcelerator.org/browse/ALOY-459
			fc = _.isFunction(rs.fieldCount) ? rs.fieldCount() : rs.fieldCount;

			// create list of rows returned from query
			_.times(fc, function(c) {
				var fn = rs.fieldName(c);
				o[fn] = rs.fieldByName(fn);
			});
			values.push(o);
			
			//push the models
			var m = new model.config.Model(o);
			model.models.push(m);
			
			len++;
			rs.next();
		}

		// close off db after read query
		rs.close();
		db.close();

		// shape response based on whether it's a model or collection
		model.length = len;
		
		if(DEBUG){Ti.API.debug("readSQL length: " + len);}
		return len === 1 ? resp = values[0] : resp = values;
	}

	function updateSQL(data) {
		var attrObj = {};
		if(DEBUG){
			Ti.API.debug("updateSQL data:");
			Ti.API.debug(data);
		}
		if(data){
			attrObj = data;
		} else {
			if(_.isUndefined(model.models)){
				attrObj = model.toJSON();
			} else {
				Ti.API.error("Its a collection - error!");
			}
		}
		
		// Create arrays for insert query
		var names = [], values = [], q = [];
		for (var k in columns) {
			names.push(k+'=?');
			if( _.isObject(attrObj[k]) ) {
				values.push(JSON.stringify(attrObj[k]));
			} else {
				values.push(attrObj[k]);	
			}
			q.push('?');
		}

		// compose the update query
		var sql = 'UPDATE ' + table + ' SET ' + names.join(',') + ' WHERE ' + model.idAttribute + '=?';
		values.push(attrObj[model.idAttribute]);
		
		// execute the update
		db = Ti.Database.open(dbName);
		db.execute(sql, values);
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

}


/////////////////////////////////////////////
// SQL HELPERS
/////////////////////////////////////////////

var encodeData = function(obj) {
	var str = [];
	for(var p in obj)
		str.push(Ti.Network.encodeURIComponent(p) + "=" + Ti.Network.encodeURIComponent(obj[p]));
	return str.join("&"); 
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
	var sql = 'SELECT * ';
	if (opts.select) {
		sql = 'SELECT ';
		if ( typeof opts.select == 'array') {
			sql += opts.select.join(", ");
		} else {
			sql += opts.select;
		}
	}

	sql += 'FROM ' + table;

	if (opts.where) {
		var where;
		if ( typeof opts.where === 'object') {
			where = [];
			_.each(opts.where, function(v, f) {
				where.push(f + " = " + _valueType(v));
			});
			where = where.join(' AND ');
		} else if ( typeof opts.where === 'array') {
			where = opts.where.join(' AND ');
		} else {
			where = opts.where;
		}

		sql += ' WHERE ' + where;
	} else {
		sql += ' WHERE 1=1'
	}
	if (opts.orderBy) {
		var order;
		if ( typeof opts.orderBy === 'array') {
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
	if( opts.like){
		var like;
		if ( typeof opts.like === 'object') {
			like = [];
			_.each(opts.like, function(value, f) {
				like.push(f + ' LIKE "%' + value + '%"');
			});
			like = like.join(' AND ');
			sql += ' AND '+like;
		}
	}
	if( opts.likeor){
		var likeor;
		if ( typeof opts.likeor === 'object') {
			likeor = [];
			_.each(opts.likeor, function(value, f) {
				likeor.push(f + ' LIKE "%' + value + '%"');
			});
			likeor = likeor.join(' OR ');
			sql += ' AND '+likeor;
		}
	}

	return sql;
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
		direction = 1;
		// upgrade
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
	Model.prototype.config.Model = Model; // needed for fetch operations to initialize the collection from persistent store
	Model.prototype.idAttribute = Model.prototype.config.adapter.idAttribute;
	Migrate(Model);

	// Add the Model class to the cache
	cache.Model[name] = Model;

	return Model;
};

module.exports.sync = Sync; 