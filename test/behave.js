var suites = [],
	output = [],
	specCount = 0,
	failures = 0,
	successes = 0;
	
//add to log output
function log(text) {
    output.push('[behave] '+text);
}
	
function Suite(descText) {
	this.desc = descText
	this.specs = [];
}

Suite.prototype.evaluate = function(cb) {
	log('Describing '+this.desc+':');
	var executing = false,
		that = this;
		
	var timer = setInterval(function() {
		if (that.specs.length > 0 && !executing) {
    		executing = true;
	    	var s = that.specs.shift();
			s.evaluate(function() {
				executing = false;
			});
	    }
	    else if (that.specs.length === 0 && !executing) {
			clearInterval(timer);
			cb();
	    }
	},50);
};

Suite.prototype.addSpec = function(spec) {
	this.specs.push(spec);
};

function Spec(descText, async, timeout) {
	this.desc = descText;
	this.async = async;
	this.timeout = timeout;
	this.expectations = [];
}

Spec.prototype.addExpectation = function(ex) {
	this.expectations.push(ex);
};

Spec.prototype.evaluate = function(cb) {
	log('it '+this.desc);
	specCount++;
	
	if (this.async) {
		var time = 0,
			that = this;
		
		var timer = setInterval(function() {
			if (that.expectations.length > 0 && that.done) {
	    		var ex = that.expectations.shift();
				ex.evaluate();
		    }
		    else if ((that.expectations.length === 0 && that.done) || (time > that.timeout||10000)) {
				clearInterval(timer);
				cb();
		    }
		    
		    time=time+50;
		},50);
	}
	else {
		for (var i = 0, l = this.expectations.length; i<l; i++) {
			var ex = this.expectations[i];
			ex.evaluate();
		}
		cb();
	}
};

function Expectation(v) {
	this.someValue = v;
};

//Matchers
Expectation.prototype.toBe = function(other) {
	this.comparisonText = 'to be';
	this.otherValue = other;
	this.satisfied = this.someValue === this.otherValue;
};

Expectation.prototype.notToBe = function(other) {
	this.comparisonText = 'not to be';
	this.otherValue = other;
	this.satisfied = this.someValue !== this.otherValue;
};

Expectation.prototype.toMatch = function(regex) {
	this.comparisonText = 'to match';
	this.otherValue = regex;
	this.satisfied = regex.test(this.someValue);
};

Expectation.prototype.notToMatch = function(regex) {
	this.comparisonText = 'not to match';
	this.otherValue = regex;
	this.satisfied = !regex.test(this.someValue);
};

Expectation.prototype.evaluate = function() {
	if (this.satisfied) {
		successes++;
		log('I expected '+this.someValue+' '+ this.comparisonText +' '+this.otherValue);
	}
	else {
		failures++;
		log('I incorrectly got '+this.someValue+', when I expected '+this.otherValue);
	}
};

//Configure the global object of a test suite with the necessary functions
exports.andSetup = function(global) {
	//Create the BDD interface on the global object
	global.describe = function(suiteDesc, suiteClosure) {
		//create a new suite object for the scope of the current "describe"
		var SUITE = new Suite(suiteDesc);
		suites.push(SUITE);
		
		//Now, create a new global "it" which has SUITE in scope
		global.it = function(specDesc, specClosure) {
		    var SPEC = new Spec(specDesc);
			SUITE.addSpec(SPEC);
			
			//Now, create a new global "expect" which has SPEC in scope
			global.expect = function(someValue) {
				var ex = new Expectation(someValue);
				SPEC.addExpectation(ex);
				return ex;
			};
			
			//now run spec
			specClosure();
			SPEC.done = true;
		};
		
		//Async specs
		global.it.eventually = function(specDesc, specClosure, timeout) {
			var SPEC = new Spec(specDesc, true, timeout);
			SUITE.addSpec(SPEC);
			
			//Now, create a new global "expect" which has SPEC in scope
			global.expect = function(someValue) {
				var ex = new Expectation(someValue);
				SPEC.addExpectation(ex);
				return ex;
			};
			
			//now run spec
			specClosure(function() {
				SPEC.done = true;
			});
		};
		
		//now run suite
		suiteClosure();
	};
};

//Report on the suites that have been added
exports.run = function() {
	specCount = 0;
	failures = 0;
	successes = 0;
	output = [];
	
    log('');
    log('Oh, behave! Testing in progress...');
    
    var executing = false;
    var timer = setInterval(function() {
    	if (suites.length > 0 && !executing) {
    		executing = true;
	    	var s = suites.shift();
			s.evaluate(function() {
				executing = false;
			});
	    }
	    else if (suites.length === 0 && !executing) {
	    	log('');
		    log('*******************************************');
		    log('* \\o/ T E S T  R U N  C O M P L E T E \\o/ *');
		    log('*******************************************');
			log('You ran '+specCount+' specs with '+failures+' failures and '+successes+' successes.');
					
			//Flush output
			Ti.API.info(output.join('\n'));
			clearInterval(timer);
	    }
    },50);
};