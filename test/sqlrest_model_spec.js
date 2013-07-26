//Setup module to run Behave tests
require('behave').andSetup(this);

describe('SQLREST: create a model', function() {
	it.eventually('*** creates a new model', function(done) {
		var model = Alloy.createModel('wine', {
			name : "FOUR VINES MAVERICK",
			year : "2011",
			grapes : "Zinfandel",
			country : "USA",
			region : "California",
			description : "Have a bottle of this fine zinfandel on hand for your next romantic outing."
		});
		model.save({}, {
			success : function(returnModel) {
				// get model back from db
				Ti.API.info("callback");
				model.set({
					"id" : returnModel.id
				});

				it.eventually('*** create - callback the model', function(_done) {
					model.fetch({
						success: function(_returnModel){
							expect(model.id).notToBe(null);
							expect(model.id).toBe(_returnModel.id);
							expect(model.get("name")).toBe('FOUR VINES MAVERICK');
							expect(model.get("year")).toBe("2011");

							_done();
						},
						error: function(_returnModel){
							Ti.API.error("fetch error");
							expect(model.id).notToBe(null);
							expect(model.id).toBe(_returnModel.id);
							expect(model.get("name")).toBe('FOUR VINES MAVERICK');
							expect(model.get("year")).toBe("2011");

							_done();
						}
					});
				}, 10000);

				done();
			},
			error : function(returnModel) {
				//on error - the data is only saved to local db
				Ti.API.debug("create model: error callback");
				model.set({
					"id" : returnModel.id
				});

				it.eventually('*** create - callback the model', function(_done) {
					model.fetch({
						success: function(_returnModel){
							expect(model.id).notToBe(null);
							expect(model.id).toBe(_returnModel.id);
							expect(model.get("name")).toBe('FOUR VINES MAVERICK');
							expect(model.get("year")).toBe("2011");

							_done();
						},
						error: function(_returnModel){
							Ti.API.error("fetch error");
							expect(model.id).notToBe(null);
							expect(model.id).toBe(_returnModel.id);
							expect(model.get("name")).toBe('FOUR VINES MAVERICK');
							expect(model.get("year")).toBe("2011");

							_done();
						}
					});
				}, 10000);

				done();
			}
		});
	}, 10000);
});


describe('SQLREST: create and update a model', function() {
	it.eventually('*** creates a new model', function(done) {
		var model = Alloy.createModel('wine', {
			name : "CHATEAU LE DOYENNE",
			year : "2012",
			grapes : "Merlot",
			country : "France",
			region : "Bordeaux",
			description : "Though dense and chewy, this wine does not overpower with its finely balanced depth and structure."
		});
		model.save({}, {
			success : function(returnModel) {
				// get model back from db
				Ti.API.info("callback");
				model.set({
					"id" : returnModel.id
				});

				it.eventually('*** create - callback the model', function(_done) {
					model.fetch({
						success: function(_returnModel){
							expect(model.id).notToBe(null);
							expect(model.id).toBe(returnModel.id);
							expect(model.get("name")).toBe('CHATEAU LE DOYENNE');
							expect(model.get("year")).toBe("2012");

							//UPDATE the model
							it.eventually('*** updates the created model', function(_donedone) {
								var model = Alloy.createModel('wine', {
									id : returnModel.id, //when ID is defined, backbone will update rather than create
									name : "CHATEAU LE DOYENNE",
									year : "2012",
									grapes : "Merlot",
									country : "Denmark",
									region : "Copenhagen",
									description : "Danish wines are horrible."
								});

								model.save({}, {
									success : function(_returnModel2) {
										expect(model.id).notToBe(null);
										expect(model.id).toBe(_returnModel2.id);
										expect(model.get("region")).toBe('Copenhagen');
										expect(model.get("country")).toBe("Denmark");
										expect(model.get("description")).toBe("Danish wines are horrible.");
										_donedone();
									},
									error : function(_returnModel2) {
										expect(model.id).notToBe(null);
										expect(model.id).toBe(_returnModel2.id);
										expect(model.get("region")).toBe('Copenhagen');
										expect(model.get("country")).toBe("Denmark");
										expect(model.get("description")).toBe("Danish wines are horrible.");
										_donedone();
									}
								});

							}, 10000);

							_done();
						},
						error: function(_returnModel){
							Ti.API.error("fetch error");
							// validate it
							expect(model.id).notToBe(null);
							expect(model.id).toBe(returnModel.id);
							expect(model.get("name")).toBe('CHATEAU LE DOYENNE');
							expect(model.get("year")).toBe("2012");

							//UPDATE the model
							it.eventually('*** updates the created model', function(_donedone) {
								var model = Alloy.createModel('wine', {
									id : returnModel.id, //when ID is defined, backbone will update rather than create
									name : "CHATEAU LE DOYENNE",
									year : "2012",
									grapes : "Merlot",
									country : "Denmark",
									region : "Copenhagen",
									description : "Danish wines are horrible."
								});

								model.save({}, {
									success : function(_returnModel2) {
										expect(model.id).notToBe(null);
										expect(model.id).toBe(_returnModel2.id);
										expect(model.get("region")).toBe('Copenhagen');
										expect(model.get("country")).toBe("Denmark");
										expect(model.get("description")).toBe("Danish wines are horrible.");
										_donedone();
									},
									error : function(_returnModel2) {
										expect(model.id).notToBe(null);
										expect(model.id).toBe(_returnModel2.id);
										expect(model.get("region")).toBe('Copenhagen');
										expect(model.get("country")).toBe("Denmark");
										expect(model.get("description")).toBe("Danish wines are horrible.");
										_donedone();
									}
								});

							}, 10000);

							_done();
						}
					});
				}, 10000);

				done();
			},
			error : function(returnModel) {
				//on error - the data is only saved to local db
				Ti.API.debug("create model: error callback");
				// get model back from db
				model.set({
					"id" : returnModel.id
				});

				it.eventually('*** create - callback the model', function(_done) {
					model.fetch({
						success: function(_returnModel){
							expect(model.id).notToBe(null);
							expect(model.id).toBe(returnModel.id);
							expect(model.get("name")).toBe('CHATEAU LE DOYENNE');
							expect(model.get("year")).toBe("2012");

							//UPDATE the model
							it.eventually('*** updates the created model', function(_donedone) {
								var model = Alloy.createModel('wine', {
									id : returnModel.id, //when ID is defined, backbone will update rather than create
									name : "CHATEAU LE DOYENNE",
									year : "2012",
									grapes : "Merlot",
									country : "Denmark",
									region : "Copenhagen",
									description : "Danish wines are horrible."
								});

								model.save({}, {
									success : function(_returnModel2) {
										expect(model.id).notToBe(null);
										expect(model.id).toBe(_returnModel2.id);
										expect(model.get("region")).toBe('Copenhagen');
										expect(model.get("country")).toBe("Denmark");
										expect(model.get("description")).toBe("Danish wines are horrible.");
										_donedone();
									},
									error : function(_returnModel2) {
										expect(model.id).notToBe(null);
										expect(model.id).toBe(_returnModel2.id);
										expect(model.get("region")).toBe('Copenhagen');
										expect(model.get("country")).toBe("Denmark");
										expect(model.get("description")).toBe("Danish wines are horrible.");
										_donedone();
									}
								});

							}, 10000);

							_done();
						},
						error: function(_returnModel){
							Ti.API.error("fetch error");
							// validate it
							expect(model.id).notToBe(null);
							expect(model.id).toBe(returnModel.id);
							expect(model.get("name")).toBe('CHATEAU LE DOYENNE');
							expect(model.get("year")).toBe("2012");

							//UPDATE the model
							it.eventually('*** updates the created model', function(_donedone) {
								var model = Alloy.createModel('wine', {
									id : returnModel.id, //when ID is defined, backbone will update rather than create
									name : "CHATEAU LE DOYENNE",
									year : "2012",
									grapes : "Merlot",
									country : "Denmark",
									region : "Copenhagen",
									description : "Danish wines are horrible."
								});

								model.save({}, {
									success : function(_returnModel2) {
										expect(model.id).notToBe(null);
										expect(model.id).toBe(_returnModel2.id);
										expect(model.get("region")).toBe('Copenhagen');
										expect(model.get("country")).toBe("Denmark");
										expect(model.get("description")).toBe("Danish wines are horrible.");
										_donedone();
									},
									error : function(_returnModel2) {
										expect(model.id).notToBe(null);
										expect(model.id).toBe(_returnModel2.id);
										expect(model.get("region")).toBe('Copenhagen');
										expect(model.get("country")).toBe("Denmark");
										expect(model.get("description")).toBe("Danish wines are horrible.");
										_donedone();
									}
								});

							}, 10000);

							_done();
						}
					});
				}, 10000);

				done();
			}
		});
	}, 10000);
});


describe('SQLREST: find models', function() {
	it.eventually('*** fetches all models', function(done) {
		var collection = Alloy.createCollection('wine');
		collection.fetch({
			success:function(models){
				expect(collection).notToBe(null);
				expect(collection.length).toBe(2); //this does not need to be true. Depends on your remote server

				//clean up after test
				for (var j = 0; j < collection.length; j++) {
					collection.at(j).destroy();
				}

				done();
			},
			error:function(){
				expect(collection).notToBe(null);
				expect(collection.length).toBe(2); //this does not need to be true. Depends on your remote server

				//clean up after test
				for (var j = 0; j < collection.length; j++) {
					collection.at(j).destroy();
				}

				done();
			}
		});
	}, 10000);
});
