napp.alloy.adapter.restsql
==========================

## Description

SQL & RestAPI Sync Adapter Test with Behave.js.


## How to test

Since the RESTSQL adapter uses both remote server and local database as persistance storage, you have 2 test methods:

* Local Test: Go offline with your simulator/device or enter a fake url for the remote server. This test will online test the database storage.
* Full Test: Test your server and the local database.


### Controller index.js

Add the following code to your index.js controller to enable the testing.

	require('spec/sqlrest_model_spec');
	require('behave').run(this);

### Add files to your project

Create the folders if they dont exist.

	Add the `restsql.js` to `PROJECT_FOLDER/assets/alloy/sync/`.
	Add the `sqlrest_model_spec.js` to `PROJECT_FOLDER/assets/spec/`.
	Add the `behave.js` to `PROJECT_FOLDER/lib/`.

### Create a test model

I use the wellknown test case of Backbone Wine Cellar. http://coenraets.org/blog/2011/12/backbone-js-wine-cellar-tutorial-part-1-getting-started/


Create a `wine.js` in `PROJECT_FOLDER/app/models/` with the following:

	exports.definition = {
		config : {
			"columns": {
				"id":"INTEGER PRIMARY KEY",
				"name":"text",
				"year":"text",
				"grapes":"text",
				"country":"text",
				"region":"text",
				"description":"text"
			},
			"URL": "http://urlPathToRestAPIServer.com/wine/api/wines",
			"adapter" : {
				"type" : "sqlrest",
				"collection_name" : "wines",
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

You are ready to test!



## Expected Test Result

Your result should look like this

	[DEBUG] :  [behave] Oh, behave! Testing in progress...
	[DEBUG] :  [behave] Describing SQLREST: create a model:
	[DEBUG] :  [behave] it *** creates a new model
	[DEBUG] :  [behave] Describing SQLREST: create and update a model:
	[DEBUG] :  [behave] it *** creates a new model
	[DEBUG] :  [behave] Describing SQLREST: find models:
	[DEBUG] :  [behave] it *** fetches all models
	[DEBUG] :  [behave] it *** create - callback the model
	[DEBUG] :  [behave] it *** create - callback the model
	[DEBUG] :  [behave] I expected 23 not to be null
	[DEBUG] :  [behave] I expected 23 to be 23
	[DEBUG] :  [behave] I expected CHATEAU LE DOYENNE to be CHATEAU LE DOYENNE
	[DEBUG] :  [behave] I expected 2012 to be 2012
	[DEBUG] :  [behave] it *** updates the created model
	[DEBUG] :  [behave] I expected 24 not to be null
	[DEBUG] :  [behave] I expected 24 to be 24
	[DEBUG] :  [behave] I expected FOUR VINES MAVERICK to be FOUR VINES MAVERICK
	[DEBUG] :  [behave] I expected 2011 to be 2011
	[DEBUG] :  [behave] I expected 23 not to be null
	[DEBUG] :  [behave] I expected 23 to be 23
	[DEBUG] :  [behave] I expected Copenhagen to be Copenhagen
	[DEBUG] :  [behave] I expected Denmark to be Denmark
	[DEBUG] :  [behave] I expected Danish wines are horrible. to be Danish wines are horrible.
	[DEBUG] :  [behave]
	[DEBUG] :  [behave] *******************************************
	[DEBUG] :  [behave] * \o/ T E S T  R U N  C O M P L E T E \o/ *
	[DEBUG] :  [behave] *******************************************
	[DEBUG] :  [behave] You ran 6 specs with 0 failures and 13 successes.


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