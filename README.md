napp.alloy.adapter.restsql
==========================

## Description

SQL & RestAPI Sync Adapter for Titanium Alloy Framework. 
The idea is to combine Restful API with a local sql database. 


## How To Use

Simple add the following to your model in `PROJECT_FOLDER/app/models/`.

	exports.definition = {
		config : {
			"columns": {
				"id":"INTEGER PRIMARY KEY",
				"title":"text"
			},
			"URL": "http://urlPathToRestAPIServer.com/api/modelname",
			//"debug": 1, 
			"adapter" : {
				"type" : "sqlrest",
				"collection_name" : "modelname",
				"idAttribute" : "id"
			}
		},
		extendModel : function(Model) {
			_.extend(Model.prototype, {});
			return Model;
		},
		extendCollection : function(Collection) {
			_.extend(Collection.prototype, {});
			return Collection;
		}
	}

Then add the `restsql.js` to `PROJECT_FOLDER/assets/alloy/sync/`. Create the folders if they dont exist. 

Use the `debug` property in the above example to get logs printed with sql statements and server respose to debug your usage of the sqlrest adapter.


## Special properties

### localOnly

If you want to load/save data from the local SQL database, then add the `localOnly` property.


	collection.fetch({
		localOnly:true
	});


### Extended SQL interface

You can perform a local query, and use a bunch of SQL commands without having to write the actual query. The query is also support btw.
Use: *select, where, orderBy, limit, offset, union, unionAll, intersect, except, like, likeor*

	collection.fetch({
		data: {
			where:{
				category_id: 2
			},
			orderBy:"title",
			offset:20,
			limit:20,
			like: {
				description: "search query"
			}
		},
		localOnly:true
	});

## Author

**Mads Møller**  
web: http://www.napp.dk  
email: mm@napp.dk  
twitter: @nappdev  

## License

    Copyright (c) 2010-2013 Mads Møller

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE.