var xml2js = require('xml2js');
var jsonxml = require('jsontoxml');
var request = require('request');

var parser_opts = {
  emptyTag: undefined,
  ignoreAttrs: true,
  explicitArray: false,
  explicitRoot: false
};

// an array of decimal values of unicode characters that create problems 
var bad_chars = [8235, 8206, 8236, 1523];

var xmljson = new xml2js.Parser(parser_opts).parseString;

var defaults = {
  currency: 'ILS',
  creditType: 'RegularCredit',
  validation: 'AutoComm' // this means charge immediately
};

module.exports = function creditguard(env, options) {
  env = env || {};
  if (!env.user) throw new Error('env.user is required');
  if (!env.password) throw new Error('env.password is required');
  if (!env.server) throw new Error('env.server is required');
  if (!env.terminal) throw new Error('env.terminal is required');
  // Make the field mid optional for using as XML API without redirection
  if (env.mid) {
    env.success_url = env.success_url || '';
    env.error_url = env.error_url || '';
    env.cancel_url = env.cancel_url || '';
  }

  options = options || {};
  var verbose = options.verbose;
  var cleanup = options.cleanup;

  var api = {};

  api.call = function(options, callback) {

    var doDeal = set_defaults(options, defaults);

    doDeal.terminalNumber = env.terminal;
    if (env.mid) {
      doDeal.mid = env.mid;
      doDeal.successUrl = env.success_url;
      doDeal.errorUrl = env.error_url;
      doDeal.cancelUrl = env.cancel_url;
    }

    var request_obj = {
      ashrait: {
        request: {
          version: '1001',
          language: env.language || 'eng',
          command: 'doDeal',
          doDeal: doDeal
        }
      }
    };

    send_request(request_obj, callback);

  };

  function send_request(request_obj, callback) {
    var header = "<?xml version='1.0' encoding='ISO-8859-8'?>";
    var request_xml = jsonxml(request_obj, { prettyPrint: true, indent: '    ' });
    request_xml = strip_characters(request_xml);
    request_xml = header.concat(request_xml);
    var req = {
      url: env.server + '/xpo/Relay',
      method: 'post',
      form: {
        user: env.user,
        password: env.password,
        int_in: request_xml
      }
    };

    if (verbose) {
      console.log('------ sending xml request to crediguard ------>');
      console.log(request_xml);
      console.log('<-----------------------------------------------');
    }

    request(req, function(err, res, body) {
      if (err) return callback(err);

      if (res.statusCode !== 200) {
        return callback(new Error('status code ' + res.statusCode));
      }

      if (verbose) {
        console.log('------ got xml response from crediguard ------>');
        console.log(body);
        console.log('<----------------------------------------------');
      }

      xmljson(body, function(err, result) {
        if (err) { 
          err.message +=  "\n\n"+request_xml;
          return callback(err); }

        result = result.response;
        if (!result || result.result.toString() !== '000') {
            var err_msg = result && result.userMessage + ' (' + result.result + '): ' +
                result.message + ' | ' + result.additionalInfo +" REQUEST XML: \n"+ request_xml || '';
            return callback(new Error(err_msg), result);
        }
        if (cleanup) {
          clean(result);
        }
        return callback(null, result.doDeal);
      });
    });
  }


  return api;
};

// recursively remove all empty properties from object
function clean(obj) {
  for (var property in obj) {
    if (obj.hasOwnProperty(property)) {
      if (typeof obj[property] === "object") {
        clean(obj[property]);
      }
      else {
        if(!obj[property]) {
          delete obj[property];
        }
      }
    }
  }
}

function strip_characters(str) {
  var exp = '';
  bad_chars.forEach(function(c) {
    exp += String.fromCharCode(c) + '|';
  });
  var regex = new RegExp(exp, 'g');
  return str.replace(regex, '');
}

function set_defaults(obj) {
  var length = arguments.length;
  if (length < 2 || obj == null) return obj;
  for (var index = 1; index < length; index++) {
    var source = arguments[index],
        keys = Object.keys(source),
        l = keys.length;
    for (var i = 0; i < l; i++) {
      var key = keys[i];
      if (obj[key] === void 0) obj[key] = source[key];
    }
  }
  return obj;
}