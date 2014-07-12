/**
 * SQL Rest Adapter for Titanium Alloy
 * @author Mads Møller
 * @version 0.2.2
 * Copyright Napp ApS
 * www.napp.dk
 */

var _ = require('alloy/underscore')._,
    Alloy = require("alloy"),
    Backbone = Alloy.Backbone,
    moment = require('alloy/moment');

// The database name used when none is specified in the
// model configuration.
var ALLOY_DB_DEFAULT = '_alloy_';
var ALLOY_ID_DEFAULT = 'alloy_id';

var cache = {
    config: {},
    Model: {},
    URL: null
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
        var parts = name.split(/\s+/),
            type = parts[0];
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
        var columns = [],
            found = !1;
        for (var k in config.columns) {
            k === this.idAttribute && (found = !0);
            columns.push(k + " " + this.column(config.columns[k]));
        }!found && this.idAttribute === ALLOY_ID_DEFAULT && columns.push(ALLOY_ID_DEFAULT + " TEXT");
        var sql = "CREATE TABLE IF NOT EXISTS " + this.table + " ( " + columns.join(",") + ")";
        this.db.execute(sql);
    };
    this.dropTable = function(config) {
        this.db.execute("DROP TABLE IF EXISTS " + this.table);
    };
    this.insertRow = function(columnValues) {
        var columns = [],
            values = [],
            qs = [],
            found = !1;
        for (var key in columnValues) {
            key === this.idAttribute && (found = !0);
            columns.push(key);
            values.push(columnValues[key]);
            qs.push("?");
        }
        if (!found && this.idAttribute === ALLOY_ID_DEFAULT) {
            columns.push(this.idAttribute);
            values.push(guid());
            qs.push("?");
        }
        this.db.execute("INSERT INTO " + this.table + " (" + columns.join(",") + ") VALUES (" + qs.join(",") + ");", values);
    };
    this.deleteRow = function(columns) {
        var sql = "DELETE FROM " + this.table,
            keys = _.keys(columns),
            len = keys.length,
            conditions = [],
            values = [];
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
            timeout: _options.timeout || 7000
        });

        //Prepare the request
        xhr.open(_options.type, _options.url);

        xhr.onload = function() {
            var responseJSON, 
            	success = (this.status <= 304) ? "ok" : "error",
                status = true, 
                error;
			
			// save the eTag for future reference
			if(_options.eTagEnabled && success){
				setETag(_options.url, xhr.getResponseHeader('ETag'));
			}
			
			// we dont want to parse the JSON on a empty response
			if(this.status != 304 && this.status != 204){
	            // parse JSON
	            try {
	                responseJSON = JSON.parse(this.responseText);
	            } catch (e) {
	                Ti.API.error('[SQL REST API] apiCall PARSE ERROR: ' + e.message);
	                Ti.API.error('[SQL REST API] apiCall PARSE ERROR: ' + this.responseText);
	                status = false;
	                error = e.message;
	            }
            }
            
            _callback({
                success: status,
                status: success,
                code: this.status,
                data: error,
                responseText: this.responseText || null,
                responseJSON: responseJSON || null
            });

            cleanup();
        };

        //Handle error
        xhr.onerror = function(err) {
            var responseJSON, error;
            try {
                responseJSON = JSON.parse(this.responseText);
            } catch (e) {
                error = e.message;
            }

            _callback({
                success: false,
                status: "error",
                code: this.status,
                error: err.error,
                data: error,
                responseText: this.responseText,
                responseJSON: responseJSON || null
            });

            Ti.API.error('[SQL REST API] apiCall ERROR: ' + this.responseText);
            Ti.API.error('[SQL REST API] apiCall ERROR CODE: ' + this.status);
            Ti.API.error('[SQL REST API] apiCall ERROR MSG: ' + err.error);
            Ti.API.error('[SQL REST API] apiCall ERROR URL: ' + _options.url);

            cleanup();
        };

        // headers
        for (var header in _options.headers) {
        	// use value or function to return value
            xhr.setRequestHeader(header, _.isFunction(_options.headers[header]) ? _options.headers[header]() : _options.headers[header]);
        }

        if (_options.beforeSend) {
            _options.beforeSend(xhr);
        }
        
        if(_options.eTagEnabled) {
        	var etag = getETag(_options.url);
        	etag && xhr.setRequestHeader('IF-NONE-MATCH', etag);
        }

        xhr.send(_options.data || null);
    } else {
        // we are offline
        _callback({
            success: false,
            responseText: null,
            offline: true,
            localOnly: _options.localOnly
        });
    }

    /**
     * Clean up the request
     */
    function cleanup() {
        xhr = null;
        _options = null;
        _callback = null;
        error = null;
        responseJSON = null;
    }

}

function Sync(method, model, opts) {
    var table = model.config.adapter.collection_name,
        columns = model.config.columns,
        dbName = model.config.adapter.db_name || ALLOY_DB_DEFAULT,
        resp = null,
        db;
    model.idAttribute = model.config.adapter.idAttribute || "id";

	// Debug mode
    var DEBUG = model.config.debug;

    // last modified
    var lastModifiedColumn = model.config.adapter.lastModifiedColumn;
    var addModifedToUrl = model.config.adapter.addModifedToUrl;
    var lastModifiedDateFormat = model.config.adapter.lastModifiedDateFormat;
	
	// eTag enabled
	var eTagEnabled = model.config.eTagEnabled;
	
    // Used for custom parsing of the response data
    var parentNode = model.config.parentNode;
    
    // Used for custom parsing of the create response data
    var parentNodeForCreate = model.config.parentNodeForCreate;
    
    // Used for custom parsing of the create response data
    var parentNodeForUpdate = model.config.parentNodeForUpdate;
    
    // Used for custom parsing of the create response data
    var parentNodeForDelete = model.config.parentNodeForDelete;

    // Validate the response data and only allow those items with all columns defined in the object to be saved to the database.
    var useStrictValidation = model.config.useStrictValidation;

    // before fethcing data from remote server - the adapter will return the stored data if enabled
    var initFetchWithLocalData = model.config.initFetchWithLocalData;

    // if enabled - it will delete all the rows in the table on a succesful fetch
    var deleteAllOnFetch = model.config.deleteAllOnFetch;

    // save data locally on server error?
    var disableSaveDataLocallyOnServerError = model.config.disableSaveDataLocallyOnServerError;

    // Are we dealing with a colleciton or a model?
    var isCollection = (model instanceof Backbone.Collection) ? true : false;

    // returns the error response instead of the local data
    var returnErrorResponse = model.config.returnErrorResponse;

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
        'create': 'POST',
        'read': 'GET',
        'update': 'PUT',
        'delete': 'DELETE'
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

    // We need to ensure that we have a base url.
    if (!params.url) {
        params.url = (model.config.URL || model.url());
        if (!params.url) {
            Ti.API.error("[SQL REST API] ERROR: NO BASE URL");
            return;
        }
    }
	
	// Check if Last Modified is active
    if (lastModifiedColumn && _.isUndefined(params.disableLastModified)) {
        //send last modified model datestamp to the remote server
        var lastModifiedValue = "";
        try {
            lastModifiedValue = sqlLastModifiedItem();
        } catch (e) {
            logger(DEBUG, "LASTMOD SQL FAILED: ");

        }
        params.headers['Last-Modified'] = lastModifiedValue;
    }
    
    // Extend the provided url params with those from the model config
    if (_.isObject(params.urlparams) || model.config.URLPARAMS) {
        _.extend(params.urlparams, _.isFunction(model.config.URLPARAMS) ? model.config.URLPARAMS() : model.config.URLPARAMS);
    }

    // For older servers, emulate JSON by encoding the request into an HTML-form.
    if (Alloy.Backbone.emulateJSON) {
        params.contentType = 'application/x-www-form-urlencoded';
        params.processData = true;
        params.data = params.data ? {
            model: params.data
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
                params.headers['X-HTTP-Method-Override'] = type;
            };
        }
    }

    //json data transfers
    params.headers['Content-Type'] = 'application/json';

    logger(DEBUG, "REST METHOD: " + method);

    switch (method) {
        case 'create':
            // convert to string for API call
            params.data = JSON.stringify(model.toJSON());
            logger(DEBUG, "create options", params);

            apiCall(params, function(_response) {
                if (_response.success) {
                	
                    var data = parseJSON(_response, parentNodeForCreate);
                    
                    // Rest API should return a new model id.
                    resp = saveData(data);
                    _.isFunction(params.success) && params.success(resp);
                    
                    logger(DEBUG, "create options response success", resp);     
                } else {
                    // offline or error

                    // save data locally when server returned an error
                    if (!_response.localOnly && (params.disableSaveDataLocallyOnServerError || disableSaveDataLocallyOnServerError)) {
                        logger(DEBUG, "NOTICE: The data is not being saved locally");
                    } else {
                        resp = saveData();
                    }

                    if (_.isUndefined(_response.offline)) {
                        // error
                        _.isFunction(params.error) && params.error(returnErrorResponse ? _response : resp);
                    } else {
                        //offline - still a data success
                        _.isFunction(params.success) && params.success(resp);
                    }
                }
            });
            break;
        case 'read':
            if (!isCollection && model.id) {
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
            
            if(eTagEnabled){
            	params.eTagEnabled = true;
            }

            if (!params.localOnly && (params.initFetchWithLocalData || initFetchWithLocalData)) {
                // read local data before receiving server data
                resp = readSQL();
                
                // check is all the necessary info is in place for last modified
	            if (lastModifiedColumn && addModifedToUrl && lastModifiedValue) {
	                // add last modified date to url
	                if(model.length >= 1)
	                {
	                	var obj = {};
		                obj[lastModifiedColumn] = lastModifiedValue;
		                params.url = encodeData(obj, params.url);
	                }
	            }
                
                _.isFunction(params.success) && params.success(resp);
                model.trigger("fetch", {
                    serverData: false
                });
            }
            
            logger(DEBUG, "read options", params);

            apiCall(params, function(_response) {
                if (_response.success) {
                    if (deleteAllOnFetch || params.deleteAllOnFetch) {
                        deleteAllSQL();
                    }

                    var data = parseJSON(_response, parentNode);
                    if (!params.localOnly) {
                        //we dont want to manipulate the data on localOnly requests
                        saveData(data);
                    }
                    resp = readSQL(data);
                    _.isFunction(params.success) && params.success(resp);
                    model.trigger("fetch");
                } else {
                    //error or offline - read local data
                    if(_.isUndefined(params.initFetchWithLocalData))
                    {
                    	params.initFetchWithLocalData = initFetchWithLocalData;
                    }
                    
                    if ( params.initFetchWithLocalData ) {
                    }else{
                    	resp = readSQL();
                    }
                    if (_.isUndefined(_response.offline)) {
                        //error
                        _.isFunction(params.error) && params.error(returnErrorResponse ? _response : resp);
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
            logger(DEBUG, "update options", params);

            apiCall(params, function(_response) {
                if (_response.success) {
                    var data = parseJSON(_response, parentNodeForUpdate);
                    resp = saveData(data);
                    _.isFunction(params.success) && params.success(resp);
                } else {
                    // error or offline - save & use local data

                    // save data locally when server returned an error
                    if (!_response.localOnly && (params.disableSaveDataLocallyOnServerError || disableSaveDataLocallyOnServerError)) {
                        logger(DEBUG, "NOTICE: The data is not being saved locally");
                    } else {
                        resp = saveData();
                    }

                    if (_.isUndefined(_response.offline)) {
                        //error
                        _.isFunction(params.error) && params.error(returnErrorResponse ? _response : resp);
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
            logger(DEBUG, "delete options", params);

            apiCall(params, function(_response) {
                if (_response.success) {
                    var data = parseJSON(_response, parentNodeForDelete);
                    resp = deleteSQL();
                    _.isFunction(params.success) && params.success(resp);
                } else {
                    // error or offline

                    // save data locally when server returned an error
                    if (!_response.localOnly && (params.disableSaveDataLocallyOnServerError || disableSaveDataLocallyOnServerError)) {
                        logger(DEBUG, "NOTICE: The data is not being deleted locally");
                    } else {
                        resp = deleteSQL();
                    }

                    if (_.isUndefined(_response.offline)) {
                        //error
                        _.isFunction(params.error) && params.error(returnErrorResponse ? _response : resp);
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
        if (!_.isArray(data)) { // its a model
            if (!_.isUndefined(data["is_deleted"]) && data["is_deleted"] == true) {
                //delete item
                deleteSQL(data[model.idAttribute]);
            } else if (sqlFindItem(data[model.idAttribute]).length == 1) {
                //item exists - update it
                return updateSQL(data);
            } else {
                //write data to local sql
                return createSQL(data);
            }
        } else { //its an array of models
            var currentModels = sqlCurrentModels();
            
            for (var i in data) {
                if (!_.isUndefined(data[i]["is_deleted"]) && data[i]["is_deleted"]  == true) {
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
        logger(DEBUG, "createSQL data:", data);

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
                attrObj.id = guid();
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
        var names = [],
            values = [],
            q = [];
        for (var k in columns) {
            names.push(k);
            if (_.isObject(attrObj[k])) {
                values.push(JSON.stringify(attrObj[k]));
            } else {
                values.push(attrObj[k]);
            }
            q.push('?');
        }

        // Last Modified logic
        if (lastModifiedColumn && _.isUndefined(params.disableLastModified)) {
            values[_.indexOf(names, lastModifiedColumn)] = lastModifiedDateFormat ? moment().format(lastModifiedDateFormat) : moment().format('YYYY-MM-DD HH:mm:ss');
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
            logger(DEBUG, "\n******************************\nCollection total BEFORE read from db: " + model.length + " models\n******************************");
        }
        var sql = opts.query || 'SELECT * FROM ' + table;

        // we want the exact server response returned by the adapter
        if (params.returnExactServerResponse && data) {
            opts.sql = opts.sql || {};
            opts.sql.where = opts.sql.where || {};

            if (_.isEmpty(data)) {
                // No result
                opts.sql.where[model.idAttribute] = "1=2";
            } else {
                // Find all idAttribute in the server response
                var ids = [];
                _.each(data, function(element) {
                    ids.push(element[model.idAttribute]);
                });
                // this will select IDs in the sql query
                opts.sql.where[model.idAttribute] = ids;
            }
        }

        // execute the select query
        db = Ti.Database.open(dbName);

        // run a specific sql query if defined
        if (opts.query) {
            if (opts.query.params) {
                var rs = db.execute(opts.query.sql, opts.query.params);
            } else {
                var rs = db.execute(opts.query.sql);
            }
        } else {
            //extend sql where with data
            if (opts.data) {
                opts.sql = opts.sql || {};
                opts.sql.where = opts.sql.where || {};
                _.extend(opts.sql.where, opts.data);
            }
            // build the sql query
            var sql = _buildQuery(table, opts.sql || opts);
            logger(DEBUG, "SQL QUERY: " + sql);

            var rs = db.execute(sql);
        }
        var len = 0,
            values = [];

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

            // Only push models if its a collection
            // and not if we are using fetch({add:true})
            if (isCollection && !params.add) {
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

        logger(DEBUG, "\n******************************\n readSQL db read complete: " + len + " models \n******************************");
        resp = len === 1 ? values[0] : values;
        return resp;
    }

    function updateSQL(data) {
        var attrObj = {};

        logger(DEBUG, "updateSQL data: ", data);

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
        var names = [],
            values = [],
            q = [];
        for (var k in columns) {
            if (!_.isUndefined(attrObj[k])) { //only update those who are in the data
                names.push(k + '=?');
                if (_.isObject(attrObj[k])) {
                    values.push(JSON.stringify(attrObj[k]));
                } else {
                    values.push(attrObj[k]);
                }
                q.push('?');
            }
        }

        if (lastModifiedColumn && _.isUndefined(params.disableLastModified)) {
            values[_.indexOf(names, lastModifiedColumn + "=?")] = lastModifiedDateFormat ? moment().format(lastModifiedDateFormat) : moment().format('YYYY-MM-DD HH:mm:ss');
        }

        // compose the update query
        var sql = 'UPDATE ' + table + ' SET ' + names.join(',') + ' WHERE ' + model.idAttribute + '=?';
        values.push(attrObj[model.idAttribute]);

        logger(DEBUG, "updateSQL sql query: " + sql);
        logger(DEBUG, "updateSQL values: ", values);

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

    function deleteAllSQL() {
        var sql = 'DELETE FROM ' + table;
        db = Ti.Database.open(dbName);
        db.execute(sql);
        db.close();
    }

    function sqlCurrentModels() {
        var sql = 'SELECT ' + model.idAttribute + ' FROM ' + table;
        db = Ti.Database.open(dbName);
        var rs = db.execute(sql);
        var output = [];
        while (rs.isValidRow()) {
            output.push(rs.fieldByName(model.idAttribute,Titanium.Database.FIELD_TYPE_STRING));
            rs.next();
        }
        rs.close();
        db.close();
        return output;
    }

    function sqlFindItem(_id) {
        if (_.isUndefined(_id)) {
            return [];
        }
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
            var sql = 'SELECT ' + lastModifiedColumn + ' FROM ' + table + ' WHERE ' + lastModifiedColumn + ' IS NOT NULL AND ' + model.idAttribute + '=' + singleModelRequest + ' ORDER BY ' + lastModifiedColumn + ' DESC LIMIT 0,1';
        } else {
            //collection
            var sql = 'SELECT ' + lastModifiedColumn + ' FROM ' + table + ' WHERE ' + lastModifiedColumn + ' IS NOT NULL ORDER BY ' + lastModifiedColumn + ' DESC LIMIT 0,1';
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
        var data = _response.responseJSON;
        if (!_.isUndefined(parentNode)) {
            data = _.isFunction(parentNode) ? parentNode(data) : traverseProperties(data, parentNode);
        }
        logger(DEBUG, "server response: ", data);
        return data;
    }

}

/////////////////////////////////////////////
// SQL HELPERS
/////////////////////////////////////////////

function encodeData(obj, url) {
    var _serialize = function(obj, prefix) {
        var str = [];
        for (var p in obj) {
            if (obj.hasOwnProperty(p)) {
                var k = prefix ? prefix + "[" + p + "]" : p,
                    v = obj[p];
                str.push(typeof v === "object" ? _serialize(v, k) : Ti.Network.encodeURIComponent(k) + "=" + Ti.Network.encodeURIComponent(v));
            }
        }
        return str.join("&");
    };

    return url + (_.indexOf(url, "?") === -1 ? "?" : "&") + _serialize(obj);
}

function _valueType(value) {
    if (typeof value == 'string') {
        return "'" + value + "'";
    }
    if (typeof value == 'boolean') {
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

	// WHERE
    if (opts.where && !_.isEmpty(opts.where)) {
        var where;
        if (_.isArray(opts.where)) {
            where = opts.where.join(' AND ');
        } else if (typeof opts.where === 'object') {
            where = [];
            where = whereBuilder(where, opts.where);
            where = where.join(' AND ');
        } else {
            where = opts.where;
        }

        sql += ' WHERE ' + where;
    } else {
        sql += ' WHERE 1=1';
    }
	
	// WHERE NOT
    if (opts.wherenot && !_.isEmpty(opts.wherenot)) {
        var wherenot;
        if (_.isArray(opts.wherenot)) {
            wherenot = opts.wherenot.join(' AND ');
        } else if (typeof opts.wherenot === 'object') {
            wherenot = [];
            // use the where not operator
            wherenot = whereBuilder(wherenot, opts.wherenot, " != ");
            wherenot = wherenot.join(' AND ');
        } else {
            wherenot = opts.wherenot;
        }

        sql += ' AND ' + wherenot;
    } 
	
	// LIKE
    if (opts.like) {
        var like;
        if (typeof opts.like === 'object') {
            like = [];
            _.each(opts.like, function(value, f) {
                like.push(f + ' LIKE "%' + value + '%"');
            });
            like = like.join(' AND ');
            sql += ' AND ' + like;
        }
    }
	
	// LIKE OR
    if (opts.likeor) {
        var likeor;
        if (typeof opts.likeor === 'object') {
            likeor = [];
            _.each(opts.likeor, function(value, f) {
                likeor.push(f + ' LIKE "%' + value + '%"');
            });
            likeor = likeor.join(' OR ');
            sql += ' AND ' + likeor;
        }
    }
    
	// UNION
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

    // order by and limit should be in the end of the statement
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

    return sql;
}

function whereBuilder(where, data, operator) {
	var whereOperator = operator || " = ";
	
    _.each(data, function(v, f) {
        if (_.isArray(v)) { //select multiple items
            var innerWhere = [];
            _.each(v, function(value) {
                innerWhere.push(f + whereOperator + _valueType(value));
            });
            where.push(innerWhere.join(' OR '));
        } else if (_.isObject(v)) {
            where = whereBuilder(where, v, whereOperator);
        } else {
            where.push(f + whereOperator + _valueType(v));
        }
    });
    return where;
}

function traverseProperties(object, string) {
    var explodedString = string.split('.');
    for (i = 0, l = explodedString.length; i < l; i++) {
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
    migrations.length && migrations[migrations.length - 1](lastMigration);

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
    if (typeof targetNumber === 'undefined' || targetNumber === null) {
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
    Model || (Model = {});
    Model.prototype.config.Model = Model;
    // needed for fetch operations to initialize the collection from persistent store
    Model.prototype.idAttribute = Model.prototype.config.adapter.idAttribute;
    Migrate(Model);
    cache.Model[name] = Model;
    // Add the Model class to the cache

    return Model;
};

/////////////////////////////////////////////
// HELPERS
/////////////////////////////////////////////

function logger(DEBUG, message, data) {
    if (DEBUG) {
        Ti.API.debug("[REST API] " + message);
        if (data) {
            Ti.API.debug(typeof data === 'object' ? JSON.stringify(data, null, '\t') : data);
        }
    }
}

/**
 * Get the ETag for the given url
 * @param {Object} url
 */
function getETag(url){
	var obj = Ti.App.Properties.getObject("NAPP_RESTSQL_ADAPTER",{});
	var data = obj[url];
	return data || null;
}
 
/**
 * Set the ETag for the given url
 * @param {Object} url
 * @param {Object} eTag
 */
function setETag(url, eTag){
	if(eTag && url){
		var obj = Ti.App.Properties.getObject("NAPP_RESTSQL_ADAPTER",{});
		obj[url] = eTag;
		Ti.App.Properties.setObject("NAPP_RESTSQL_ADAPTER",obj);
	}
}


function S4() {
    return ((1 + Math.random()) * 65536 | 0).toString(16).substring(1);
}

function guid() {
    return S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4();
}

module.exports.sync = Sync;