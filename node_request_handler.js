"use strict";
/*
 * Copyright 2017 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the
 * License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
exports.__esModule = true;
var events_1 = require("events");
var Http = require("http");
var Url = require("url");
var qs = require("querystring");
var authorization_request_1 = require("@openid/appauth/built/authorization_request");
var logger_1 = require("@openid/appauth/built/logger");
var node_request_handler_1 = require("@openid/appauth/built/node_support/node_request_handler");
// TypeScript typings for `opener` are not correct and do not export it as module
// @ts-ignore
var opener = require("opener");
var ServerEventsEmitter = /** @class */ (function (_super) {
    __extends(ServerEventsEmitter, _super);
    function ServerEventsEmitter() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    ServerEventsEmitter.ON_UNABLE_TO_START = 'unable_to_start';
    ServerEventsEmitter.ON_API_ERROR = 'api_error';
    ServerEventsEmitter.ON_AUTHORIZATION_RESPONSE = 'authorization_response';
    return ServerEventsEmitter;
}(events_1.EventEmitter));
var TwAuthorizationRequest = /** @class */ (function (_super) {
    __extends(TwAuthorizationRequest, _super);
    function TwAuthorizationRequest(request) {
        var rest = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            rest[_i - 1] = arguments[_i];
        }
        var _this = _super.apply(this, __spreadArrays([request], rest)) || this;
        _this.getTokenUri = request.get_token_uri;
        return _this;
    }
    return TwAuthorizationRequest;
}(authorization_request_1.AuthorizationRequest));
exports.TwAuthorizationRequest = TwAuthorizationRequest;
var TwAuthorizationHandler = /** @class */ (function (_super) {
    __extends(TwAuthorizationHandler, _super);
    function TwAuthorizationHandler() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    TwAuthorizationHandler.prototype.performAuthorizationRequest = function (configuration, request) {
        var _this = this;
        var emitter = new ServerEventsEmitter();
        var requestHandler = function (httpRequest, response) {
            if (!httpRequest.url) {
                return;
            }
            var url = Url.parse(httpRequest.url);
            var redirectUrl = Url.parse(request.redirectUri);
            var getTokenUrl = Url.parse(request.getTokenUri);
            var searchParams = new Url.URLSearchParams(url.query || '');
            var error = searchParams.get('error');
            if (error) {
                logger_1.log('error', error);
                var error_description = searchParams.get('error_description');
                response.statusCode = 500;
                response.end(error_description ? error_description : error);
                emitter.emit(ServerEventsEmitter.ON_API_ERROR, { error: error, error_description: error_description });
                return;
            }
            if (url.pathname === getTokenUrl.pathname && httpRequest.method === 'POST') {
                logger_1.log('Handling POST Authorization Request ');
                var body_1 = '';
                httpRequest.on('data', function (data) {
                    body_1 += data.toString();
                }).on('end', function () {
                    var dataObject = qs.parse(body_1);
                    response.end();
                    emitter.emit(ServerEventsEmitter.ON_AUTHORIZATION_RESPONSE, { request: request, response: dataObject });
                });
                return;
            }
            if (url.pathname === redirectUrl.pathname && httpRequest.method === 'GET') {
                logger_1.log('Handling GET Authorization Request ');
                response.end("\n<script>\n  var xhr = new XMLHttpRequest();\n  xhr.open(\"POST\", \"" + getTokenUrl.href + "\");\n  xhr.send(String.prototype.slice.call(window.location.hash, 1));\n  xhr.onload = function() {\n  document.body.append(\"Close window.\")\n  };\n</script>");
            }
        };
        this.authorizationPromise = new Promise(function (resolve, reject) {
            emitter.once(ServerEventsEmitter.ON_UNABLE_TO_START, function () {
                reject("Unable to create HTTP server at port " + _this.httpServerPort);
            });
            emitter.once(ServerEventsEmitter.ON_API_ERROR, function (error) {
                if (server.listening) {
                    server.close();
                }
                reject("API Error " + error.toString());
            });
            emitter.once(ServerEventsEmitter.ON_AUTHORIZATION_RESPONSE, function (result) {
                server.close();
                // resolve pending promise
                resolve(result);
                // complete authorization flow
                _this.completeAuthorizationRequestIfPossible();
            });
        });
        this.authorizationPromise["catch"](function (err) { return console.error(err); });
        var server;
        request.setupCodeVerifier()
            .then(function () {
            server = Http.createServer(requestHandler);
            server.listen(_this.httpServerPort);
            var url = _this.buildRequestUrl(configuration, request);
            logger_1.log('Making a request to ', request, url);
            opener(url);
        })["catch"](function (error) {
            logger_1.log('Something bad happened ', error);
            emitter.emit(ServerEventsEmitter.ON_UNABLE_TO_START);
        });
    };
    return TwAuthorizationHandler;
}(node_request_handler_1.NodeBasedHandler));
exports.TwAuthorizationHandler = TwAuthorizationHandler;
